/**
 * A3 — Seed inicial del sistema
 *
 * Inserta los registros que deben existir desde el primer deploy:
 *  - systemSettings (configuración global + feature flags B6)
 *  - 14 entradas en productionReadinessChecks (gate de producción)
 *
 * IDEMPOTENTE: re-ejecutar no duplica registros. Usa findExistingOrNull
 * (helper A7) que verifica unicidad transaccional antes de insertar.
 *
 * Ejecutar desde terminal:
 *   npx convex run seed:seedAll
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { findExistingOrNull } from "./lib/unique";

// ─────────────────────────────────────────────────────────────────────────────
// systemSettings
// ─────────────────────────────────────────────────────────────────────────────

// Settings con su valor inicial. Tipos discriminados según schema.
// Cada uno tiene su tipo nativo (boolean/number/string).
const SYSTEM_SETTINGS_SEED = [
  { key: "productionEnabled" as const, value: false },
  { key: "auditLogRetentionDays" as const, value: 730 },
  { key: "patientRetentionMonths" as const, value: 12 },
  {
    key: "productionDisabledReason" as const,
    value: "Initial deployment — Track B pending",
  },
  // A14: counter HD wallet BIP44, empieza en 0
  { key: "nextDerivationIndex" as const, value: 0 },
  // B6 (VAL-50): feature flags Fase 1. Default true en staging.
  // Revisar defaults para producción (gatean módulos aún en construcción).
  { key: "marketplaceEnabled" as const, value: true },
  { key: "appointmentsEnabled" as const, value: true },
  { key: "paymentsEnabled" as const, value: true },
];

export const seedSystemSettings = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let skipped = 0;

    for (const seed of SYSTEM_SETTINGS_SEED) {
      const existing = await findExistingOrNull(
        ctx,
        "systemSettings",
        "by_key",
        (q) => q.eq("key", seed.key),
      );

      if (existing) {
        skipped++;
        continue;
      }

      // El cast es necesario porque el discriminated union requiere
      // que TypeScript correlacione el `key` literal con el tipo de `value`.
      await ctx.db.insert("systemSettings", {
        key: seed.key,
        value: seed.value,
        updatedAt: now,
      } as any);
      inserted++;
    }

    return { inserted, skipped };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// productionReadinessChecks
// ─────────────────────────────────────────────────────────────────────────────

// Lista completa de los 14 checks del PRG.
// Tipados estrictamente con el enum del schema.
const PRG_CHECKS = [
  "convex_dpa",
  "privy_dpa",
  "openai_dpa",
  "twilio_dpa",
  "hosting_dpa",
  "auth_spike_validated",
  "hd_wallet_setup",
  "vps_hardening",
  "hermes_clinical_approval",
  "hermes_redteam_complete",
  "legal_retention_review",
  "incident_response_doc",
  "backup_restore_validated",
  "wallet_sweep_sop",
] as const;

/**
 * Inserta los 14 checks del PRG en status="pending" si no existen.
 * enableProduction() solo permitirá activar productionEnabled cuando los 14
 * estén en status="approved" con evidencia.
 */
export const seedProductionReadinessChecks = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    let inserted = 0;
    let skipped = 0;

    for (const checkKey of PRG_CHECKS) {
      const existing = await findExistingOrNull(
        ctx,
        "productionReadinessChecks",
        "by_checkKey",
        (q) => q.eq("checkKey", checkKey),
      );

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("productionReadinessChecks", {
        checkKey,
        status: "pending",
      });
      inserted++;
    }

    return { inserted, skipped };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Médicos de prueba para el marketplace
// ─────────────────────────────────────────────────────────────────────────────

