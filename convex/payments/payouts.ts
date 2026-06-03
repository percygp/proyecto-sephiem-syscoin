/**
 * B12 (VAL-56) + B13 (VAL-57) — Procesamiento de payouts a especialistas.
 *
 * ENVÍO SIMULADO (mock testnet): no existe firma/broadcast on-chain en el HD
 * wallet (solo derivación). `mockTxHash()` genera un txHash falso para validar
 * la máquina de estados SIN mover fondos. Reemplazar el bloque "envío simulado"
 * por la integración real cuando exista.
 *
 * processSpecialistPayout (admin) y processReadyPayouts (cron) comparten el core
 * `processPayoutCore`. El cron corre como system (sin processedByProfileId).
 */
import { ConvexError, v } from "convex/values";
import {
  mutation,
  internalMutation,
  internalQuery,
  internalAction,
  MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireAdmin } from "../lib/rbac";
import { requireFeatureFlag } from "../lib/featureFlags";
import { mockTxHash, truncatedSha256 } from "../lib/money";

const MAX_RETRIES = 3;

/**
 * Envío SIMULADO (mock testnet). Reemplazar por firma/broadcast on-chain real.
 * `forceFail` permite ejercitar de forma determinística la rama de fallo+retry
 * (VAL-56) en tests/seeds internos; NO se expone en la API pública.
 */
function sendPayoutOnChain(forceFail: boolean): { txHash: string } {
  if (forceFail) {
    throw new Error("Simulated on-chain send failure");
  }
  return { txHash: mockTxHash() };
}

// ─────────────────────────────────────────────────────────────────────────────
// processPayoutCore — helper plano compartido (admin mutation + cron)
// ─────────────────────────────────────────────────────────────────────────────

export async function processPayoutCore(
  ctx: MutationCtx,
  payoutId: Id<"specialistPayouts">,
  processedByProfileId?: Id<"profiles">,
  forceFail = false,
): Promise<{ payoutId: Id<"specialistPayouts">; status: string; payoutTxHashHash?: string }> {
  const payout = await ctx.db.get("specialistPayouts", payoutId);
  if (!payout) {
    throw new ConvexError({ code: "PAYOUT_NOT_FOUND", message: "Payout no existe" });
  }

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
      throw new ConvexError({ code: "PAYOUT_NOT_PAYABLE", message: "Payout aún no es payable" });
    case "earned":
      throw new ConvexError({ code: "PAYOUT_NOT_PAYABLE", message: "Payout en earned: esperar payable (24h)" });
    case "payable":
      break;
    case "failed":
      if ((payout.retryCount ?? 0) >= MAX_RETRIES) {
        await ctx.scheduler.runAfter(0, internal.maintenance.alertOps.sendOpsAlert, {
          level: "critical",
          event: "LATE_PAYMENT_REVIEW",
          resourceType: "payment",
          resourceId: payout._id,
        });
        throw new ConvexError({
          code: "PAYOUT_RETRY_EXHAUSTED",
          message: `Payout superó ${MAX_RETRIES} reintentos; revisión manual`,
        });
      }
      break;
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new ConvexError({ code: "PAYOUT_INVALID_STATE", message: `Estado inválido: ${payout.status}` });
  }

  // Transición atómica a processing (Convex serializa mutations → evita doble envío).
  await ctx.db.patch("specialistPayouts", payout._id, {
    status: "processing",
    ...(processedByProfileId ? { processedByProfileId } : {}),
  });

  // ── Envío al exterior (mock testnet) ───────────────────────────────────
  let txHash: string;
  try {
    ({ txHash } = sendPayoutOnChain(forceFail));
  } catch (err) {
    // Rama de fallo (VAL-56): NO se lanza ConvexError — lanzar revertiría esta
    // misma transacción (patch failed + audit) y se perdería el estado. Se
    // persiste "failed", se incrementa retryCount y se retorna el resultado.
    const retryCount = (payout.retryCount ?? 0) + 1;
    await ctx.db.patch("specialistPayouts", payout._id, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : "unknown send error",
      retryCount,
      failedAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: processedByProfileId,
      actorType: processedByProfileId ? "admin" : "system",
      action: "SPECIALIST_PAYOUT_FAILED",
      targetId: payout._id,
      channel: processedByProfileId ? "web" : "system",
    });
    // Fallo permanente al agotar reintentos → notificar admin.
    if (retryCount >= MAX_RETRIES) {
      await ctx.scheduler.runAfter(0, internal.maintenance.alertOps.sendOpsAlert, {
        level: "critical",
        event: "LATE_PAYMENT_REVIEW",
        resourceType: "payment",
        resourceId: payout._id,
      });
    }
    return { payoutId: payout._id, status: "failed" };
  }

  const payoutTxHashHash = await truncatedSha256(txHash);
  await ctx.db.patch("specialistPayouts", payout._id, {
    status: "paid",
    payoutTxHash: txHash,
    payoutTxHashHash,
    paidAt: Date.now(),
  });

  await ctx.runMutation(internal.audit.log, {
    actorProfileId: processedByProfileId,
    actorType: processedByProfileId ? "admin" : "system",
    action: "SPECIALIST_PAYOUT_PAID",
    targetId: payout._id,
    channel: processedByProfileId ? "web" : "system",
  });

  return { payoutId: payout._id, status: "paid", payoutTxHashHash };
}

