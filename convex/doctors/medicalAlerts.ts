/**
 * A13 — Medical Alerts
 *
 * Alertas clínicas con CATEGORÍAS CERRADAS. Sin texto libre con PHI.
 *  - alertCategory: 6 valores enum (definidos en schema)
 *  - alertCode: identificador corto técnico (ej: "PAIN_LEVEL_8")
 *  - triggerMessageId: referencia al mensaje origen (el contenido vive
 *    en messages, accesible solo via RBAC)
 *
 * Flujo:
 *  - createMedicalAlert: doctor o sistema/hermes crea alerta
 *    + notification al doctor asignado (vía internal.notifications.create)
 *    + audit HERMES_ESCALATION
 *  - acknowledgeAlert: doctor marca como leída
 *  - resolveAlert: doctor marca como resuelta
 *  - listMyAlerts: doctor lista alertas asignadas + filtro por status
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { assertPatientAccess, requireDoctor } from "../lib/rbac";
import { assertStringLength } from "../lib/validation";

const alertCategoryEnum = v.union(
  v.literal("pain_reported"),
  v.literal("emergency_keywords"),
  v.literal("doctor_requested"),
  v.literal("mood_decline"),
  v.literal("medication_concern"),
  v.literal("other"),
);

const severityEnum = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

// ─────────────────────────────────────────────────────────────────────────────
// internal.createFromHermes — para que A18 (Hermes) lo invoque
// ─────────────────────────────────────────────────────────────────────────────

export const createFromHermes = internalMutation({
  args: {
    patientId: v.id("patients"),
    severity: severityEnum,
    alertCategory: alertCategoryEnum,
    alertCode: v.string(),
    triggerMessageId: v.optional(v.id("messages")),
  },
  returns: v.object({
    alertId: v.id("medicalAlerts"),
    notified: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    alertId: import("../_generated/dataModel").Id<"medicalAlerts">;
    notified: boolean;
  }> => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      throw new ConvexError({
        code: "PATIENT_NOT_FOUND",
        message: "Paciente no existe",
      });
    }
    if (!patient.assignedDoctorId) {
      // Sin doctor asignado no podemos crear la alerta (schema requiere doctorId).
      // En A18 (Hermes) o A20 (admin) habrá lógica para escalar a un doctor
      // "on-call" o al admin. Por ahora rechazamos.
      throw new ConvexError({
        code: "NO_DOCTOR_ASSIGNED",
        message:
          "Paciente sin médico asignado: no se puede crear alerta. Asignar primero.",
      });
    }

    const alertId = await ctx.db.insert("medicalAlerts", {
      patientId: args.patientId,
      doctorId: patient.assignedDoctorId,
      triggeredBy: "hermes",
      severity: args.severity,
      alertCategory: args.alertCategory,
      alertCode: args.alertCode,
      triggerMessageId: args.triggerMessageId,
      status: "open",
      escalationCount: 0,
    });

    // Notificar al doctor
    const doctor = await ctx.db.get(patient.assignedDoctorId);
    if (doctor) {
      await ctx.runMutation(internal.notifications.notifications.create, {
        profileId: doctor.profileId,
        type: "hermes_alert",
        relatedId: alertId,
      });
    }

    // AuditLog HERMES_ESCALATION
    await ctx.runMutation(internal.audit.log, {
      actorType: "hermes",
      action: "HERMES_ESCALATION",
      targetId: alertId,
      channel: "system",
    });

    return { alertId, notified: doctor !== null };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// createByDoctor — doctor crea alerta manualmente (autoasignada)
// ─────────────────────────────────────────────────────────────────────────────

export const createByDoctor = mutation({
  args: {
    patientId: v.id("patients"),
    severity: severityEnum,
    alertCategory: alertCategoryEnum,
    alertCode: v.string(),
    triggerMessageId: v.optional(v.id("messages")),
  },
  returns: v.object({
    success: v.boolean(),
    alertId: v.id("medicalAlerts"),
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
        message: "Doctor row no encontrado",
      });
    }

    assertStringLength(args.alertCode, 1, 50, "alertCode");

    const alertId = await ctx.db.insert("medicalAlerts", {
      patientId: patient._id,
      doctorId: doctor._id,
      triggeredBy: "patient",
      severity: args.severity,
      alertCategory: args.alertCategory,
      alertCode: args.alertCode,
      triggerMessageId: args.triggerMessageId,
      status: "open",
      escalationCount: 0,
    });

    // Notificar al paciente
    await ctx.runMutation(internal.notifications.notifications.create, {
      profileId: patient.profileId,
      type: "hermes_alert",
      relatedId: alertId,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: doctorProfile._id,
      actorType: "doctor",
      action: "HERMES_ESCALATION",
      targetId: alertId,
      channel: "web",
    });

    return { success: true, alertId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// acknowledgeAlert
// ─────────────────────────────────────────────────────────────────────────────

export const acknowledgeAlert = mutation({
  args: {
    alertId: v.id("medicalAlerts"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const doctorProfile = await requireDoctor(ctx);
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw new ConvexError({
        code: "ALERT_NOT_FOUND",
        message: "Alerta no existe",
      });
    }
    // Doctor debe ser el asignado a la alerta
    const doctor = await ctx.db
      .query("doctors")
      .withIndex("by_profileId", (q) => q.eq("profileId", doctorProfile._id))
      .unique();
    if (!doctor || alert.doctorId !== doctor._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Esta alerta no te corresponde",
      });
    }
    if (alert.status !== "open") {
      return { success: true }; // idempotente
    }
    await ctx.db.patch(args.alertId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveAlert
// ─────────────────────────────────────────────────────────────────────────────

export const resolveAlert = mutation({
  args: {
    alertId: v.id("medicalAlerts"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const doctorProfile = await requireDoctor(ctx);
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw new ConvexError({
        code: "ALERT_NOT_FOUND",
        message: "Alerta no existe",
      });
    }
    const doctor = await ctx.db
      .query("doctors")
      .withIndex("by_profileId", (q) => q.eq("profileId", doctorProfile._id))
      .unique();
    if (!doctor || alert.doctorId !== doctor._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Esta alerta no te corresponde",
      });
    }
    if (alert.status === "resolved") {
      return { success: true };
    }
    await ctx.db.patch(args.alertId, {
      status: "resolved",
      resolvedAt: Date.now(),
      acknowledgedAt: alert.acknowledgedAt ?? Date.now(),
    });
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listMyAlerts — alertas asignadas al doctor caller
// ─────────────────────────────────────────────────────────────────────────────

export const listMyAlerts = query({
  args: {
    onlyOpen: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      _id: v.id("medicalAlerts"),
      _creationTime: v.number(),
      patientId: v.id("patients"),
      patientName: v.string(),
      severity: v.string(),
      alertCategory: v.string(),
      alertCode: v.string(),
      status: v.string(),
      acknowledgedAt: v.optional(v.number()),
      resolvedAt: v.optional(v.number()),
      triggerMessageId: v.optional(v.id("messages")),
    }),
  ),
  handler: async (ctx, args) => {
    const doctorProfile = await requireDoctor(ctx);
    const doctor = await ctx.db
      .query("doctors")
      .withIndex("by_profileId", (q) => q.eq("profileId", doctorProfile._id))
      .unique();
    if (!doctor) return [];

    const alerts = args.onlyOpen
      ? await ctx.db
          .query("medicalAlerts")
          .withIndex("by_doctorId_and_status", (q) =>
            q.eq("doctorId", doctor._id).eq("status", "open"),
          )
          .order("desc")
          .take(50)
      : await ctx.db
          .query("medicalAlerts")
          .withIndex("by_doctorId", (q) => q.eq("doctorId", doctor._id))
          .order("desc")
          .take(50);

    const result = [];
    for (const a of alerts) {
      const patient = await ctx.db.get(a.patientId);
      let patientName = "Paciente";
      if (patient) {
        const profile = await ctx.db.get(patient.profileId);
        patientName = profile?.name || patientName;
      }
      result.push({
        _id: a._id,
        _creationTime: a._creationTime,
        patientId: a.patientId,
        patientName,
        severity: a.severity,
        alertCategory: a.alertCategory,
        alertCode: a.alertCode,
        status: a.status,
        acknowledgedAt: a.acknowledgedAt,
        resolvedAt: a.resolvedAt,
        triggerMessageId: a.triggerMessageId,
      });
    }
    return result;
  },
});
