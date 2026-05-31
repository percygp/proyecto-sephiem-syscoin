/**
 * A14 — Cron mensual de expiración de PRG checks
 *
 * Algunos checks documentales tienen vencimiento (DPAs anuales, aprobación
 * clínica, revisión legal). Cuando vencen, deben pasar a status="expired"
 * para que enableProduction los rechace y forzar renovación.
 *
 * Convención: si un check approved tiene en su campo `notes` el sufijo
 * `expires:YYYY-MM-DD`, esta función lo detecta y marca expired si vencido.
 *
 * Esto evita añadir un campo expiresAt al schema (que generaría migración).
 * La convención es flexible: si no hay `expires:`, el check no caduca.
 *
 * Ejemplo notes válida:
 *   "DPA firmado por Convex el 2025-01-15. expires:2026-01-15"
 *
 * Audit:
 *   - PRG_CHECK_EXPIRED por cada check cambiado
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const EXPIRES_REGEX = /expires:(\d{4}-\d{2}-\d{2})/;

export const prgExpirationCheck = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    expired: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let expired = 0;

    const approved = await ctx.db
      .query("productionReadinessChecks")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(50);

    for (const check of approved) {
      if (!check.notes) continue;
      const match = check.notes.match(EXPIRES_REGEX);
      if (!match) continue;

      const expiresDate = match[1]; // YYYY-MM-DD
      const expiresTs = new Date(expiresDate + "T00:00:00Z").getTime();
      if (Number.isNaN(expiresTs)) continue;

      if (expiresTs < now) {
        await ctx.db.patch(check._id, {
          status: "expired",
        });

        await ctx.runMutation(internal.audit.log, {
          actorType: "system",
          action: "PRG_CHECK_EXPIRED",
          targetId: check._id,
          channel: "system",
        });

        // A17: alerta operativa (no-op si no hay canal configurado)
        await ctx.scheduler.runAfter(
          0,
          internal.maintenance.alertOps.sendOpsAlert,
          {
            level: "warning",
            event: "PRG_CHECK_EXPIRED",
            resourceType: "system",
            resourceId: check._id,
          },
        );

        expired++;
      }
    }

    return { scanned: approved.length, expired };
  },
});