// ─────────────────────────────────────────────────────────────────────────────
// processSpecialistPayout (mutation, admin)
// ─────────────────────────────────────────────────────────────────────────────

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
    return await processPayoutCore(ctx, args.payoutId, admin._id);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getPayoutTxHash (mutation, solo admin) — devuelve el txHash COMPLETO bajo RBAC
// y audita el acceso. Es mutation (no query) porque audita (queries no escriben).
// ─────────────────────────────────────────────────────────────────────────────

export const getPayoutTxHash = mutation({
  args: { payoutId: v.id("specialistPayouts") },
  returns: v.object({ payoutTxHash: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "paymentsEnabled");
    const admin = await requireAdmin(ctx);

    const payout = await ctx.db.get("specialistPayouts", args.payoutId);
    if (!payout) {
      throw new ConvexError({ code: "PAYOUT_NOT_FOUND", message: "Payout no existe" });
    }

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "SPECIALIST_PAYOUT_TXHASH_ACCESSED",
      targetId: payout._id,
      channel: "web",
    });

    return { payoutTxHash: payout.payoutTxHash ?? null };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// processPayoutInternal (internalMutation) — usado por el cron processReadyPayouts
// ─────────────────────────────────────────────────────────────────────────────

export const processPayoutInternal = internalMutation({
  args: {
    payoutId: v.id("specialistPayouts"),
    // Solo para validación determinística de la rama failed+retry (VAL-56).
    forceFail: v.optional(v.boolean()),
  },
  returns: v.object({
    payoutId: v.id("specialistPayouts"),
    status: v.string(),
    payoutTxHashHash: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    return await processPayoutCore(ctx, args.payoutId, undefined, args.forceFail ?? false);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listPayablePayouts (internalQuery) — hasta 10 payouts en "payable"
// ─────────────────────────────────────────────────────────────────────────────

export const listPayablePayouts = internalQuery({
  args: {},
  returns: v.array(v.id("specialistPayouts")),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("specialistPayouts")
      .withIndex("by_status", (q) => q.eq("status", "payable"))
      .take(10);
    return rows.map((r) => r._id);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// processReadyPayouts (internalAction, cron) — procesa payables, error aislado
// ─────────────────────────────────────────────────────────────────────────────

export const processReadyPayouts = internalAction({
  args: {},
  returns: v.object({ processed: v.number(), failed: v.number() }),
  handler: async (ctx): Promise<{ processed: number; failed: number }> => {
    const ids = await ctx.runQuery(
      internal.payments.payouts.listPayablePayouts,
      {},
    );
    let processed = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await ctx.runMutation(internal.payments.payouts.processPayoutInternal, {
          payoutId: id,
        });
        processed++;
      } catch (err) {
        failed++;
        console.error("[processReadyPayouts] payout error:", id, err);
      }
    }
    return { processed, failed };
  },
});
