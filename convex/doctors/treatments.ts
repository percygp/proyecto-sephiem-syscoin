/**
 * A10 — Mutations sobre treatments (rol doctor)
 *
 * - createTreatment: doctor prescribe un tratamiento al paciente asignado.
 * - updateTreatmentStatus: doctor cambia el status (active/completed/suspended).
 *
 * RBAC: requireDoctor + assertPatientAccess.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { assertPatientAccess, requireDoctor } from "../lib/rbac";
import { assertStringLength, assertDateOfBirth } from "../lib/validation";

const treatmentStatusEnum = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("suspended"),
);

// ─────────────────────────────────────────────────────────────────────────────
// createTreatment
// ─────────────────────────────────────────────────────────────────────────────

export const createTreatment = mutation({
  args: {
    patientId: v.id("patients"),
    consultationId: v.optional(v.id("consultations")),
    diagnosis: v.string(),
    description: v.optional(v.string()),
    startDate: v.string(), // ISO date
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    treatmentId: v.id("treatments"),
  }),
  handler: async (ctx, args) => {
    const doctorProfile = await requireDoctor(ctx);
    const { patient } = await assertPatientAccess(ctx, args.patientId);

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
    assertStringLength(args.diagnosis, 2, 500, "diagnosis");
    if (args.description !== undefined && args.description.length > 0) {
      assertStringLength(args.description, 1, 2000, "description");
    }
    if (args.notes !== undefined && args.notes.length > 0) {
      assertStringLength(args.notes, 1, 2000, "notes");
    }
    // startDate debe ser ISO date válida (puede ser hoy o pasada — backfill)
    assertDateOfBirth(args.startDate, "startDate");
    if (args.endDate !== undefined && args.endDate.length > 0) {
      assertDateOfBirth(args.endDate, "endDate");
    }

    // Si se referencia una consultationId, validar que pertenezca al patient
    if (args.consultationId) {
      const cons = await ctx.db.get("consultations", args.consultationId);
      if (!cons || cons.patientId !== patient._id) {
        throw new ConvexError({
          code: "CONSULTATION_MISMATCH",
          message: "consultationId no corresponde al paciente indicado",
        });
      }
    }

    const treatmentId = await ctx.db.insert("treatments", {
      patientId: patient._id,
      doctorId: doctor._id,
      consultationId: args.consultationId,
      diagnosis: args.diagnosis.trim(),
      description: args.description?.trim() || undefined,
      status: "active",
      startDate: args.startDate,
      endDate: args.endDate || undefined,
      notes: args.notes?.trim() || undefined,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: doctorProfile._id,
      actorType: "doctor",
      action: "TREATMENT_CREATED",
      targetId: treatmentId,
      targetType: "treatment",
      channel: "web",
    });

    return { success: true, treatmentId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// updateTreatmentStatus
// ─────────────────────────────────────────────────────────────────────────────

export const updateTreatmentStatus = mutation({
  args: {
    treatmentId: v.id("treatments"),
    status: treatmentStatusEnum,
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const doctorProfile = await requireDoctor(ctx);

    const treatment = await ctx.db.get("treatments", args.treatmentId);
    if (!treatment) {
      throw new ConvexError({
        code: "TREATMENT_NOT_FOUND",
        message: "Tratamiento no encontrado",
      });
    }
    await assertPatientAccess(ctx, treatment.patientId);

    if (args.notes !== undefined && args.notes.length > 0) {
      assertStringLength(args.notes, 1, 2000, "notes");
    }
    if (args.endDate !== undefined && args.endDate.length > 0) {
      assertDateOfBirth(args.endDate, "endDate");
    }

    const patch: Record<string, unknown> = { status: args.status };
    if (args.endDate !== undefined) patch.endDate = args.endDate;
    if (args.notes !== undefined) patch.notes = args.notes;
    await ctx.db.patch("treatments", args.treatmentId, patch);

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: doctorProfile._id,
      actorType: "doctor",
      action: "TREATMENT_UPDATED",
      targetId: args.treatmentId,
      targetType: "treatment",
      channel: "web",
    });

    return { success: true };
  },
});
