/**
 * A16 — Conciliación de pagos
 *
 * Cron diario. Revisa payments con status="confirmed" y reconciled=false.
 *
 * En producción (con VPS + RPC Syscoin), aquí se re-verificaría on-chain que
 * el txHash sigue confirmado con las confirmaciones mínimas. Por ahora, sin
 * nodo, la conciliación valida consistencia interna:
 *   - el invoice referenciado existe
 *   - el patientId del payment coincide con el del invoice
 *   - el amountReceived es un número válido
 * Si todo OK → reconciled=true. Si hay discrepancia → se deja sin conciliar
 * y se registra para revisión (en A17 se enviará alerta operativa real).
 *
 * Procesa en lotes de 50 + self-reschedule para no superar límites de tx.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const BATCH_SIZE = 50;

export const reconcilePayments = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    reconciled: v.number(),
    discrepancies: v.number(),
    scheduledMore: v.boolean(),
  }),
  handler: async (ctx): Promise<{
    scanned: number;
    reconciled: number;
    discrepancies: number;
    scheduledMore: boolean;
  }> => {
    const batch = await ctx.db
      .query("payments")
      .withIndex("by_reconciled_and_status", (q) =>
        q.eq("reconciled", false).eq("status", "confirmed"),
      )
      .take(BATCH_SIZE);

    let reconciled = 0;
    let discrepancies = 0;

    for (const payment of batch) {
      const invoice = await ctx.db.get("paymentInvoices", payment.invoiceId);

      // Validaciones de consistencia interna
      const invoiceOk = invoice !== null;
      const patientMatches =
        invoice !== null && invoice.patientId === payment.patientId;
      const amountValid = !Number.isNaN(parseFloat(payment.amountReceived));

      if (invoiceOk && patientMatches && amountValid) {
        await ctx.db.patch("payments", payment._id, { reconciled: true });
        reconciled++;
      } else {
        // Discrepancia: dejamos sin conciliar para revisión manual.
        // A17: disparar alerta operativa (no-op si no hay canal configurado).
        discrepancies++;
        await ctx.scheduler.runAfter(
          0,
          internal.maintenance.alertOps.sendOpsAlert,
          {
            level: "warning",
            event: "RECONCILIATION_DISCREPANCY",
            resourceType: "payment",
            resourceId: payment._id,
          },
        );
      }
    }

    // Si llenamos el lote, puede haber más → reagendar
    let scheduledMore = false;
    if (batch.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.payments.reconciliation.reconcilePayments,
        {},
      );
      scheduledMore = true;
    }

    return {
      scanned: batch.length,
      reconciled,
      discrepancies,
      scheduledMore,
    };
  },
});
