/**
 * SMOKE (validación money-path C) — Scaffold de cita con hold EXPIRADO.
 *
 * Crea el estado EXACTO que dispara la rama `late_payment` de
 * confirmAppointmentPayment (booking.ts): un pago que llega FUERA del hold.
 *   - appointmentSlots: "available" -> "held" con heldUntil en el PASADO.
 *   - appointments: "pending" vinculado a slot + patient + specialist.
 *   - paymentInvoices: "pending", derivedAddress/derivationIndex únicos (>= 9500),
 *     amountExpected = consultationFeeSYS del especialista del slot.
 *
 * Al correr confirmPaymentFromMonitor sobre la invoice resultante:
 *   withinHold === false (slot.heldUntil < now) -> outcome "late_payment":
 *   invoice.status -> "late_payment"; appointment -> "pending_payment_late"
 *   (entra a la cola admin listLatePaymentAppointments, con txHash/monto
 *   preservados); slot NO se libera.
 *
 * Idempotente: reutiliza un scaffold SMOKE-LATE aún sin procesar (invoice
 * "pending" con código "SPH-SMOKE-LATE-*", appointment "pending", slot "held").
 * Tras confirmPaymentFromMonitor la invoice pasa a "late_payment" y el siguiente
 * run crea uno nuevo.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { assertUnique } from "../lib/unique";

const SYSCOIN_TESTNET_CHAIN_ID = 5700;
const HOLD_PAST_MS = 60 * 60 * 1000; // heldUntil = now - 1h (hold ya vencido)
const SMOKE_LATE_PREFIX = "SPH-SMOKE-LATE-";
const SMOKE_LATE_INDEX_BASE = 9500;

export const seedLateInvoice = internalMutation({
  args: {},
  returns: v.object({
    appointmentId: v.id("appointments"),
    invoiceId: v.id("paymentInvoices"),
    invoiceCode: v.string(),
    amountExpected: v.string(),
    reused: v.boolean(),
  }),
  handler: async (ctx, args) => {
    void args;
    const now = Date.now();

    // ── Idempotencia: reutilizar scaffold SMOKE-LATE aún sin procesar ─────────
    const pendingInvoices = await ctx.db
      .query("paymentInvoices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const invoice of pendingInvoices) {
      if (!invoice.invoiceCode.startsWith(SMOKE_LATE_PREFIX)) continue;
      if (!invoice.appointmentId) continue;
      const appointment = await ctx.db.get("appointments", invoice.appointmentId);
      if (!appointment || appointment.status !== "pending") continue;
      const slot = await ctx.db.get("appointmentSlots", appointment.slotId);
      if (!slot || slot.status !== "held") continue;
      return {
        appointmentId: appointment._id,
        invoiceId: invoice._id,
        invoiceCode: invoice.invoiceCode,
        amountExpected: invoice.amountExpected,
        reused: true,
      };
    }

    // ── Prerrequisitos: paciente + slot disponible futuro ────────────────────
    const patient = await ctx.db.query("patients").first();
    if (!patient) {
      throw new ConvexError({
        code: "NO_PATIENT",
        message: "No hay patients en el deployment (correr seedTestData primero)",
      });
    }

    const availableSlots = await ctx.db
      .query("appointmentSlots")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .collect();
    // Recorre los slots futuros hasta encontrar uno con especialista resoluble
    // (no abortar por el primer slot futuro si su specialistId quedó huérfano).
    let slot: Doc<"appointmentSlots"> | undefined;
    let specialist: Doc<"marketplaceSpecialists"> | null = null;
    for (const candidate of availableSlots) {
      if (candidate.startTime <= now) continue;
      const resolved = await ctx.db.get(
        "marketplaceSpecialists",
        candidate.specialistId,
      );
      if (!resolved) continue;
      slot = candidate;
      specialist = resolved;
      break;
    }
    if (!slot || !specialist) {
      throw new ConvexError({
        code: "NO_AVAILABLE_SLOT",
        message:
          "No hay appointmentSlots 'available' futuros con especialista válido",
      });
    }
    const amountExpected = specialist.consultationFeeSYS;

    // ── derivationIndex / derivedAddress únicos (>= 9500) ────────────────────
    const allInvoices = await ctx.db.query("paymentInvoices").collect();
    const usedLate = allInvoices.filter((i) =>
      i.invoiceCode.startsWith(SMOKE_LATE_PREFIX),
    ).length;
    const derivationIndex = SMOKE_LATE_INDEX_BASE + usedLate;
    const derivedAddress = "0x" + derivationIndex.toString(16).padStart(40, "0");
    const invoiceCode = `${SMOKE_LATE_PREFIX}${derivationIndex}`;

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
      (q) => q.eq("derivedAddress", derivedAddress),
      `derivedAddress ${derivedAddress} ya usado`,
    );

    // ── Replica de createAppointmentHold pero con hold EXPIRADO ───────────────
    const appointmentId = await ctx.db.insert("appointments", {
      specialistId: slot.specialistId,
      patientId: patient._id,
      slotId: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: "pending",
      createdAt: now,
    });

    await ctx.db.patch("appointmentSlots", slot._id, {
      status: "held",
      patientId: patient._id,
      heldUntil: now - HOLD_PAST_MS, // hold vencido -> fuerza late_payment
    });

    const invoiceId = await ctx.db.insert("paymentInvoices", {
      patientId: patient._id,
      invoiceCode,
      derivedAddress,
      derivationIndex,
      amountExpected,
      currency: "SYS",
      tokenDecimals: 18,
      expectedChainId: SYSCOIN_TESTNET_CHAIN_ID,
      status: "pending",
      expiresAt: now - HOLD_PAST_MS,
      subscriptionMonths: 0,
      appointmentId,
    });

    await ctx.db.patch("appointments", appointmentId, { invoiceId });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "APPOINTMENT_CREATED",
      targetId: appointmentId,
      channel: "system",
    });
    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "PAYMENT_INVOICE_CREATED",
      targetId: invoiceId,
      targetType: "payment",
      channel: "system",
    });

    return {
      appointmentId,
      invoiceId,
      invoiceCode,
      amountExpected,
      reused: false,
    };
  },
});
