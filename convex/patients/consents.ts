/**
 * A9 — Consents del paciente
 *
 * 4 tipos posibles (definidos en schema.ts):
 *   - terms
 *   - whatsapp_notifications
 *   - data_processing
 *   - ai_interaction
 *
 * Patrón upsert por (patientId, consentType): si ya existe registro lo
 * patchea, si no inserta. Una sola fila por (patient, tipo).
 *
 * Cada cambio registra auditLog CONSENT_GRANTED / CONSENT_REVOKED.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireAuth } from "../lib/rbac";

const consentTypeEnum = v.union(
  v.literal("terms"),
  v.literal("whatsapp_notifications"),
  v.literal("data_processing"),
  v.literal("ai_interaction"),
);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: encontrar patient del caller (o lanzar)
// ─────────────────────────────────────────────────────────────────────────────

async function getCallerPatient(ctx: any) {
  const profile = await requireAuth(ctx);
  const patient = await ctx.db
    .query("patients")
    .withIndex("by_profileId", (q: any) => q.eq("profileId", profile._id))
    .unique();
  if (!patient) {
    throw new ConvexError({
      code: "PATIENT_NOT_FOUND",
      message: "Completa el onboarding antes de gestionar consentimientos",
    });
  }
  return { profile, patient };
}

// ─────────────────────────────────────────────────────────────────────────────
// grantConsent — patient otorga un consent
// ─────────────────────────────────────────────────────────────────────────────

export const grantConsent = mutation({
  args: {
    consentType: consentTypeEnum,
    documentVersion: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    consentId: v.id("consents"),
  }),
  handler: async (ctx, args) => {
    const { profile, patient } = await getCallerPatient(ctx);
    const now = Date.now();

    // Buscar consent existente (patientId + consentType)
    const existing = await ctx.db
      .query("consents")
      .withIndex("by_patientId_and_consentType", (q) =>
        q.eq("patientId", patient._id).eq("consentType", args.consentType),
      )
      .unique();

    let consentId: import("../_generated/dataModel").Id<"consents">;
    if (existing) {
      await ctx.db.patch("consents", existing._id, {
        granted: true,
        grantedAt: now,
        revokedAt: undefined,
        documentVersion: args.documentVersion,
      });
      consentId = existing._id;
    } else {
      consentId = await ctx.db.insert("consents", {
        patientId: patient._id,
        consentType: args.consentType,
        granted: true,
        grantedAt: now,
        documentVersion: args.documentVersion,
      });
    }

    // AuditLog
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: "patient",
      action: "CONSENT_GRANTED",
      targetId: consentId,
      channel: "web",
    });

    return { success: true, consentId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// revokeConsent — patient revoca un consent existente
// ─────────────────────────────────────────────────────────────────────────────

export const revokeConsent = mutation({
  args: {
    consentType: consentTypeEnum,
  },
  returns: v.object({
    success: v.boolean(),
    consentId: v.id("consents"),
  }),
  handler: async (ctx, args) => {
    const { profile, patient } = await getCallerPatient(ctx);

    const existing = await ctx.db
      .query("consents")
      .withIndex("by_patientId_and_consentType", (q) =>
        q.eq("patientId", patient._id).eq("consentType", args.consentType),
      )
      .unique();

    if (!existing) {
      throw new ConvexError({
        code: "CONSENT_NOT_FOUND",
        message: `No existe consent '${args.consentType}' para revocar`,
      });
    }

    await ctx.db.patch("consents", existing._id, {
      granted: false,
      revokedAt: Date.now(),
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: "patient",
      action: "CONSENT_REVOKED",
      targetId: existing._id,
      channel: "web",
    });

    return { success: true, consentId: existing._id };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getMyConsents — query para que la UI muestre estado de los 4 consents
// ─────────────────────────────────────────────────────────────────────────────

export const getMyConsents = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("consents"),
      _creationTime: v.number(),
      consentType: v.string(),
      granted: v.boolean(),
      grantedAt: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
      documentVersion: v.string(),
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
    if (!profile) return [];

    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) return [];

    const consents = await ctx.db
      .query("consents")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .take(20);

    return consents.map((c) => ({
      _id: c._id,
      _creationTime: c._creationTime,
      consentType: c.consentType,
      granted: c.granted,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
      documentVersion: c.documentVersion,
    }));
  },
});
