/**
 * A10 — Seed de médico de prueba (DEV ONLY)
 *
 * En el flujo real, los doctores los onboardea el admin (A20). Mientras eso
 * no existe, esta función permite:
 *   - upgrade del profile autenticado (rol patient → doctor)
 *   - crear el doctor row asociado
 *   - opcionalmente, asignar este doctor a un paciente existente
 *
 * Ejecutar con:
 *   npx convex run admin/seedDoctor:promoteCallerToDoctor
 *     '{"specialty":"Cardiología","licenseNumber":"MD-12345"}'
 *
 *   npx convex run admin/seedDoctor:assignDoctorToPatient
 *     '{"patientId":"...","doctorId":"..."}'
 *
 * Hace todo desde internalMutations: el dev necesita correrlo desde CLI.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { assertUnique } from "../lib/unique";

// ─────────────────────────────────────────────────────────────────────────────
// listAllProfiles — para conocer IDs antes del promote
// ─────────────────────────────────────────────────────────────────────────────

export const listAllProfiles = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("profiles"),
      role: v.string(),
      name: v.string(),
      email: v.string(),
      walletAddress: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").take(50);
    return profiles.map((p) => ({
      _id: p._id,
      role: p.role,
      name: p.name || "(sin nombre)",
      email: p.email || "(sin email)",
      walletAddress: p.walletAddress,
    }));
  },
});

export const listAllPatients = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("patients"),
      profileId: v.id("profiles"),
      assignedDoctorId: v.optional(v.id("doctors")),
      profileName: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const patients = await ctx.db.query("patients").take(50);
    const result = [];
    for (const p of patients) {
      const profile = await ctx.db.get("profiles", p.profileId);
      result.push({
        _id: p._id,
        profileId: p.profileId,
        assignedDoctorId: p.assignedDoctorId,
        profileName: profile?.name || "(sin nombre)",
      });
    }
    return result;
  },
});

export const listAllDoctors = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("doctors"),
      profileId: v.id("profiles"),
      specialty: v.string(),
      profileName: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const doctors = await ctx.db.query("doctors").take(50);
    const result = [];
    for (const d of doctors) {
      const profile = await ctx.db.get("profiles", d.profileId);
      result.push({
        _id: d._id,
        profileId: d.profileId,
        specialty: d.specialty,
        profileName: profile?.name || "(sin nombre)",
      });
    }
    return result;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// promoteProfileToDoctor — convierte un profile en rol doctor + crea doctor row
// ─────────────────────────────────────────────────────────────────────────────

export const promoteProfileToDoctor = internalMutation({
  args: {
    profileId: v.id("profiles"),
    specialty: v.string(),
    licenseNumber: v.string(),
    bio: v.optional(v.string()),
    maxPatients: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    doctorId: v.id("doctors"),
    previousRole: v.string(),
  }),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get("profiles", args.profileId);
    if (!profile) {
      throw new ConvexError({
        code: "PROFILE_NOT_FOUND",
        message: `profile ${args.profileId} no existe`,
      });
    }

    // Si ya tiene doctor row, no duplicar
    await assertUnique(
      ctx,
      "doctors",
      "by_profileId",
      (q) => q.eq("profileId", args.profileId),
      "Este profile ya está promovido a doctor",
    );

    const previousRole = profile.role;

    // Patch role del profile
    await ctx.db.patch("profiles", args.profileId, { role: "doctor" });

    // Insert doctor row
    const doctorId = await ctx.db.insert("doctors", {
      profileId: args.profileId,
      specialty: args.specialty.trim(),
      licenseNumber: args.licenseNumber.trim(),
      bio: args.bio?.trim() || undefined,
      maxPatients: args.maxPatients ?? 50,
    });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "ROLE_CHANGED",
      targetId: args.profileId,
      targetType: "profile",
      channel: "system",
    });

    return { success: true, doctorId, previousRole };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// assignDoctorToPatient — asigna el doctor al paciente
// ─────────────────────────────────────────────────────────────────────────────

export const assignDoctorToPatient = internalMutation({
  args: {
    patientId: v.id("patients"),
    doctorId: v.id("doctors"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const patient = await ctx.db.get("patients", args.patientId);
    if (!patient) {
      throw new ConvexError({
        code: "PATIENT_NOT_FOUND",
        message: "Patient no existe",
      });
    }
    const doctor = await ctx.db.get("doctors", args.doctorId);
    if (!doctor) {
      throw new ConvexError({
        code: "DOCTOR_NOT_FOUND",
        message: "Doctor no existe",
      });
    }

    await ctx.db.patch("patients", args.patientId, { assignedDoctorId: args.doctorId });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "PATIENT_UPDATED",
      targetId: args.patientId,
      targetType: "patient",
      channel: "system",
    });

    return { success: true };
  },
});
