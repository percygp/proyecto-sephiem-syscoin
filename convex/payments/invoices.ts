/**
 * A15 — paymentInvoices
 *
 * createInvoice (action): genera un invoice con dirección única derivada del
 * HD wallet (A14). Flujo:
 *   1. requireAdmin (en la action via runQuery a un check de rol)
 *   2. getNextDerivationIndex (A14, atómico)
 *   3. deriveSyscoinAddress (A14, node action)
 *   4. insertInvoice (internalMutation: assertUnique + insert + audit)
 *
 * Como deriveSyscoinAddress es action (node) y necesitamos componer varias
 * llamadas, createInvoice es action.
 *
 * Queries:
 *   - getMyInvoices: el paciente ve sus invoices
 *   - getInvoiceDetail: invoice + sus payments
 */
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin, getCallerProfile } from "../lib/rbac";
import { assertUnique } from "../lib/unique";
import type { Id } from "../_generated/dataModel";

const currencyEnum = v.union(v.literal("SYS"), v.literal("USDT"));

// Syscoin testnet (Tanenbaum) = 5700, mainnet = 57.
const SYSCOIN_TESTNET_CHAIN_ID = 5700;

// ─────────────────────────────────────────────────────────────────────────────
// createInvoice (action — compone counter + derivación + insert)
// ─────────────────────────────────────────────────────────────────────────────

