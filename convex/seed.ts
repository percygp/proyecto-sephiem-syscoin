/**
 * A3 — Seed inicial del sistema
 *
 * Inserta los registros que deben existir desde el primer deploy:
 *  - 4 entradas en systemSettings (configuración global)
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
