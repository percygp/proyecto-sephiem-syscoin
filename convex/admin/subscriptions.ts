import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireAdmin } from "../lib/rbac";

export const listSubscriptions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const patients = await ctx.db.query("patients").collect();
    const result = [];
    for (const p of patients) {
      const profile = await ctx.db.get("profiles", p.profileId);
      const doctor = p.assignedDoctorId ? await ctx.db.get("doctors", p.assignedDoctorId) : null;
      const doctorProfile = doctor ? await ctx.db.get("profiles", doctor.profileId) : null;
      result.push({
        patientId: p._id,
        profileName: profile?.name ?? null,
        profileEmail: profile?.email ?? null,
        profilePhone: profile?.phone ?? null,
        subscriptionStatus: p.subscriptionStatus,
        subscriptionExpiresAt: p.subscriptionExpiresAt,
        doctorName: doctorProfile?.name ?? null,
        onboardingComplete: p.onboardingComplete,
      });
    }
    result.sort((a, b) => {
      const expA = a.subscriptionExpiresAt ?? Infinity;
      const expB = b.subscriptionExpiresAt ?? Infinity;
      return expA - expB;
    });
    return result;
  },
});

export const cancelSubscription = mutation({
  args: {
    patientId: v.id("patients"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const patient = await ctx.db.get("patients", args.patientId);
    if (!patient) {
      throw new ConvexError({ code: "PATIENT_NOT_FOUND", message: "Paciente no existe" });
    }
    await ctx.db.patch("patients", args.patientId, { subscriptionStatus: "suspended" });
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "PATIENT_UPDATED",
      targetId: args.patientId,
      targetType: "patient",
      channel: "web",
    });
    return { success: true };
  },
});

export const extendSubscription = mutation({
  args: {
    patientId: v.id("patients"),
    months: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const patient = await ctx.db.get("patients", args.patientId);
    if (!patient) {
      throw new ConvexError({ code: "PATIENT_NOT_FOUND", message: "Paciente no existe" });
    }
    const now = Date.now();
    // Si el vencimiento actual ya pasó, extender desde `now` (no desde la fecha vencida).
    const currentExpiry = Math.max(patient.subscriptionExpiresAt ?? 0, now);
    const newExpiry = currentExpiry + args.months * 30 * 24 * 60 * 60 * 1000;
    await ctx.db.patch("patients", args.patientId, {
      subscriptionStatus: "active",
      subscriptionExpiresAt: newExpiry,
    });
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "PATIENT_UPDATED",
      targetId: args.patientId,
      targetType: "patient",
      channel: "web",
    });
    return { success: true, newExpiresAt: newExpiry };
  },
});
