/**
 * B12 (VAL-56) — processSpecialistPayout (admin) con idempotencia + retry.
 *
 * ENVÍO SIMULADO (mock testnet): no existe firma/broadcast on-chain en el HD
 * wallet (solo derivación de direcciones). `mockTxHash()` genera un txHash
 * falso para validar la máquina de estados en staging SIN mover fondos.
 * Reemplazar el bloque "envío simulado" por la integración real cuando exista.
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin } from "../lib/rbac";
import { requireFeatureFlag } from "../lib/featureFlags";
import { mockTxHash, truncatedSha256 } from "../lib/money";

const MAX_RETRIES = 3;

export const processSpecialistPayout = mutation({
  args: { payoutId: v.id("specialistPayouts") },
  returns: v.object({
    payoutId: v.id("specialistPayouts"),
    status: v.string(),
    payoutTxHashHash: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "paymentsEnabled");
    const admin = await requireAdmin(ctx);

    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      throw new ConvexError({ code: "PAYOUT_NOT_FOUND", message: "Payout no existe" });
    }

    // Idempotencia / validación de estado.
    switch (payout.status) {
      case "paid":
        throw new ConvexError({ code: "PAYOUT_ALREADY_PAID", message: "Payout ya fue pagado (idempotencia)" });
      case "processing":
        throw new ConvexError({ code: "PAYOUT_PROCESSING", message: "Payout ya está en proceso" });
      case "refunded":
        throw new ConvexError({ code: "PAYOUT_REFUNDED", message: "Payout ya fue reembolsado" });
      case "disputed":
        throw new ConvexError({ code: "PAYOUT_DISPUTED", message: "Payout está en disputa" });
      case "pending":
        throw new ConvexError({ code: "PAYOUT_NOT_PAYABLE", message: "Payout aún no es payable (esperar cita completada + hold)" });
      case "payable":
        break; // primer intento
      case "earned":
        throw new ConvexError({ code: "PAYOUT_NOT_PAYABLE", message: "Payout en earned: esperar transición a payable (24h)" });
      case "failed":
        // Retry: si superó el máximo, marcar failed permanente y alertar.
        if ((payout.retryCount ?? 0) >= MAX_RETRIES) {
          await ctx.scheduler.runAfter(0, internal.maintenance.alertOps.sendOpsAlert, {
            level: "critical",
            event: "LATE_PAYMENT_REVIEW",
            resourceType: "payment",
            resourceId: payout._id,
          });
          throw new ConvexError({
            code: "PAYOUT_RETRY_EXHAUSTED",
            message: `Payout superó ${MAX_RETRIES} reintentos; revisión manual requerida`,
          });
        }
        break;
      default:
        throw new ConvexError({ code: "PAYOUT_INVALID_STATE", message: `Estado inválido: ${payout.status}` });
    }

    // Transición atómica a processing (Convex serializa mutations → evita doble envío).
    await ctx.db.patch(payout._id, {
      status: "processing",
      processedByProfileId: admin._id,
    });

    // ── Envío SIMULADO (mock testnet) ──────────────────────────────────────
    // Reemplazar por firma+broadcast reales cuando exista esa capacidad.
    const txHash = mockTxHash();
    const payoutTxHashHash = await truncatedSha256(txHash);
    const now = Date.now();

    await ctx.db.patch(payout._id, {
      status: "paid",
      payoutTxHash: txHash,
      payoutTxHashHash,
      paidAt: now,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "SPECIALIST_PAYOUT_PAID",
      targetId: payout._id,
      channel: "web",
    });

    return { payoutId: payout._id, status: "paid", payoutTxHashHash };
  },
});
