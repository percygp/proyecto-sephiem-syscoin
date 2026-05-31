/**
 * A16 — Retención de auditLogs
 *
 * Cron diario. Borra auditLogs más antiguos que systemSettings.auditLogRetentionDays
 * (default 730 = 2 años).
 *
 * EXCEPCIÓN documentada a la regla append-only de A6: esta es la ÚNICA función
 * en todo el codebase autorizada a hacer ctx.db.delete sobre auditLogs.
 * Ninguna otra función debe borrar registros de auditoría.
 *
 * Vive en convex/maintenance/ (no en convex/audit/) para evitar colisión de
 * routing con el módulo convex/audit.ts.
 *
 * Procesa en lotes de 100 + self-reschedule. auditLogs no tiene índice por
 * _creationTime, así que usamos el orden por defecto (_creationTime asc): los
 * más antiguos primero.
 *
 * Meta-auditoría: NO insertamos DATA_DELETED por cada registro (generaría más
 * logs de los que borra). El cron retorna el conteo para inspección.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const BATCH_SIZE = 100;
const DEFAULT_RETENTION_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

export const pruneOldAuditLogs = internalMutation({
  args: {},
  returns: v.object({
    deleted: v.number(),
    cutoffDays: v.number(),
    scheduledMore: v.boolean(),
  }),
  handler: async (ctx): Promise<{
    deleted: number;
    cutoffDays: number;
    scheduledMore: boolean;
  }> => {
    const setting = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("key", "auditLogRetentionDays"))
      .unique();

    const retentionDays =
      setting && setting.key === "auditLogRetentionDays"
        ? setting.value
        : DEFAULT_RETENTION_DAYS;

    const cutoff = Date.now() - retentionDays * DAY_MS;

    // Orden asc por _creationTime (default): los más antiguos primero.
    const batch = await ctx.db.query("auditLogs").order("asc").take(BATCH_SIZE);

    let deleted = 0;
    let hitNonExpired = false;
    for (const logEntry of batch) {
      if (logEntry._creationTime < cutoff) {
        await ctx.db.delete(logEntry._id);
        deleted++;
      } else {
        // Ordenados asc: el primero no vencido implica que el resto tampoco.
        hitNonExpired = true;
        break;
      }
    }

    let scheduledMore = false;
    if (deleted === BATCH_SIZE && !hitNonExpired) {
      await ctx.scheduler.runAfter(
        0,
        internal.maintenance.auditRetention.pruneOldAuditLogs,
        {},
      );
      scheduledMore = true;
    }

    return { deleted, cutoffDays: retentionDays, scheduledMore };
  },
});
