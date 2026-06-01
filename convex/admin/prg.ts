/**
 * A8 — Production Readiness Gate (PRG)
 *
 * Tres mutations que actúan como gate técnico de producción:
 *   - updatePRGCheck   → admin actualiza el estado de un check con evidencia
 *   - enableProduction → admin activa producción SI los 14 checks están approved
 *   - disableProduction→ admin desactiva producción con razón obligatoria
 *
 * Más dos queries de inspección (ya existían):
 *   - listPRGStatus      → lista los 14 checks (admin)
 *   - isProductionEnabled→ flag + cuenta de checks aprobados/pendientes (admin)
 *
 * Todas usan helpers de A5 (requireAdmin), A6 (internal.audit.log) y siguen
 * el patrón de validación runtime: evidence obligatoria, documentVersion
 * obligatoria para los 9 checks documentales.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { requireAdmin } from "../lib/rbac";
import type { Doc } from "../_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

// Los 9 checks que requieren un número de versión del documento firmado
// (contratos, aprobaciones formales, documentos legales).
const DOCUMENTARY_CHECK_KEYS = new Set<string>([
  "convex_dpa",
  "privy_dpa",
  "openai_dpa",
  "twilio_dpa",
  "hosting_dpa",
  "hermes_clinical_approval",
  "hermes_redteam_complete",
  "legal_retention_review",
  "incident_response_doc",
]);

const PRG_TOTAL_CHECKS = 14;

// Validators reutilizables (sincronizados con el schema)
const prgCheckKeyEnum = v.union(
  v.literal("convex_dpa"),
  v.literal("privy_dpa"),
  v.literal("openai_dpa"),
  v.literal("twilio_dpa"),
  v.literal("hosting_dpa"),
  v.literal("auth_spike_validated"),
  v.literal("hd_wallet_setup"),
  v.literal("vps_hardening"),
  v.literal("hermes_clinical_approval"),
  v.literal("hermes_redteam_complete"),
  v.literal("legal_retention_review"),
  v.literal("incident_response_doc"),
  v.literal("backup_restore_validated"),
  v.literal("wallet_sweep_sop"),
);

const prgStatusEnum = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
);

// ─────────────────────────────────────────────────────────────────────────────
// Queries de inspección
// ─────────────────────────────────────────────────────────────────────────────

export const listPRGStatus = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("productionReadinessChecks"),
      _creationTime: v.number(),
      checkKey: v.string(),
      status: v.string(),
      evidence: v.optional(v.string()),
      approvedAt: v.optional(v.number()),
      documentVersion: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const checks = await ctx.db.query("productionReadinessChecks").take(50);
    return checks.map((c) => ({
      _id: c._id,
      _creationTime: c._creationTime,
      checkKey: c.checkKey,
      status: c.status,
      evidence: c.evidence,
      approvedAt: c.approvedAt,
      documentVersion: c.documentVersion,
      notes: c.notes,
    }));
  },
});

export const isProductionEnabled = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    pendingChecks: v.number(),
    totalChecks: v.number(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const setting = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "productionEnabled"))
      .unique();

    const enabled =
      setting?.key === "productionEnabled" && setting.value === true;

    const checks = await ctx.db.query("productionReadinessChecks").take(50);
    const total = checks.length;
    const pending = checks.filter((c) => c.status !== "approved").length;

    return { enabled, pendingChecks: pending, totalChecks: total };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// updatePRGCheck — admin actualiza estado de un check
// ─────────────────────────────────────────────────────────────────────────────

export const updatePRGCheck = mutation({
  args: {
    checkKey: prgCheckKeyEnum,
    status: prgStatusEnum,
    evidence: v.optional(v.string()),
    documentVersion: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    auditAction: v.string(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    // Validaciones runtime:
    // - status approved requiere evidence no vacío
    // - checks documentales requieren documentVersion no vacío
    if (args.status === "approved") {
      if (!args.evidence || args.evidence.trim().length === 0) {
        throw new ConvexError({
          code: "EVIDENCE_REQUIRED",
          message: `Para aprobar '${args.checkKey}' se requiere evidence no vacío`,
        });
      }
      if (
        DOCUMENTARY_CHECK_KEYS.has(args.checkKey) &&
        (!args.documentVersion || args.documentVersion.trim().length === 0)
      ) {
        throw new ConvexError({
          code: "DOCUMENT_VERSION_REQUIRED",
          message: `'${args.checkKey}' es check documental: documentVersion obligatorio`,
        });
      }
    }

    // Buscar el check (debe existir desde el seed A3)
    const check = await ctx.db
      .query("productionReadinessChecks")
      .withIndex("by_checkKey", (q) => q.eq("checkKey", args.checkKey))
      .unique();
    if (!check) {
      throw new ConvexError({
        code: "PRG_CHECK_NOT_FOUND",
        message: `Check '${args.checkKey}' no existe. Ejecuta seed:seedAll primero.`,
      });
    }

    // Patch del check
    const now = Date.now();
    const patch: Partial<Doc<"productionReadinessChecks">> = {
      status: args.status,
    };
    if (args.evidence !== undefined) patch.evidence = args.evidence;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.documentVersion !== undefined) {
      patch.documentVersion = args.documentVersion;
    }
    if (args.status === "approved") {
      patch.approvedByProfileId = admin._id;
      patch.approvedAt = now;
    }
    await ctx.db.patch("productionReadinessChecks", check._id, patch);

    // AuditLog: el action depende del nuevo status
    const auditAction =
      args.status === "approved"
        ? "PRG_CHECK_APPROVED"
        : args.status === "rejected"
          ? "PRG_CHECK_REJECTED"
          : args.status === "expired"
            ? "PRG_CHECK_EXPIRED"
            : "PRG_CHECK_UPDATED";

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: auditAction,
      targetId: check._id,
      channel: "web",
    });

    return { success: true, auditAction };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// enableProduction — admin activa producción si los 14 checks están approved
// ─────────────────────────────────────────────────────────────────────────────

export const enableProduction = mutation({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    approvedCount: v.number(),
  }),
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    // 1. Verificar que los 14 checks existan y estén todos approved
    const checks = await ctx.db.query("productionReadinessChecks").take(50);
    if (checks.length < PRG_TOTAL_CHECKS) {
      throw new ConvexError({
        code: "PRG_NOT_SEEDED",
        message: `Se esperaban ${PRG_TOTAL_CHECKS} checks, hay ${checks.length}. Ejecuta seed:seedAll.`,
      });
    }

    const notApproved = checks.filter((c) => c.status !== "approved");
    if (notApproved.length > 0) {
      throw new ConvexError({
        code: "PRG_INCOMPLETE",
        message: `No se puede habilitar producción: ${notApproved.length}/${PRG_TOTAL_CHECKS} checks pendientes`,
        pendingChecks: notApproved.map((c) => ({
          checkKey: c.checkKey,
          status: c.status,
        })),
      });
    }

    // 2. Patch systemSettings productionEnabled = true
    const flag = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "productionEnabled"))
      .unique();
    if (!flag || flag.key !== "productionEnabled") {
      throw new ConvexError({
        code: "SETTING_NOT_FOUND",
        message: "systemSettings.productionEnabled no existe. Ejecuta seed:seedAll.",
      });
    }
    await ctx.db.patch("systemSettings", flag._id, {
      value: true,
      updatedAt: Date.now(),
      updatedByProfileId: admin._id,
    });

    // 3. AuditLog
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "PRODUCTION_ENABLED",
      channel: "web",
    });

    return { enabled: true, approvedCount: checks.length };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// disableProduction — admin desactiva producción con razón obligatoria
// ─────────────────────────────────────────────────────────────────────────────

export const disableProduction = mutation({
  args: {
    reason: v.string(),
  },
  returns: v.object({
    enabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    // Validar reason (1-500 chars, no solo whitespace)
    const trimmed = args.reason.trim();
    if (trimmed.length === 0) {
      throw new ConvexError({
        code: "REASON_REQUIRED",
        message: "reason es obligatorio y no puede estar vacío",
      });
    }
    if (trimmed.length > 500) {
      throw new ConvexError({
        code: "REASON_TOO_LONG",
        message: `reason debe tener máximo 500 chars (recibido: ${trimmed.length})`,
      });
    }

    const now = Date.now();

    // Patch productionEnabled = false
    const flag = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "productionEnabled"))
      .unique();
    if (!flag || flag.key !== "productionEnabled") {
      throw new ConvexError({
        code: "SETTING_NOT_FOUND",
        message: "systemSettings.productionEnabled no existe.",
      });
    }
    await ctx.db.patch("systemSettings", flag._id, {
      value: false,
      updatedAt: now,
      updatedByProfileId: admin._id,
    });

    // Patch productionDisabledReason
    const reasonSetting = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "productionDisabledReason"))
      .unique();
    if (reasonSetting && reasonSetting.key === "productionDisabledReason") {
      await ctx.db.patch("systemSettings", reasonSetting._id, {
        value: trimmed,
        updatedAt: now,
        updatedByProfileId: admin._id,
      });
    } else {
      // Si no existe el setting, lo creamos
      await ctx.db.insert("systemSettings", {
        key: "productionDisabledReason",
        value: trimmed,
        updatedAt: now,
        updatedByProfileId: admin._id,
      });
    }

    // AuditLog
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "PRODUCTION_DISABLED",
      channel: "web",
    });

    return { enabled: false };
  },
});
