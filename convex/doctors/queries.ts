/**
 * A10 — Queries del rol doctor
 *
 * - getMyDoctor: profile + doctor row del caller (si tiene rol doctor)
 * - listMyPatients: pacientes con assignedDoctorId === caller (con su profile)
 * - getPatientDetail: detalle completo de un paciente asignado
 *
 * Todas pasan por RBAC (requireDoctor / assertPatientAccess).
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireDoctor, assertPatientAccess, getCallerProfile } from "../lib/rbac";

// ─────────────────────────────────────────────────────────────────────────────
// getMyDoctor — profile + doctor row del caller
// ─────────────────────────────────────────────────────────────────────────────

export const getMyDoctor = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("doctors"),
      _creationTime: v.number(),
      profileId: v.id("profiles"),
      specialty: v.string(),
      licenseNumber: v.string(),
      bio: v.optional(v.string()),
      maxPatients: v.number(),
      profile: v.object({
        name: v.string(),
        email: v.string(),
        avatarUrl: v.optional(v.string()),
        walletAddress: v.string(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const profile = await getCallerProfile(ctx);
    if (!profile || profile.role !== "doctor") return null;

    const doctor = await ctx.db
      .query("doctors")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!doctor) return null;

    return {
      _id: doctor._id,
      _creationTime: doctor._creationTime,
      profileId: doctor.profileId,
      specialty: doctor.specialty,
      licenseNumber: doctor.licenseNumber,
      bio: doctor.bio,
      maxPatients: doctor.maxPatients,
      profile: {
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        walletAddress: profile.walletAddress,
      },
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listMyPatients — pacientes asignados al doctor caller
// ─────────────────────────────────────────────────────────────────────────────

export const listMyPatients = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("patients"),
      _creationTime: v.number(),
      subscriptionStatus: v.string(),
      onboardingComplete: v.boolean(),
      dateOfBirth: v.string(),
      bloodType: v.optional(v.string()),
      isFictional: v.boolean(),
      profile: v.object({
        name: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx) => {
    const doctorProfile = await requireDoctor(ctx);

    // Encontrar el doctor row del caller
    const doctor = await ctx.db
      .query("doctors")
      .withIndex("by_profileId", (q) => q.eq("profileId", doctorProfile._id))
      .unique();
    if (!doctor) {
      // El caller es role=doctor pero no tiene row en doctors.
      // (No debería pasar en producción; defensa por si acaso.)
      return [];
    }

    const patients = await ctx.db
      .query("patients")
      .withIndex("by_assignedDoctorId", (q) =>
        q.eq("assignedDoctorId", doctor._id),
      )
      .take(100);

    // Enriquecer cada paciente con datos de su profile.
    const result = [];
    for (const p of patients) {
      const pProfile = await ctx.db.get("profiles", p.profileId);
      if (!pProfile) continue;
      result.push({
        _id: p._id,
        _creationTime: p._creationTime,
        subscriptionStatus: p.subscriptionStatus,
        onboardingComplete: p.onboardingComplete,
        dateOfBirth: p.dateOfBirth,
        bloodType: p.bloodType,
        isFictional: p.isFictional,
        profile: {
          name: pProfile.name,
          email: pProfile.email,
          phone: pProfile.phone,
          avatarUrl: pProfile.avatarUrl,
        },
      });
    }
    return result;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getPatientDetail — detalle completo (consultas + treatments + medications)
// ─────────────────────────────────────────────────────────────────────────────

export const getPatientDetail = query({
  args: {
    patientId: v.id("patients"),
  },
  returns: v.object({
    patient: v.object({
      _id: v.id("patients"),
      subscriptionStatus: v.string(),
      dateOfBirth: v.string(),
      bloodType: v.optional(v.string()),
      allergies: v.optional(v.array(v.string())),
      emergencyContactName: v.optional(v.string()),
      emergencyContactPhone: v.optional(v.string()),
      isFictional: v.boolean(),
      profile: v.object({
        name: v.string(),
        email: v.string(),
        phone: v.optional(v.string()),
        walletAddress: v.string(),
      }),
    }),
    consultations: v.array(
      v.object({
        _id: v.id("consultations"),
        scheduledAt: v.number(),
        status: v.string(),
        channel: v.string(),
        doctorNotes: v.optional(v.string()),
        summary: v.optional(v.string()),
        followUpAt: v.optional(v.number()),
      }),
    ),
    treatments: v.array(
      v.object({
        _id: v.id("treatments"),
        diagnosis: v.string(),
        description: v.optional(v.string()),
        status: v.string(),
        startDate: v.string(),
        endDate: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    activeMedications: v.array(
      v.object({
        _id: v.id("medications"),
        name: v.string(),
        dosage: v.string(),
        frequency: v.string(),
        instructions: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    // RBAC: solo doctor asignado o admin pueden ver
    const { patient } = await assertPatientAccess(ctx, args.patientId);
    const profile = await ctx.db.get("profiles", patient.profileId);
    if (!profile) {
      // No debería pasar: defensa por integridad
      throw new Error("Profile del paciente no encontrado");
    }

    const consultations = await ctx.db
      .query("consultations")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(50);

    const treatments = await ctx.db
      .query("treatments")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .order("desc")
      .take(50);

    const activeMedications = await ctx.db
      .query("medications")
      .withIndex("by_patientId_and_isActive", (q) =>
        q.eq("patientId", args.patientId).eq("isActive", true),
      )
      .take(50);

    return {
      patient: {
        _id: patient._id,
        subscriptionStatus: patient.subscriptionStatus,
        dateOfBirth: patient.dateOfBirth,
        bloodType: patient.bloodType,
        allergies: patient.allergies,
        emergencyContactName: patient.emergencyContactName,
        emergencyContactPhone: patient.emergencyContactPhone,
        isFictional: patient.isFictional,
        profile: {
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          walletAddress: profile.walletAddress,
        },
      },
      consultations: consultations.map((c) => ({
        _id: c._id,
        scheduledAt: c.scheduledAt,
        status: c.status,
        channel: c.channel,
        doctorNotes: c.doctorNotes,
        summary: c.summary,
        followUpAt: c.followUpAt,
      })),
      treatments: treatments.map((t) => ({
        _id: t._id,
        diagnosis: t.diagnosis,
        description: t.description,
        status: t.status,
        startDate: t.startDate,
        endDate: t.endDate,
        notes: t.notes,
      })),
      activeMedications: activeMedications.map((m) => ({
        _id: m._id,
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        instructions: m.instructions,
      })),
    };
  },
});