export const createInvoice = action({
  args: {
    patientId: v.id("patients"),
    amountExpected: v.string(), // "50.00"
    currency: currencyEnum,
    subscriptionMonths: v.number(),
    // Para USDT: dirección del contrato ERC-20. Para SYS nativo: omitir.
    tokenContractAddress: v.optional(v.string()),
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
    // 1. RBAC: solo admin. Como esto es action, verificamos vía mutation helper.
    //    Usamos un internalMutation que valida admin y reserva el index.
    const reserved = await ctx.runMutation(
      internal.payments.invoices.reserveInvoiceSlot,
      {},
    );

    // 2. Derivar dirección desde HD wallet (A14, node action)
    const derived = await ctx.runAction(
      internal.payments.hdwallet.deriveSyscoinAddress,
      {
        network: "syscoin_testnet",
        derivationIndex: reserved.derivationIndex,
      },
    );

    // 3. Persistir el invoice (internalMutation transaccional)
    const result = await ctx.runMutation(
      internal.payments.invoices.insertInvoice,
      {
        adminProfileId: reserved.adminProfileId,
        patientId: args.patientId,
        derivationIndex: reserved.derivationIndex,
        derivedAddress: derived.address,
        amountExpected: args.amountExpected,
        currency: args.currency,
        tokenContractAddress: args.tokenContractAddress,
        subscriptionMonths: args.subscriptionMonths,
      },
    );

    return {
      invoiceId: result.invoiceId,
      invoiceCode: result.invoiceCode,
      derivedAddress: derived.address,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// reserveInvoiceSlot (internalMutation) — valida admin + reserva derivationIndex
// ─────────────────────────────────────────────────────────────────────────────

export const reserveInvoiceSlot = internalMutation({
  args: {},
  returns: v.object({
    adminProfileId: v.id("profiles"),
    derivationIndex: v.number(),
  }),
  handler: async (ctx): Promise<{
    adminProfileId: Id<"profiles">;
    derivationIndex: number;
  }> => {
    // requireAdmin funciona en mutation (tiene ctx.auth + ctx.db)
    const admin = await requireAdmin(ctx);
    const derivationIndex: number = await ctx.runMutation(
      internal.payments.derivation.getNextDerivationIndex,
      {},
    );
    return { adminProfileId: admin._id, derivationIndex };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// insertInvoice (internalMutation) — assertUnique + insert + audit
// ─────────────────────────────────────────────────────────────────────────────

export const insertInvoice = internalMutation({
  args: {
    adminProfileId: v.id("profiles"),
    patientId: v.id("patients"),
    derivationIndex: v.number(),
    derivedAddress: v.string(),
    amountExpected: v.string(),
    currency: currencyEnum,
    tokenContractAddress: v.optional(v.string()),
    subscriptionMonths: v.number(),
  },
  returns: v.object({
    invoiceId: v.id("paymentInvoices"),
    invoiceCode: v.string(),
  }),
  handler: async (ctx, args) => {
    // invoiceCode legible: SPH-<año><index padded>
    const year = new Date().getFullYear();
    const invoiceCode = `SPH-${year}-${String(args.derivationIndex).padStart(6, "0")}`;

    // Unicidad transaccional
    await assertUnique(
      ctx,
      "paymentInvoices",
      "by_invoiceCode",
      (q) => q.eq("invoiceCode", invoiceCode),
      `invoiceCode ${invoiceCode} ya existe`,
    );
    await assertUnique(
      ctx,
      "paymentInvoices",
      "by_derivedAddress",
      (q) => q.eq("derivedAddress", args.derivedAddress),
      `derivedAddress ${args.derivedAddress} ya usado`,
    );

    const tokenDecimals = args.currency === "USDT" ? 6 : 18;
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h para pagar

    const invoiceId = await ctx.db.insert("paymentInvoices", {
      patientId: args.patientId,
      invoiceCode,
      derivedAddress: args.derivedAddress,
      derivationIndex: args.derivationIndex,
      amountExpected: args.amountExpected,
      currency: args.currency,
      tokenDecimals,
      tokenContractAddress: args.tokenContractAddress,
      expectedChainId: SYSCOIN_TESTNET_CHAIN_ID,
      status: "pending",
      expiresAt,
      subscriptionMonths: args.subscriptionMonths,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: args.adminProfileId,
      actorType: "admin",
      action: "PAYMENT_INVOICE_CREATED",
      targetId: invoiceId,
      targetType: "payment",
      channel: "web",
    });

    return { invoiceId, invoiceCode };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getMyInvoices — paciente ve sus invoices
// ─────────────────────────────────────────────────────────────────────────────

export const getMyInvoices = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("paymentInvoices"),
      _creationTime: v.number(),
      invoiceCode: v.string(),
      derivedAddress: v.string(),
      amountExpected: v.string(),
      currency: v.string(),
      tokenDecimals: v.number(),
      expectedChainId: v.number(),
      status: v.string(),
      expiresAt: v.number(),
      subscriptionMonths: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const profile = await getCallerProfile(ctx);
    if (!profile) return [];

    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) return [];

    const invoices = await ctx.db
      .query("paymentInvoices")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .order("desc")
      .take(50);

    return invoices.map((i) => ({
      _id: i._id,
      _creationTime: i._creationTime,
      invoiceCode: i.invoiceCode,
      derivedAddress: i.derivedAddress,
      amountExpected: i.amountExpected,
      currency: i.currency,
      tokenDecimals: i.tokenDecimals,
      expectedChainId: i.expectedChainId,
      status: i.status,
      expiresAt: i.expiresAt,
      subscriptionMonths: i.subscriptionMonths,
    }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// getInvoiceDetail — invoice + sus payments
// ─────────────────────────────────────────────────────────────────────────────

export const getInvoiceDetail = query({
  args: { invoiceId: v.id("paymentInvoices") },
  returns: v.union(
    v.null(),
    v.object({
      invoice: v.object({
        _id: v.id("paymentInvoices"),
        invoiceCode: v.string(),
        derivedAddress: v.string(),
        amountExpected: v.string(),
        currency: v.string(),
        status: v.string(),
        expiresAt: v.number(),
        subscriptionMonths: v.number(),
      }),
      payments: v.array(
        v.object({
          _id: v.id("payments"),
          txHash: v.string(),
          amountReceived: v.string(),
          status: v.string(),
          currentConfirmations: v.number(),
          minConfirmations: v.number(),
          confirmedAt: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await getCallerProfile(ctx);
    if (!profile) return null;

    const invoice = await ctx.db.get("paymentInvoices", args.invoiceId);
    if (!invoice) return null;

    // RBAC: el invoice debe ser del paciente caller, o admin
    if (profile.role !== "admin") {
      const patient = await ctx.db.get("patients", invoice.patientId);
      if (!patient || patient.profileId !== profile._id) return null;
    }

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .take(20);

    return {
      invoice: {
        _id: invoice._id,
        invoiceCode: invoice.invoiceCode,
        derivedAddress: invoice.derivedAddress,
        amountExpected: invoice.amountExpected,
        currency: invoice.currency,
        status: invoice.status,
        expiresAt: invoice.expiresAt,
        subscriptionMonths: invoice.subscriptionMonths,
      },
      payments: payments.map((p) => ({
        _id: p._id,
        txHash: p.txHash,
        amountReceived: p.amountReceived,
        status: p.status,
        currentConfirmations: p.currentConfirmations,
        minConfirmations: p.minConfirmations,
        confirmedAt: p.confirmedAt,
      })),
    };
  },
});

export const listPendingInvoices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const invoices = await ctx.db
      .query("paymentInvoices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return invoices.map((inv) => ({
      _id: inv._id,
      patientId: inv.patientId,
      derivedAddress: inv.derivedAddress,
      currency: inv.currency,
      tokenContractAddress: inv.tokenContractAddress,
      expectedChainId: inv.expectedChainId,
      amountExpected: inv.amountExpected,
      tokenDecimals: inv.tokenDecimals,
    }));
  },
});