const TEST_SPECIALISTS = [
  {
    name: "Dr. Carlos Mendoza Ríos",
    email: "c.mendoza@sephiem.demo",
    walletAddress: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    specialty: "Cardiología",
    licenseNumber: "CMP-45231",
    jurisdiction: "Perú",
    consultationFeeSYS: "50",
    description: "Especialista en enfermedades cardiovasculares con enfoque en prevención y tratamiento de arritmias e insuficiencia cardíaca.",
    yearsOfExperience: 15,
  },
  {
    name: "Dra. Ana Torres Villarreal",
    email: "a.torres@sephiem.demo",
    walletAddress: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c",
    specialty: "Neurología",
    licenseNumber: "CMP-38104",
    jurisdiction: "Perú",
    consultationFeeSYS: "60",
    description: "Neuróloga clínica especializada en migraña, epilepsia y trastornos del sueño. Máster en neurociencias aplicadas.",
    yearsOfExperience: 12,
  },
  {
    name: "Dr. Luis García Palomino",
    email: "l.garcia@sephiem.demo",
    walletAddress: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    specialty: "Medicina Interna",
    licenseNumber: "CMP-52018",
    jurisdiction: "Perú",
    consultationFeeSYS: "35",
    description: "Médico internista con amplia experiencia en diagnóstico y manejo de enfermedades crónicas y condiciones complejas.",
    yearsOfExperience: 8,
  },
  {
    name: "Dra. María Quispe Huanca",
    email: "m.quispe@sephiem.demo",
    walletAddress: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e",
    specialty: "Ginecología",
    licenseNumber: "CMP-41756",
    jurisdiction: "Perú",
    consultationFeeSYS: "45",
    description: "Ginecóloga-obstetra con subespecialidad en medicina reproductiva y salud de la mujer en todas las etapas de la vida.",
    yearsOfExperience: 10,
  },
  {
    name: "Dr. Roberto Chávez Sánchez",
    email: "r.chavez@sephiem.demo",
    walletAddress: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f",
    specialty: "Traumatología",
    licenseNumber: "CMP-29843",
    jurisdiction: "Perú",
    consultationFeeSYS: "55",
    description: "Traumatólogo y ortopedista con experiencia en cirugía artroscópica, fracturas complejas y rehabilitación post-quirúrgica.",
    yearsOfExperience: 20,
  },
];

/**
 * Seed de médicos de prueba para el marketplace MVP.
 * Idempotente — omite los que ya existen.
 * npx convex run seed:seedTestSpecialists
 */
export const seedTestSpecialists = internalMutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const results: string[] = [];
    const now = Date.now();

    for (const spec of TEST_SPECIALISTS) {
      const tokenId = `demo:${spec.walletAddress}`;

      // Reusar o crear profile
      let profileId = (
        await ctx.db
          .query("profiles")
          .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenId))
          .unique()
      )?._id;

      if (!profileId) {
        profileId = await ctx.db.insert("profiles", {
          tokenIdentifier: tokenId,
          walletAddress: spec.walletAddress,
          role: "doctor",
          name: spec.name,
          email: spec.email,
          isActive: true,
        });
      }

      // Omitir si ya está en marketplace
      const existing = await ctx.db
        .query("marketplaceSpecialists")
        .withIndex("by_profileId", (q) => q.eq("profileId", profileId!))
        .unique();

      if (existing) {
        results.push(`SKIP: ${spec.name}`);
        continue;
      }

      await ctx.db.insert("marketplaceSpecialists", {
        profileId: profileId!,
        licenseNumber: spec.licenseNumber,
        jurisdiction: spec.jurisdiction,
        walletAddress: spec.walletAddress,
        isVerifiedByAdmin: true,
        isVerifiedOnChain: true,
        specialty: spec.specialty,
        description: spec.description,
        consultationFeeSYS: spec.consultationFeeSYS,
        yearsOfExperience: spec.yearsOfExperience,
        createdAt: now,
        updatedAt: now,
      });
      results.push(`INSERT: ${spec.name} — ${spec.specialty}`);
    }

    return results;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Orquestador
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ejecuta ambos seeds en orden. Llamar UNA sola vez tras el primer deploy.
 * Idempotente: re-correr no inserta duplicados.
 *
 * Ejecución manual:
 *   npx convex run seed:seedAll
 */
export const seedAll = internalMutation({
  args: {},
  returns: v.object({
    settings: v.object({
      inserted: v.number(),
      skipped: v.number(),
    }),
    prgChecks: v.object({
      inserted: v.number(),
      skipped: v.number(),
    }),
  }),
  handler: async (ctx): Promise<{
    settings: { inserted: number; skipped: number };
    prgChecks: { inserted: number; skipped: number };
  }> => {
    const settings = await ctx.runMutation(
      internal.seed.seedSystemSettings,
      {},
    );
    const prgChecks = await ctx.runMutation(
      internal.seed.seedProductionReadinessChecks,
      {},
    );
    return { settings, prgChecks };
  },
});
