/**
 * A19 — Dashboard de salud del paciente
 *
 * getPatientDashboard: agrega en una sola query la info principal del dashboard
 * "Mi salud": próxima cita, estado suscripción, último check-in Hermes,
 * alertas activas (count), consultas recientes.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getCallerProfile } from "../lib/rbac";

export const getPatientDashboard = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      patient: v.object({
        subscriptionStatus: v.string(),
        subscriptionExpiresAt: v.optional(v.number()),
        bloodType: v.optional(v.string()),
        allergiesCount: v.number(),
        onboardingComplete: v.boolean(),
      }),
      nextAppointment: v.union(
        v.null(),
        v.object({
          _id: v.id("appointments"),
          specialistId: v.id("marketplaceSpecialists"),
          specialty: v.string(),
          startTime: v.number(),
          status: v.string(),
        }),
      ),
      lastHermesCheckin: v.union(
        v.null(),
        v.object({
          updatedAt: v.number(),
          lastReportedMood: v.optional(v.string()),
          totalInteractions: v.number(),
        }),
      ),
      activeAlertsCount: v.number(),
      recentConsultations: v.array(
        v.object({
          _id: v.id("consultations"),
          scheduledAt: v.number(),
          status: v.string(),
          summary: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const profile = await getCallerProfile(ctx);
    if (!profile) return null;

    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) return null;

    const now = Date.now();

    // Next upcoming appointment
    const upcomingAppts = await ctx.db
      .query("appointments")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .order("asc")
      .collect();

    const nextAppt = upcomingAppts.find(
      (a) => a.startTime > now && (a.status === "confirmed" || a.status === "pending"),
    ) ?? null;

    let nextAppointment = null;
    if (nextAppt) {
      const specialist = await ctx.db.get("marketplaceSpecialists", nextAppt.specialistId);
      nextAppointment = {
        _id: nextAppt._id,
        specialistId: nextAppt.specialistId,
        specialty: specialist?.specialty ?? "—",
        startTime: nextAppt.startTime,
        status: nextAppt.status,
      };
    }

    // Last Hermes check-in
    const hermesState = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .unique();

    const lastHermesCheckin = hermesState
      ? {
          updatedAt: hermesState.updatedAt,
          lastReportedMood: hermesState.lastReportedMood,
          totalInteractions: hermesState.totalInteractions,
        }
      : null;

    // Active medical alerts count
    const patientAlerts = await ctx.db
      .query("medicalAlerts")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .collect();
    const activeAlerts = patientAlerts.filter((a) => a.status === "open");

    // Recent consultations (last 3)
    const consultations = await ctx.db
      .query("consultations")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .take(3);

    return {
      patient: {
        subscriptionStatus: patient.subscriptionStatus,
        subscriptionExpiresAt: patient.subscriptionExpiresAt,
        bloodType: patient.bloodType,
        allergiesCount: patient.allergies?.length ?? 0,
        onboardingComplete: patient.onboardingComplete,
      },
      nextAppointment,
      lastHermesCheckin,
      activeAlertsCount: activeAlerts.length,
      recentConsultations: consultations.map((c) => ({
        _id: c._id,
        scheduledAt: c.scheduledAt,
        status: c.status,
        summary: c.summary,
      })),
    };
  },
});
