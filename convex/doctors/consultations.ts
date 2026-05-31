/**
 * A10 — Mutations sobre consultations (rol doctor)
 *
 * - createConsultation: doctor agenda una cita con un paciente asignado
 * - updateConsultationNotes: doctor actualiza doctorNotes y summary
 *
 * Reglas RBAC: requireDoctor + assertPatientAccess garantizan que solo el
 * doctor asignado al paciente puede crear/modificar.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { assertPatientAccess, requireDoctor } from "../lib/rbac";
import { assertStringLength } from "../lib/validation";

const consultationStatusEnum = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const consultationChannelEnum = v.union(
  v.literal("web"),
  v.literal("presential"),
);

// ─────────────────────────────────────────────────────────────────────────────
// createConsultation
// ─────────────────────────────────────────────────────────────────────────────

export const createConsultation = mutation({
  args: {
    patientId: v.id("patients"),
    scheduledAt: v.number(),
    channel: consultationChannelEnum,
    summary: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    consultationId: v.id("consultations"),
  }),
  handler: async (ctx, args) => {
    // RBAC: solo doctor asignado puede agendar
    const doctorProfile = await requireDoctor(ctx);
    const { patient } = await assertPatientAccess(ctx, args.patientId);

    // Obtener doctor row (necesario para doctorId en consultation)
    const doctor = await ctx.db
      .query("doctors")
      .withIndex("by_profileId", (q) => q.eq("profileId", doctorProfile._id))
      .unique();
    if (!doctor) {
      throw new ConvexError({
        code: "DOCTOR_NOT_FOUND",
        message: "Doctor profile sin row en tabla doctors",
      });
    }

    // Validaciones runtime
    if (args.scheduledAt <= Date.now()) {
      throw new ConvexError({
        code: "INVALID_SCHEDULE",
        message: "scheduledAt debe ser una fecha futura",
      });
    }
    if (args.summary !== undefined && args.summary.length > 0) {
      assertStringLength(args.summary, 1, 2000, "summary");
    }

    const consultationId = await ctx.db.insert("consultations", {
      patientId: patient._id,
      doctorId: doctor._id,
      scheduledAt: args.scheduledAt,
      status: "pending",
      channel: args.channel,
      summary: args.summary?.trim() || undefined,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: doctorProfile._id,
      actorType: "doctor",
      action: "CONSULTATION_CREATED",
      targetId: consultationId,
      targetType: "consultation",
      channel: "web",
    });

    // A13: notificar al paciente sobre la nueva consulta
    await ctx.runMutation(internal.notifications.notifications.create, {
      profileId: patient.profileId,
      type: "appointment_scheduled",
      templateParams: {
        date: new Date(args.scheduledAt).toLocaleDateString("es-VE", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      },
      relatedId: consultationId,
    });

    return { success: true, consultationId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// updateConsultationNotes
// ─────────────────────────────────────────────────────────────────────────────

export const updateConsultationNotes = mutation({
  args: {
    consultationId: v.id("consultations"),
    doctorNotes: v.optional(v.string()),
    summary: v.optional(v.string()),
    status: v.optional(consultationStatusEnum),
    followUpAt: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const doctorProfile = await requireDoctor(ctx);

    const consultation = await ctx.db.get(args.consultationId);
    if (!consultation) {
      throw new ConvexError({
        code: "CONSULTATION_NOTE_NOT_FOUND",
        message: "Consulta no encontrada",
      });
    }

    // RBAC: solo el doctor asignado al paciente puede editar
    await assertPatientAccess(ctx, consultation.patientId);

    // Validaciones runtime
    if (args.doctorNotes !== undefined && args.doctorNotes.length > 0) {
      assertStringLength(args.doctorNotes, 1, 5000, "doctorNotes");
    }
    if (args.summary !== undefined && args.summary.length > 0) {
      assertStringLength(args.summary, 1, 2000, "summary");
    }

    const patch: Record<string, unknown> = {};
    if (args.doctorNotes !== undefined) patch.doctorNotes = args.doctorNotes;
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.status !== undefined) patch.status = args.status;
    if (args.followUpAt !== undefined) patch.followUpAt = args.followUpAt;

    if (Object.keys(patch).length === 0) {
      return { success: true };
    }

    await ctx.db.patch(args.consultationId, patch);

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: doctorProfile._id,
      actorType: "doctor",
      action: "CONSULTATION_NOTES_UPDATED",
      targetId: args.consultationId,
      targetType: "consultation",
      channel: "web",
    });

    return { success: true };
  },
});
