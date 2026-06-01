/**
 * B14 (VAL-58) — Queries de lectura para el frontend de agendamiento.
 *
 * NUNCA exponen walletAddress; txHash se devuelve truncado (12 chars).
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAuth, requireAdmin, getCallerProfile } from "../lib/rbac";
import type { Doc } from "../_generated/dataModel";

function truncTx(txHash?: string): string | undefined {
  return txHash ? txHash.slice(0, 12) + "…" : undefined;
}

const appointmentStatus = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("expired"),
  v.literal("pending_payment_late"),
  v.literal("pending_reschedule"),
  v.literal("credit_issued"),
);

// ── Slots disponibles de un especialista (público) ──────────────────────────
export const getAvailableSlots = query({
  args: { specialistId: v.id("marketplaceSpecialists") },
  returns: v.array(
    v.object({
      _id: v.id("appointmentSlots"),
      startTime: v.number(),
      endTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const slots = await ctx.db
      .query("appointmentSlots")
      .withIndex("by_specialistId_and_status", (q) =>
        q.eq("specialistId", args.specialistId).eq("status", "available"),
      )
      .collect();
    return slots
      .filter((s) => s.startTime > now)
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 100)
      .map((s) => ({ _id: s._id, startTime: s.startTime, endTime: s.endTime }));
  },
});

const appointmentSummary = v.object({
  _id: v.id("appointments"),
  specialistId: v.id("marketplaceSpecialists"),
  specialty: v.string(),
  startTime: v.number(),
  endTime: v.number(),
  status: appointmentStatus,
  amountPaidSYS: v.optional(v.string()),
  txHashTruncated: v.optional(v.string()),
});

async function toSummary(ctx: { db: any }, a: Doc<"appointments">) {
  const specialist = await ctx.db.get("marketplaceSpecialists", a.specialistId);
  return {
    _id: a._id,
    specialistId: a.specialistId,
    specialty: specialist?.specialty ?? "—",
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    amountPaidSYS: a.amountPaidSYS,
    txHashTruncated: truncTx(a.txHash),
  };
}

// ── Citas del paciente (historial) ──────────────────────────────────────────
export const getMyAppointments = query({
  args: {},
  returns: v.array(appointmentSummary),
  handler: async (ctx) => {
    const profile = await getCallerProfile(ctx);
    if (!profile) return [];
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) return [];

    const appts = await ctx.db
      .query("appointments")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .take(50);
    return await Promise.all(appts.map((a) => toSummary(ctx, a)));
  },
});

// ── Estado de una cita (polling de la pantalla de pago) ─────────────────────
export const getAppointmentById = query({
  args: { appointmentId: v.id("appointments") },
  returns: v.union(appointmentSummary, v.null()),
  handler: async (ctx, args) => {
    const profile = await requireAuth(ctx);
    const appt = await ctx.db.get("appointments", args.appointmentId);
    if (!appt) return null;

    if (profile.role !== "admin") {
      const patient = await ctx.db.get("patients", appt.patientId);
      const specialist = await ctx.db.get("marketplaceSpecialists", appt.specialistId);
      const isOwner = !!patient && patient.profileId === profile._id;
      const isSpecialist = !!specialist && specialist.profileId === profile._id;
      if (!isOwner && !isSpecialist) return null;
    }
    return await toSummary(ctx, appt);
  },
});

// ── Citas con pago tardío en revisión (admin) ───────────────────────────────
export const listLatePaymentAppointments = query({
  args: {},
  returns: v.array(appointmentSummary),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const appts = await ctx.db
      .query("appointments")
      .withIndex("by_status", (q) => q.eq("status", "pending_payment_late"))
      .take(100);
    return await Promise.all(appts.map((a) => toSummary(ctx, a)));
  },
});
