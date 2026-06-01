import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireAdmin } from "../lib/rbac";
import { assertUnique } from "../lib/unique";

export const listDoctors = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doctors = await ctx.db.query("doctors").collect();
    const result = [];
    for (const d of doctors) {
      const profile = await ctx.db.get("profiles", d.profileId);
      if (!profile) continue;
      const patientCount = await ctx.db
        .query("patients")
        .withIndex("by_assignedDoctorId", (q) => q.eq("assignedDoctorId", d._id))
        .collect();
      result.push({
        _id: d._id,
        specialty: d.specialty,
        licenseNumber: d.licenseNumber,
        bio: d.bio,
        maxPatients: d.maxPatients,
        profile: {
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          avatarUrl: profile.avatarUrl,
          isActive: profile.isActive,
        },
        patientCount: patientCount.length,
      });
    }
    return result;
  },
});

export const inviteDoctor = mutation({
  args: {
    profileId: v.id("profiles"),
    specialty: v.string(),
    licenseNumber: v.string(),
    bio: v.optional(v.string()),
    maxPatients: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const profile = await ctx.db.get("profiles", args.profileId);
    if (!profile) {
      throw new ConvexError({ code: "PROFILE_NOT_FOUND", message: "Profile no existe" });
    }
    await assertUnique(
      ctx,
      "doctors",
      "by_profileId",
      (q) => q.eq("profileId", args.profileId),
      "Este profile ya es doctor",
    );
    const previousRole = profile.role;
    await ctx.db.patch("profiles", args.profileId, { role: "doctor" });
    const doctorId = await ctx.db.insert("doctors", {
      profileId: args.profileId,
      specialty: args.specialty.trim(),
      licenseNumber: args.licenseNumber.trim(),
      bio: args.bio?.trim() || undefined,
      maxPatients: args.maxPatients ?? 50,
    });
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "ROLE_CHANGED",
      targetId: args.profileId,
      targetType: "profile",
      channel: "web",
    });
    return { success: true, doctorId, previousRole };
  },
});

export const deactivateDoctor = mutation({
  args: {
    doctorId: v.id("doctors"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const doctor = await ctx.db.get("doctors", args.doctorId);
    if (!doctor) {
      throw new ConvexError({ code: "DOCTOR_NOT_FOUND", message: "Doctor no existe" });
    }
    const profile = await ctx.db.get("profiles", doctor.profileId);
    if (profile) {
      await ctx.db.patch("profiles", doctor.profileId, { isActive: false });
    }
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "ROLE_CHANGED",
      targetId: doctor.profileId,
      targetType: "profile",
      channel: "web",
    });
    return { success: true };
  },
});

export const getDoctorStats = query({
  args: { doctorId: v.id("doctors") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const doctor = await ctx.db.get("doctors", args.doctorId);
    if (!doctor) return null;
    const profile = await ctx.db.get("profiles", doctor.profileId);
    const patients = await ctx.db
      .query("patients")
      .withIndex("by_assignedDoctorId", (q) => q.eq("assignedDoctorId", args.doctorId))
      .collect();
    const consultations = await ctx.db
      .query("consultations")
      .withIndex("by_doctorId", (q) => q.eq("doctorId", args.doctorId))
      .collect();
    const activePatients = patients.filter((p) => p.subscriptionStatus === "active");
    return {
      doctor: {
        _id: doctor._id,
        specialty: doctor.specialty,
        licenseNumber: doctor.licenseNumber,
        bio: doctor.bio,
        maxPatients: doctor.maxPatients,
        profileName: profile?.name ?? null,
        profileEmail: profile?.email ?? null,
        isActive: profile?.isActive ?? false,
      },
      totalPatients: patients.length,
      activePatients: activePatients.length,
      totalConsultations: consultations.length,
      recentConsultations: consultations
        .filter((c) => c.scheduledAt > Date.now() - 30 * 24 * 60 * 60 * 1000)
        .length,
    };
  },
});
