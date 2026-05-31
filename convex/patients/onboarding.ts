/**
 * A9 — Onboarding del paciente
 *
 * Flujo:
 *  1. Usuario ya pasó por verificación de wallet (A4) → profile existe.
 *  2. Frontend muestra form de onboarding.
 *  3. Llama completeOnboarding con datos personales.
 *  4. Mutation crea row en `patients` con isFictional=true,
 *     pending_payment, onboardingComplete=true.
 *  5. Profile se actualiza con name/email/phone.
 *  6. AuditLog PATIENT_CREATED.
 *  7. Frontend dispara grantConsent x4 (otra mutation).
 *
 * Una vez completado, App.tsx deja de mostrar la vista de onboarding y
 * abre el dashboard.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAuth } from "../lib/rbac";
import { assertUnique } from "../lib/unique";
import {
  assertStringLength,
  assertEmail,
  assertE164Phone,
  assertDateOfBirth,
  assertBoundedStringArray,
} from "../lib/validation";

// ─────────────────────────────────────────────────────────────────────────────
// completeOnboarding
// ─────────────────────────────────────────────────────────────────────────────

export const completeOnboarding = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    dateOfBirth: v.string(), // ISO YYYY-MM-DD
    bloodType: v.optional(v.string()),
    allergies: v.optional(v.array(v.string())),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    patientId: v.id("patients"),
  }),
  handler: async (ctx, args) => {
    // 1. Auth — profile debe existir (creado en A4 al verificar wallet)
    const profile = await requireAuth(ctx);

    // 2. Validaciones runtime
    assertStringLength(args.name, 2, 100, "name");
    assertEmail(args.email, "email");
    if (args.phone !== undefined && args.phone.length > 0) {
      assertE164Phone(args.phone, "phone");
    }
    assertDateOfBirth(args.dateOfBirth, "dateOfBirth");
    if (args.bloodType !== undefined && args.bloodType.length > 0) {
      assertStringLength(args.bloodType, 1, 10, "bloodType");
    }
    if (args.allergies && args.allergies.length > 0) {
      assertBoundedStringArray(args.allergies, "allergies", 50, 100);
    }
    if (
      args.emergencyContactName !== undefined &&
      args.emergencyContactName.length > 0
    ) {
      assertStringLength(args.emergencyContactName, 2, 100, "emergencyContactName");
    }
    if (
      args.emergencyContactPhone !== undefined &&
      args.emergencyContactPhone.length > 0
    ) {
      assertE164Phone(args.emergencyContactPhone, "emergencyContactPhone");
    }

    // 3. Unicidad: solo 1 patient por profileId
    await assertUnique(
      ctx,
      "patients",
      "by_profileId",
      (q) => q.eq("profileId", profile._id),
      "Ya completaste onboarding. Solo puedes tener un perfil de paciente.",
    );

    // 4. Patch profile: name / email / phone
    await ctx.db.patch(profile._id, {
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      phone: args.phone?.trim() || undefined,
    });

    // 5. Insert patient
    const patientId = await ctx.db.insert("patients", {
      profileId: profile._id,
      subscriptionStatus: "pending_payment",
      onboardingComplete: true,
      dateOfBirth: args.dateOfBirth,
      bloodType: args.bloodType?.trim() || undefined,
      allergies: args.allergies && args.allergies.length > 0
        ? args.allergies.map((a) => a.trim()) : undefined,
      emergencyContactName: args.emergencyContactName?.trim() || undefined,
      emergencyContactPhone: args.emergencyContactPhone?.trim() || undefined,
      isFictional: true, // prototipo: todos los datos son ficticios
    });

    // 6. AuditLog
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: "patient",
      action: "PATIENT_CREATED",
      targetId: patientId,
      targetType: "patient",
      channel: "web",
    });

    return { success: true, patientId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getMyPatient — query para que la UI sepa si ya completó onboarding
// ─────────────────────────────────────────────────────────────────────────────

export const getMyPatient = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("patients"),
      _creationTime: v.number(),
      profileId: v.id("profiles"),
      subscriptionStatus: v.string(),
      subscriptionExpiresAt: v.optional(v.number()),
      onboardingComplete: v.boolean(),
      dateOfBirth: v.string(),
      bloodType: v.optional(v.string()),
      allergies: v.optional(v.array(v.string())),
      emergencyContactName: v.optional(v.string()),
      emergencyContactPhone: v.optional(v.string()),
      isFictional: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    // Silencioso: si no hay auth o no hay profile, retorna null
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!profile) return null;

    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) return null;

    return {
      _id: patient._id,
      _creationTime: patient._creationTime,
      profileId: patient.profileId,
      subscriptionStatus: patient.subscriptionStatus,
      subscriptionExpiresAt: patient.subscriptionExpiresAt,
      onboardingComplete: patient.onboardingComplete,
      dateOfBirth: patient.dateOfBirth,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      isFictional: patient.isFictional,
    };
  },
});
