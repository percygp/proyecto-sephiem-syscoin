/**
 * A4 — Limpieza periódica de nonces expirados
 *
 * Cron horario. Procesa en lotes de 50 para no superar límites de transacción.
 * Si quedan más, se reagenda automáticamente vía scheduler.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const BATCH_SIZE = 50;

export const pruneExpiredNonces = internalMutation({
  args: {},
  returns: v.object({
    deleted: v.number(),
    scheduledMore: v.boolean(),
  }),
  handler: async (ctx): Promise<{ deleted: number; scheduledMore: boolean }> => {
    const now = Date.now();

    // Leer lote: todos los nonces ordenados por expiresAt ascendente.
    // Los expirados están al inicio.
    const candidates = await ctx.db
      .query("walletNonces")
      .withIndex("by_expiresAt")
      .take(BATCH_SIZE);

    let deleted = 0;
    let allExpired = candidates.length === BATCH_SIZE;
    for (const nonce of candidates) {
      if (nonce.expiresAt < now) {
        await ctx.db.delete(nonce._id);
        deleted++;
      } else {
        // Los siguientes están todavía vigentes (orden asc por expiresAt)
        allExpired = false;
        break;
      }
    }

    // Si llenamos el lote y todos estaban expirados, puede haber más.
    // Re-agendamos con scheduler para no bloquear la transacción.
    let scheduledMore = false;
    if (allExpired && deleted === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.auth.nonceCleanup.pruneExpiredNonces,
        {},
      );
      scheduledMore = true;
    }

    return { deleted, scheduledMore };
  },
});
