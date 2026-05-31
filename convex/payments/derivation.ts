/**
 * A14 — HD wallet derivation index counter
 *
 * Counter atómico (read + patch en una mutation) que garantiza que cada
 * invoice obtiene un derivationIndex único, sin race condition.
 *
 * Las mutations Convex son transacciones, así que dos llamadas simultáneas
 * a `getNextDerivationIndex` no pueden leer el mismo valor.
 *
 * Usado por A15 paymentInvoices.createInvoice.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ConvexError } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// getNextDerivationIndex — internal, transaccional
// ─────────────────────────────────────────────────────────────────────────────

export const getNextDerivationIndex = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "nextDerivationIndex"))
      .unique();

    if (!setting) {
      throw new ConvexError({
        code: "SETTING_NOT_FOUND",
        message:
          "systemSettings.nextDerivationIndex no existe. Ejecuta seed:seedAll.",
      });
    }
    if (setting.key !== "nextDerivationIndex") {
      // TypeScript: el discriminated union puede haber retornado otro tipo
      // (no debería pasar por el index, pero defensa por si acaso).
      throw new ConvexError({
        code: "SETTING_TYPE_MISMATCH",
        message: "Setting retornado no es nextDerivationIndex",
      });
    }

    const current = setting.value;
    const next = current + 1;

    await ctx.db.patch(setting._id, {
      value: next,
      updatedAt: Date.now(),
    });

    // Retornamos el valor PREVIO: ese es el index para usar AHORA.
    // El próximo invoice usará `next`.
    return current;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// peekDerivationIndex — para inspección sin incrementar
// ─────────────────────────────────────────────────────────────────────────────

export const peekDerivationIndex = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "nextDerivationIndex"))
      .unique();
    if (!setting || setting.key !== "nextDerivationIndex") {
      return 0;
    }
    return setting.value;
  },
});
