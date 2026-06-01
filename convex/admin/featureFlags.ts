/**
 * B6 (VAL-50) — Gestión de feature flags (solo admin)
 *
 * - toggleFeatureFlag: enciende/apaga un flag y lo audita.
 * - getFeatureFlags: lista el estado actual de los flags para el dashboard admin.
 *
 * La lectura para gatear features dentro de otras funciones se hace con
 * `requireFeatureFlag` / `isFeatureEnabled` (convex/lib/featureFlags.ts).
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin } from "../lib/rbac";
import { FEATURE_FLAG_KEYS } from "../lib/featureFlags";

const flagKeyValidator = v.union(
  v.literal("marketplaceEnabled"),
  v.literal("appointmentsEnabled"),
  v.literal("paymentsEnabled"),
);

/**
 * Enciende o apaga un feature flag. Solo admin. Idempotente (upsert).
 * Registra FEATURE_FLAG_TOGGLED en auditLogs (quién, qué flag).
 *
 * Nota: auditLogs no tiene campo metadata, por lo que el valor anterior→nuevo
 * no se persiste en el log; el nuevo valor queda en systemSettings.updatedAt/By.
 */
export const toggleFeatureFlag = mutation({
  args: {
    flagKey: flagKeyValidator,
    enabled: v.boolean(),
  },
  returns: v.object({
    flagKey: flagKeyValidator,
    enabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", args.flagKey))
      .unique();

    if (existing) {
      // Cast: el discriminated union no correlaciona key dinámico con value.
      await ctx.db.patch("systemSettings", existing._id, {
        value: args.enabled,
        updatedAt: now,
        updatedByProfileId: admin._id,
      });
    } else {
      await ctx.db.insert("systemSettings", {
        key: args.flagKey,
        value: args.enabled,
        updatedAt: now,
        updatedByProfileId: admin._id,
      });
    }

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "FEATURE_FLAG_TOGGLED",
      targetId: args.flagKey,
      channel: "web",
    });

    return { flagKey: args.flagKey, enabled: args.enabled };
  },
});

/**
 * Estado actual de todos los feature flags. Solo admin (dashboard).
 * Flags ausentes se reportan como false.
 */
export const getFeatureFlags = query({
  args: {},
  returns: v.object({
    marketplaceEnabled: v.boolean(),
    appointmentsEnabled: v.boolean(),
    paymentsEnabled: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const result: Record<string, boolean> = {
      marketplaceEnabled: false,
      appointmentsEnabled: false,
      paymentsEnabled: false,
    };

    for (const key of FEATURE_FLAG_KEYS) {
      const setting = await ctx.db
        .query("systemSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      result[key] = !!setting && typeof setting.value === "boolean"
        ? setting.value
        : false;
    }

    return result as {
      marketplaceEnabled: boolean;
      appointmentsEnabled: boolean;
      paymentsEnabled: boolean;
    };
  },
});
