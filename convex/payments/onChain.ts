/**
 * A15 — Registro de pagos on-chain
 *
 * recordPayment: registra una tx detectada por el monitor de blockchain.
 *   Idempotente por txHash. Clasifica estado por monto y red.
 * updateConfirmations: actualiza confirmaciones; al alcanzar el mínimo con
 *   monto suficiente, confirma + activa suscripción.
 *
 * Casos borde: wrong_network, partial, overpaid, duplicate (txHash), reorg.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { findExistingOrNull } from "../lib/unique";
import { confirmAppointmentPayment } from "../appointments/booking";

const currencyEnum = v.union(v.literal("SYS"), v.literal("USDT"));
const networkEnum = v.union(
  v.literal("syscoin_testnet"),
  v.literal("syscoin_mainnet"),
);

const MIN_CONFIRMATIONS_TESTNET = 12;

function compareDecimal(a: string, b: string): number {
  const fa = parseFloat(a);
  const fb = parseFloat(b);
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return 0;
}

export const recordPayment = internalMutation({
  args: {
    invoiceId: v.id("paymentInvoices"),
    walletAddress: v.string(),
    txHash: v.string(),
    amountReceived: v.string(),
    currency: currencyEnum,
    network: networkEnum,
    detectedChainId: v.number(),
    blockNumber: v.optional(v.number()),
    currentConfirmations: v.number(),
  },
  returns: v.object({
    paymentId: v.id("payments"),
    status: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get("paymentInvoices", args.invoiceId);
    if (!invoice) {
      throw new ConvexError({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice no existe",
      });
    }

    // Idempotencia por txHash
    const existing = await findExistingOrNull(
      ctx,
      "payments",
      "by_txHash",
      (q) => q.eq("txHash", args.txHash),
    );
    if (existing) {
      return {
        paymentId: existing._id,
        status: existing.status,
        duplicate: true,
      };
    }

    let status:
      | "pending"
      | "confirming"
      | "confirmed"
      | "failed"
      | "wrong_network";

    if (args.detectedChainId !== invoice.expectedChainId) {
      status = "wrong_network";
    } else if (args.currentConfirmations >= MIN_CONFIRMATIONS_TESTNET) {
      status = "confirmed";
    } else {
      status = "confirming";
    }

    const paymentId = await ctx.db.insert("payments", {
      invoiceId: args.invoiceId,
      patientId: invoice.patientId,
      walletAddress: args.walletAddress,
      txHash: args.txHash,
      amountReceived: args.amountReceived,
      currency: args.currency,
      network: args.network,
      detectedChainId: args.detectedChainId,
      status,
      blockNumber: args.blockNumber,
      minConfirmations: MIN_CONFIRMATIONS_TESTNET,
      currentConfirmations: args.currentConfirmations,
      reconciled: false,
    });

    if (status === "wrong_network") {
      await ctx.runMutation(internal.audit.log, {
        actorType: "system",
        action: "PAYMENT_WRONG_NETWORK",
        targetId: paymentId,
        targetType: "payment",
        channel: "system",
      });
    }

    if (status === "confirmed") {
      await finalizePaymentInternal(ctx, paymentId);
    }

    return { paymentId, status, duplicate: false };
  },
});

export const updateConfirmations = internalMutation({
  args: {
    txHash: v.string(),
    currentConfirmations: v.number(),
    blockNumber: v.optional(v.number()),
  },
  returns: v.object({
    status: v.string(),
    activated: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ status: string; activated: boolean }> => {
    const payment = await findExistingOrNull(
      ctx,
      "payments",
      "by_txHash",
      (q) => q.eq("txHash", args.txHash),
    );
    if (!payment) {
      throw new ConvexError({
        code: "PAYMENT_NOT_FOUND",
        message: "txHash no registrado. Llama recordPayment primero.",
      });
    }

    if (payment.status === "wrong_network" || payment.status === "failed") {
      return { status: payment.status, activated: false };
    }

    const patch: Record<string, unknown> = {
      currentConfirmations: args.currentConfirmations,
    };
    if (args.blockNumber !== undefined) patch.blockNumber = args.blockNumber;

    // Reorg: baja del mínimo → vuelve a confirming
    if (
      args.currentConfirmations < payment.minConfirmations &&
      payment.status === "confirmed"
    ) {
      patch.status = "confirming";
      await ctx.db.patch("payments", payment._id, patch);
      return { status: "confirming", activated: false };
    }

    // Alcanza el mínimo desde confirming → confirmar + activar
    if (
      args.currentConfirmations >= payment.minConfirmations &&
      payment.status === "confirming"
    ) {
      patch.status = "confirmed";
      await ctx.db.patch("payments", payment._id, patch);
      const activated = await finalizePaymentInternal(ctx, payment._id);
      return { status: "confirmed", activated };
    }

    await ctx.db.patch("payments", payment._id, patch);
    return { status: payment.status, activated: false };
  },
});

// Helper compartido (NO función Convex registrada)
async function finalizePaymentInternal(
  ctx: any,
  paymentId: any,
): Promise<boolean> {
  const payment = await ctx.db.get("payments", paymentId);
  if (!payment) return false;
  const invoice = await ctx.db.get("paymentInvoices", payment.invoiceId);
  if (!invoice) return false;

  await ctx.db.patch("payments", paymentId, { confirmedAt: Date.now() });

  const cmp = compareDecimal(payment.amountReceived, invoice.amountExpected);

  let invoiceStatus: "paid" | "partial" | "overpaid";
  let activate = false;
  if (cmp < 0) {
    invoiceStatus = "partial";
  } else if (cmp > 0) {
    invoiceStatus = "overpaid";
    activate = true;
  } else {
    invoiceStatus = "paid";
    activate = true;
  }

  await ctx.db.patch("paymentInvoices", invoice._id, { status: invoiceStatus });

  await ctx.runMutation(internal.audit.log, {
    actorType: "system",
    action:
      invoiceStatus === "partial" ? "PAYMENT_PARTIAL" : "PAYMENT_CONFIRMED",
    targetId: paymentId,
    targetType: "payment",
    channel: "system",
  });

  // B11 (VAL-55): invoice de cita → confirma/late en vez de activar suscripción.
  if (invoice.appointmentId) {
    await confirmAppointmentPayment(
      ctx,
      invoice._id,
      payment.txHash,
      payment.amountReceived,
    );
    return false;
  }

  if (!activate) return false;

  const patient = await ctx.db.get("patients", invoice.patientId);
  if (!patient) return false;

  const now = Date.now();
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const base =
    patient.subscriptionExpiresAt && patient.subscriptionExpiresAt > now
      ? patient.subscriptionExpiresAt
      : now;
  const newExpiry = base + invoice.subscriptionMonths * monthMs;

  await ctx.db.patch("patients", patient._id, {
    subscriptionStatus: "active",
    subscriptionExpiresAt: newExpiry,
  });

  await ctx.runMutation(internal.notifications.notifications.create, {
    profileId: patient.profileId,
    type: "payment_confirmed",
    templateParams: { invoiceCode: invoice.invoiceCode },
    relatedId: invoice._id,
  });

  return true;
}

export const listConfirmingPayments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "confirming"))
      .collect();
    return payments.map((p) => ({
      _id: p._id,
      txHash: p.txHash,
      currentConfirmations: p.currentConfirmations,
      blockNumber: p.blockNumber,
    }));
  },
});
