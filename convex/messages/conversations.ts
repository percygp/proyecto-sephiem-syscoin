/**
 * A11 — Conversations
 *
 * Hilos de chat del portal web. Una conversación por (patientId, type) donde
 * type ∈ { "hermes_patient", "doctor_patient" }.
 *
 * Helpers:
 *  - ensureHermesConversation: patient garantiza tener su conversación con Hermes
 *  - ensureDoctorConversation: patient garantiza tener una con su doctor asignado
 *  - listMyConversations: lista las conversaciones del caller con metadata
 *  - resolveConversationAccess: helper interno que valida que el caller es
 *    participante (patient o doctor de la conversación)
 */
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireAuth } from "../lib/rbac";
import type { Doc, Id } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// Helper interno: valida acceso a conversación. Reutilizable por messages.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que el caller pueda leer/escribir en la conversación dada.
 * Retorna { profile, conversation, patient } para que el caller los use.
 *
 * Reglas:
 *  - admin: acceso a todo
 *  - patient: si conversation.patientId.profileId === caller._id
 *  - doctor: si conversation.doctorId existe y doctor.profileId === caller._id
 */
export async function resolveConversationAccess(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<{
  profile: Doc<"profiles">;
  conversation: Doc<"conversations">;
  patient: Doc<"patients">;
}> {
  const profile = await requireAuth(ctx);
  const conversation = await ctx.db.get("conversations", conversationId);
  if (!conversation) {
    throw new ConvexError({
      code: "CONVERSATION_NOT_FOUND",
      message: "Conversación no existe",
    });
  }
  const patient = await ctx.db.get("patients", conversation.patientId);
  if (!patient) {
    throw new ConvexError({
      code: "PATIENT_NOT_FOUND",
      message: "Paciente de la conversación no existe",
    });
  }

  if (profile.role === "admin") {
    return { profile, conversation, patient };
  }
  if (profile.role === "patient" && patient.profileId === profile._id) {
    return { profile, conversation, patient };
  }
  if (profile.role === "doctor" && conversation.doctorId) {
    const doctor = await ctx.db.get("doctors", conversation.doctorId);
    if (doctor && doctor.profileId === profile._id) {
      return { profile, conversation, patient };
    }
  }

  throw new ConvexError({
    code: "FORBIDDEN",
    message: "No participas en esta conversación",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureHermesConversation — patient crea/recupera su hilo con Hermes
// ─────────────────────────────────────────────────────────────────────────────

export const ensureHermesConversation = mutation({
  args: {},
  returns: v.object({
    conversationId: v.id("conversations"),
    created: v.boolean(),
  }),
  handler: async (ctx) => {
    const profile = await requireAuth(ctx);
    if (profile.role !== "patient") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Solo pacientes pueden iniciar hilos con Hermes",
      });
    }
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) {
      throw new ConvexError({
        code: "PATIENT_NOT_FOUND",
        message: "Completa el onboarding antes de chatear",
      });
    }

    // Idempotente: si ya existe hermes_patient, retornarla
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_patientId_and_type", (q) =>
        q.eq("patientId", patient._id).eq("type", "hermes_patient"),
      )
      .unique();
    if (existing) {
      return { conversationId: existing._id, created: false };
    }

    const conversationId = await ctx.db.insert("conversations", {
      patientId: patient._id,
      doctorId: undefined,
      type: "hermes_patient",
      isActive: true,
      lastMessageAt: Date.now(),
    });
    return { conversationId, created: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ensureDoctorConversation — patient garantiza hilo con su doctor asignado
// ─────────────────────────────────────────────────────────────────────────────

export const ensureDoctorConversation = mutation({
  args: {},
  returns: v.object({
    conversationId: v.id("conversations"),
    created: v.boolean(),
  }),
  handler: async (ctx) => {
    const profile = await requireAuth(ctx);
    if (profile.role !== "patient") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Solo pacientes inician hilos con médico",
      });
    }
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) {
      throw new ConvexError({
        code: "PATIENT_NOT_FOUND",
        message: "Completa el onboarding primero",
      });
    }
    if (!patient.assignedDoctorId) {
      throw new ConvexError({
        code: "NO_DOCTOR_ASSIGNED",
        message: "No tienes médico asignado todavía",
      });
    }

    // Idempotente: una sola doctor_patient por paciente
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_patientId_and_type", (q) =>
        q.eq("patientId", patient._id).eq("type", "doctor_patient"),
      )
      .unique();
    if (existing) {
      return { conversationId: existing._id, created: false };
    }

    const conversationId = await ctx.db.insert("conversations", {
      patientId: patient._id,
      doctorId: patient.assignedDoctorId,
      type: "doctor_patient",
      isActive: true,
      lastMessageAt: Date.now(),
    });
    return { conversationId, created: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listMyConversations — lista de hilos del caller (patient o doctor)
// ─────────────────────────────────────────────────────────────────────────────

export const listMyConversations = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      type: v.string(),
      isActive: v.boolean(),
      lastMessageAt: v.number(),
      counterpartName: v.string(),
      patientId: v.id("patients"),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!profile || !profile.isActive) return [];

    let conversations: Doc<"conversations">[] = [];

    if (profile.role === "patient") {
      const patient = await ctx.db
        .query("patients")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .unique();
      if (!patient) return [];
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
        .take(50);
    } else if (profile.role === "doctor") {
      const doctor = await ctx.db
        .query("doctors")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .unique();
      if (!doctor) return [];
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_doctorId", (q) => q.eq("doctorId", doctor._id))
        .take(100);
    } else {
      // admin
      conversations = await ctx.db.query("conversations").take(50);
    }

    // Enriquecer con nombre del counterpart
    const result = [];
    for (const c of conversations) {
      let counterpartName = "SEPH-AI";
      if (c.type === "doctor_patient" && c.doctorId) {
        if (profile.role === "patient") {
          // Counterpart = doctor
          const doctor = await ctx.db.get("doctors", c.doctorId);
          if (doctor) {
            const docProfile = await ctx.db.get("profiles", doctor.profileId);
            counterpartName = docProfile?.name ?? "Médico";
          }
        } else {
          // Counterpart = patient
          const patient = await ctx.db.get("patients", c.patientId);
          if (patient) {
            const patProfile = await ctx.db.get("profiles", patient.profileId);
            counterpartName = patProfile?.name ?? "Paciente";
          }
        }
      }
      result.push({
        _id: c._id,
        _creationTime: c._creationTime,
        type: c.type,
        isActive: c.isActive,
        lastMessageAt: c.lastMessageAt,
        counterpartName,
        patientId: c.patientId,
      });
    }

    // Orden desc por lastMessageAt
    result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    return result;
  },
});
