/**
 * B5 (VAL-49) — Datos sintéticos para staging (SIN PHI real).
 *
 * Implementado como internalMutation (no script tsx) para ser ejecutable y
 * verificable sin admin key:  `npx convex run maintenance/seedTestData:seedTestData`
 *
 * Idempotente: si ya existe el perfil sentinel `test|spec-1`, no inserta nada.
 * Todos los datos son claramente sintéticos (emails @test.sephiem.com,
 * licencias TEST-LIC-*, jurisdiction "Testland", pacientes isFictional=true).
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function testWallet(i: number): string {
  return "0x" + i.toString(16).padStart(40, "0");
}

const SPECIALISTS = [
  { specialty: "Cardiología", fee: "10.00", years: 8 },
  { specialty: "Dermatología", fee: "15.00", years: 5 },
  { specialty: "Pediatría", fee: "20.00", years: 12 },
];

export const seedTestData = internalMutation({
  args: {},
  returns: v.object({
    skipped: v.boolean(),
    specialists: v.number(),
    patients: v.number(),
    slots: v.number(),
    reviews: v.number(),
  }),
  handler: async (ctx) => {
    // Idempotencia.
    const sentinel = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", "test|spec-1"))
      .unique();
    if (sentinel) {
      return { skipped: true, specialists: 0, patients: 0, slots: 0, reviews: 0 };
    }

    const now = Date.now();
    let slotsCount = 0;
    let reviewsCount = 0;

    // ── Especialistas (perfil doctor + marketplaceSpecialists verificados) ──
    const specialistIds = [];
    for (let i = 0; i < SPECIALISTS.length; i++) {
      const s = SPECIALISTS[i];
      const profileId = await ctx.db.insert("profiles", {
        tokenIdentifier: `test|spec-${i + 1}`,
        walletAddress: testWallet(i + 1),
        role: "doctor",
        name: `Dra. Test ${i + 1}`,
        email: `spec${i + 1}@test.sephiem.com`,
        isActive: true,
      });
      const specialistId = await ctx.db.insert("marketplaceSpecialists", {
        profileId,
        licenseNumber: `TEST-LIC-00${i + 1}`,
        jurisdiction: "Testland",
        walletAddress: testWallet(100 + i + 1),
        isVerifiedByAdmin: true,
        specialty: s.specialty,
        description: `Especialista sintético de prueba (${s.specialty}).`,
        consultationFeeSYS: s.fee,
        yearsOfExperience: s.years,
        createdAt: now,
        updatedAt: now,
      });
      specialistIds.push(specialistId);

      // Disponibilidad Lun-Vie 09:00-12:00.
      for (let d = 1; d <= 5; d++) {
        await ctx.db.insert("specialistAvailability", {
          specialistId,
          dayOfWeek: d,
          startTime: "09:00",
          endTime: "12:00",
          isActive: true,
        });
      }

      // Slots futuros disponibles (mañana 09:00/09:30/10:00) para booking inmediato.
      for (let k = 0; k < 3; k++) {
        const start = now + DAY + k * 30 * 60 * 1000;
        await ctx.db.insert("appointmentSlots", {
          specialistId,
          startTime: start,
          endTime: start + 30 * 60 * 1000,
          status: "available",
          createdAt: now,
        });
        slotsCount++;
      }
    }

    // ── Pacientes ficticios ──
    const patientIds = [];
    for (let i = 0; i < 5; i++) {
      const profileId = await ctx.db.insert("profiles", {
        tokenIdentifier: `test|pat-${i + 1}`,
        walletAddress: testWallet(200 + i + 1),
        role: "patient",
        name: `Paciente Test ${i + 1}`,
        email: `pat${i + 1}@test.sephiem.com`,
        isActive: true,
      });
      const patientId = await ctx.db.insert("patients", {
        profileId,
        subscriptionStatus: "active",
        subscriptionExpiresAt: now + 30 * DAY,
        onboardingComplete: true,
        dateOfBirth: "1990-01-01",
        isFictional: true,
      });
      patientIds.push({ patientId, profileId });
    }

    // ── 2 reseñas sobre el especialista 1 (cita completada → review) ──
    for (let r = 0; r < 2; r++) {
      const start = now - (2 + r) * DAY;
      const slotId = await ctx.db.insert("appointmentSlots", {
        specialistId: specialistIds[0],
        startTime: start,
        endTime: start + 30 * 60 * 1000,
        status: "completed",
        patientId: patientIds[r].patientId,
        createdAt: start,
      });
      const appointmentId = await ctx.db.insert("appointments", {
        specialistId: specialistIds[0],
        patientId: patientIds[r].patientId,
        slotId,
        startTime: start,
        endTime: start + 30 * 60 * 1000,
        status: "completed",
        completedAt: start + HOUR,
        amountPaidSYS: SPECIALISTS[0].fee,
        createdAt: start,
      });
      await ctx.db.insert("specialistReviews", {
        appointmentId,
        specialistId: specialistIds[0],
        patientProfileId: patientIds[r].profileId,
        rating: r === 0 ? 5 : 4,
        createdAt: now,
      });
      reviewsCount++;
    }

    return {
      skipped: false,
      specialists: specialistIds.length,
      patients: patientIds.length,
      slots: slotsCount,
      reviews: reviewsCount,
    };
  },
});
