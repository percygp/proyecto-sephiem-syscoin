import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdmin } from "../lib/rbac";

export const listInvoices = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const invoices = await ctx.db.query("paymentInvoices").collect();
    const result = [];
    for (const inv of invoices) {
      const patient = await ctx.db.get(inv.patientId);
      const profile = patient ? await ctx.db.get(patient.profileId) : null;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id))
        .collect();
      const totalReceived = payments
        .filter((p) => p.status === "confirmed")
        .reduce((sum, p) => sum + Number(p.amountReceived), 0);
      result.push({
        _id: inv._id,
        invoiceCode: inv.invoiceCode,
        amountExpected: inv.amountExpected,
        currency: inv.currency,
        status: inv.status,
        expiresAt: inv.expiresAt,
        subscriptionMonths: inv.subscriptionMonths,
        patientName: profile?.name ?? null,
        patientEmail: profile?.email ?? null,
        paymentsCount: payments.length,
        confirmedPayments: payments.filter((p) => p.status === "confirmed").length,
        totalReceived: String(totalReceived),
      });
    }
    result.sort((a, b) => b.expiresAt - a.expiresAt);
    return result;
  },
});

export const getInvoiceDetail = query({
  args: { invoiceId: v.id("paymentInvoices") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const patient = await ctx.db.get(invoice.patientId);
    const profile = patient ? await ctx.db.get(patient.profileId) : null;
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();
    return {
      invoice: {
        _id: invoice._id,
        invoiceCode: invoice.invoiceCode,
        derivedAddress: invoice.derivedAddress,
        derivationIndex: invoice.derivationIndex,
        amountExpected: invoice.amountExpected,
        currency: invoice.currency,
        tokenDecimals: invoice.tokenDecimals,
        tokenContractAddress: invoice.tokenContractAddress,
        expectedChainId: invoice.expectedChainId,
        status: invoice.status,
        expiresAt: invoice.expiresAt,
        subscriptionMonths: invoice.subscriptionMonths,
      },
      patient: {
        _id: patient?._id,
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
      },
      payments: payments.map((p) => ({
        _id: p._id,
        walletAddress: p.walletAddress,
        txHash: p.txHash,
        amountReceived: p.amountReceived,
        currency: p.currency,
        network: p.network,
        status: p.status,
        blockNumber: p.blockNumber,
        currentConfirmations: p.currentConfirmations,
        confirmedAt: p.confirmedAt,
        reconciled: p.reconciled,
      })),
    };
  },
});
