/**
 * SMOKE (validación money-path A) — Scaffold de cita confirmable.
 *
 * Crea el estado EXACTO previo a la confirmación de pago de una cita, replicando
 * la lógica de createAppointmentHold (booking.ts) SIN auth de app:
 *   - appointmentSlots: "available" -> "held" (heldUntil futuro, patientId set)
 *   - appointments: "pending" vinculado a slot + patient + specialist
 *   - paymentInvoices: "pending", derivedAddress/derivationIndex únicos (>= 9000),
 *     amountExpected = consultationFeeSYS del especialista del slot.
 *
 * Idempotente: si ya existe un scaffold SMOKE aún confirmable (invoice "pending"
 * con código "SPH-SMOKE-A-*", appointment "pending" y slot "held" no vencido), lo
 * reutiliza en vez de crear otro.
 *
 * NOTA: confirmPaymentFromMonitor -> confirmAppointmentPayment confirma
 * appointment + slot, pero NO marca la invoice como "paid" (eso solo ocurre en
 * finalizePaymentInternal, ruta on-chain). La invoice queda "pending".
 */
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { assertUnique } from "../lib/unique";

const SYSCOIN_TESTNET_CHAIN_ID = 5700;
const HOLD_FUTURE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días: el hold sobrevive entre runs
const SMOKE_CODE_PREFIX = "SPH-SMOKE-A-";
const SMOKE_INDEX_BASE = 9000;

export const seedConfirmableAppointment = internalMutation({
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

    // ── Idempotencia: reutilizar scaffold SMOKE aún confirmable ──────────────
    const pendingInvoices = await ctx.db
      .query("paymentInvoices")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const invoice of pendingInvoices) {
      if (!invoice.invoiceCode.startsWith(SMOKE_CODE_PREFIX)) continue;
      if (!invoice.appointmentId) continue;
      const appointment = await ctx.db.get("appointments", invoice.appointmentId);
      if (!appointment || appointment.status !== "pending") continue;
      const slot = await ctx.db.get("appointmentSlots", appointment.slotId);
      if (
        !slot ||
        slot.status !== "held" ||
        slot.heldUntil === undefined ||
        slot.heldUntil < now
      ) {
        continue;
      }
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
    // (no asumir que el primer slot futuro tiene un specialistId válido).
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

    // ── derivationIndex / derivedAddress únicos (>= 9000) ────────────────────
    const allInvoices = await ctx.db.query("paymentInvoices").collect();
    const usedSmoke = allInvoices.filter(
      (i) => i.derivationIndex >= SMOKE_INDEX_BASE,
    ).length;
    const derivationIndex = SMOKE_INDEX_BASE + usedSmoke;
    const derivedAddress = "0x" + derivationIndex.toString(16).padStart(40, "0");
    const invoiceCode = `${SMOKE_CODE_PREFIX}${derivationIndex}`;

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

    // ── Replica de createAppointmentHold (sin auth) ──────────────────────────
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
      heldUntil: now + HOLD_FUTURE_MS,
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
      expiresAt: now + HOLD_FUTURE_MS,
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
