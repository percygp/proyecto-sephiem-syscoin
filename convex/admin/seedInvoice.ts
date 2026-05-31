/**
 * A15 — Seed de invoice de prueba (DEV ONLY)
 *
 * createInvoice real (payments/invoices.ts) requiere HD_XPUB_TESTNET para
 * derivar la dirección. Mientras el xpub no está configurado (Track B), este
 * seed permite crear un invoice con una dirección MOCK para probar la UI y
 * el flujo de recordPayment.
 *
 * NO usar en producción. El derivationIndex se reserva igual desde el counter
 * para mantener consistencia.
 *
 * Comandos:
 *   npx convex run admin/seedInvoice:createMockInvoice '{"patientId":"...","amountExpected":"50.00","currency":"SYS","subscriptionMonths":1}'
 *   npx convex run admin/seedInvoice:simulatePayment '{"invoiceId":"...","amountReceived":"50.00","confirmations":12}'
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { assertUnique } from "../lib/unique";
import type { Id } from "../_generated/dataModel";

const currencyEnum = v.union(v.literal("SYS"), v.literal("USDT"));

const SYSCOIN_TESTNET_CHAIN_ID = 5700;

/**
 * Crea un profile + patient de prueba para smoke testing del flujo de pagos.
 * DEV ONLY. En el flujo real esto lo hace el onboarding (A9).
 */
export const seedTestPatient = internalMutation({
  args: {},
  returns: v.object({
    profileId: v.id("profiles"),
    patientId: v.id("patients"),
  }),
  handler: async (ctx): Promise<{
    profileId: Id<"profiles">;
    patientId: Id<"patients">;
  }> => {
    const token = "test|did:privy:smoke-" + Date.now();
    const profileId = await ctx.db.insert("profiles", {
      tokenIdentifier: token,
      walletAddress: "0x" + "a".repeat(40),
      role: "patient",
      name: "Paciente Prueba",
      email: "prueba@sephiem.test",
      isActive: true,
    });
    const patientId = await ctx.db.insert("patients", {
      profileId,
      subscriptionStatus: "pending_payment",
      onboardingComplete: true,
      dateOfBirth: "1990-01-01",
      isFictional: true,
    });
    return { profileId, patientId };
  },
});

export const createMockInvoice = internalMutation({
  args: {
    patientId: v.id("patients"),
    amountExpected: v.string(),
    currency: currencyEnum,
    subscriptionMonths: v.number(),
  },
  returns: v.object({
    invoiceId: v.id("paymentInvoices"),
    invoiceCode: v.string(),
    derivedAddress: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    invoiceId: Id<"paymentInvoices">;
    invoiceCode: string;
    derivedAddress: string;
  }> => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) {
      throw new ConvexError({
        code: "PATIENT_NOT_FOUND",
        message: "Patient no existe",
      });
    }

    // Reservar derivationIndex real (counter A14)
    const derivationIndex: number = await ctx.runMutation(
      internal.payments.derivation.getNextDerivationIndex,
      {},
    );

    // Dirección MOCK determinística (NO derivada de xpub real).
    // Formato 0x + 40 hex basado en el index. Solo para dev/UI.
    const hexIndex = derivationIndex.toString(16).padStart(40, "0");
    const derivedAddress = "0x" + hexIndex;

    const year = new Date().getFullYear();
    const invoiceCode = `SPH-${year}-${String(derivationIndex).padStart(6, "0")}`;

    await assertUnique(
      ctx,
      "paymentInvoices",
      "by_invoiceCode",
      (q) => q.eq("invoiceCode", invoiceCode),
    );
    await assertUnique(
      ctx,
      "paymentInvoices",
      "by_derivedAddress",
      (q) => q.eq("derivedAddress", derivedAddress),
    );

    const tokenDecimals = args.currency === "USDT" ? 6 : 18;
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    const invoiceId = await ctx.db.insert("paymentInvoices", {
      patientId: args.patientId,
      invoiceCode,
      derivedAddress,
      derivationIndex,
      amountExpected: args.amountExpected,
      currency: args.currency,
      tokenDecimals,
      expectedChainId: SYSCOIN_TESTNET_CHAIN_ID,
      status: "pending",
      expiresAt,
      subscriptionMonths: args.subscriptionMonths,
    });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "PAYMENT_INVOICE_CREATED",
      targetId: invoiceId,
      targetType: "payment",
      channel: "system",
    });

    return { invoiceId, invoiceCode, derivedAddress };
  },
});

/**
 * Simula un pago on-chain llamando recordPayment con datos de prueba.
 * Útil para validar el flujo completo sin un nodo Syscoin real.
 */
export const simulatePayment = internalMutation({
  args: {
    invoiceId: v.id("paymentInvoices"),
    amountReceived: v.string(),
    confirmations: v.number(),
    wrongNetwork: v.optional(v.boolean()),
  },
  returns: v.object({
    paymentId: v.id("payments"),
    status: v.string(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    paymentId: Id<"payments">;
    status: string;
    duplicate: boolean;
  }> => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice no existe",
      });
    }

    // txHash determinístico de prueba
    const txHash =
      "0xtest" +
      args.invoiceId.slice(-8) +
      Date.now().toString(16);

    const result = await ctx.runMutation(
      internal.payments.onChain.recordPayment,
      {
        invoiceId: args.invoiceId,
        walletAddress: "0x" + "1".repeat(40),
        txHash,
        amountReceived: args.amountReceived,
        currency: invoice.currency,
        network: "syscoin_testnet",
        detectedChainId: args.wrongNetwork ? 1 : invoice.expectedChainId,
        blockNumber: 1_000_000,
        currentConfirmations: args.confirmations,
      },
    );

    return result;
  },
});
