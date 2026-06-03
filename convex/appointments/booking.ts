/**
 * B11 (VAL-55) — Booking: hold de cita + confirmación de pago + pago tardío
 *
 * Flujo (fiel a Linear):
 *  - createAppointmentHold (action, paciente): valida slot, crea appointment
 *    "pending", pone el slot en "held" 15 min, y crea un paymentInvoice (con
 *    appointmentId) reusando la derivación HD existente.
 *  - confirmPaymentFromMonitor: lo dispara el pipeline on-chain
 *    (finalizePaymentInternal) cuando una invoice de cita confirma pago. Si el
 *    pago entra dentro del hold → confirma cita; si no → late_payment + alerta.
 *  - handleLatePayment (admin): reagenda / emite crédito / rechaza.
 *
 * SIN PHI en auditLogs: solo IDs internos.
 */
import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireAuth, requireAdmin } from "../lib/rbac";
import { requireFeatureFlag } from "../lib/featureFlags";
import { assertUnique } from "../lib/unique";
import { computePayoutSplit, truncatedSha256 } from "../lib/money";

const HOLD_MS = 15 * 60 * 1000; // 15 min
const SYSCOIN_TESTNET_CHAIN_ID = 5700;

// ─────────────────────────────────────────────────────────────────────────────
// createAppointmentHold (action) — orquesta hold + derivación + invoice
// ─────────────────────────────────────────────────────────────────────────────

export const createAppointmentHold = action({
  args: { slotId: v.id("appointmentSlots") },
  returns: v.object({
    appointmentId: v.id("appointments"),
    invoiceId: v.id("paymentInvoices"),
    invoiceCode: v.string(),
    derivedAddress: v.string(),
    amountExpected: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    appointmentId: Id<"appointments">;
    invoiceId: Id<"paymentInvoices">;
    invoiceCode: string;
    derivedAddress: string;
    amountExpected: string;
  }> => {
    // 1. Hold atómico + reserva de índice (auth del paciente se propaga).
    const held = await ctx.runMutation(
      internal.appointments.booking.holdSlotInternal,
      { slotId: args.slotId },
    );

    // 2. Derivar dirección HD (action node).
    const derived = await ctx.runAction(
      internal.payments.hdwallet.deriveSyscoinAddress,
      { network: "syscoin_testnet", derivationIndex: held.derivationIndex },
    );

    // 3. Insertar invoice de cita y enlazarla al appointment.
    const inv = await ctx.runMutation(
      internal.appointments.booking.insertAppointmentInvoiceInternal,
      {
        appointmentId: held.appointmentId,
        patientId: held.patientId,
        derivationIndex: held.derivationIndex,
        derivedAddress: derived.address,
        amountExpected: held.amountExpected,
      },
    );

    return {
      appointmentId: held.appointmentId,
      invoiceId: inv.invoiceId,
      invoiceCode: inv.invoiceCode,
      derivedAddress: derived.address,
      amountExpected: held.amountExpected,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// holdSlotInternal (internalMutation) — transacción atómica del hold
// ─────────────────────────────────────────────────────────────────────────────

export const holdSlotInternal = internalMutation({
  args: { slotId: v.id("appointmentSlots") },
  returns: v.object({
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    derivationIndex: v.number(),
    amountExpected: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "appointmentsEnabled");
    const profile = await requireAuth(ctx);

    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    if (!patient) {
      throw new ConvexError({
        code: "PATIENT_NOT_FOUND",
        message: "Solo un paciente puede reservar una cita",
      });
    }

    const slot = await ctx.db.get("appointmentSlots", args.slotId);
    if (!slot) {
      throw new ConvexError({ code: "SLOT_NOT_FOUND", message: "Slot no existe" });
    }
    if (slot.status !== "available") {
      throw new ConvexError({
        code: "SLOT_NOT_AVAILABLE",
        message: `El slot no está disponible (status: ${slot.status})`,
      });
    }
    const now = Date.now();
    if (slot.startTime <= now) {
      throw new ConvexError({
        code: "SLOT_IN_PAST",
        message: "El slot ya no es futuro",
      });
    }

    // No permitir doble booking del paciente en horario solapado.
    const activePatientAppointments = await ctx.db
      .query("appointments")
      .withIndex("by_patientId", (q) => q.eq("patientId", patient._id))
      .collect();
    const overlaps = activePatientAppointments.some(
      (a) =>
        (a.status === "pending" || a.status === "confirmed") &&
        a.startTime < slot.endTime &&
        a.endTime > slot.startTime,
    );
    if (overlaps) {
      throw new ConvexError({
        code: "APPOINTMENT_OVERLAP",
        message: "Ya tienes una cita activa en ese horario",
      });
    }

    const specialist = await ctx.db.get("marketplaceSpecialists", slot.specialistId);
    if (!specialist) {
      throw new ConvexError({
        code: "SPECIALIST_NOT_FOUND",
        message: "Especialista del slot no existe",
      });
    }

    // Crea appointment pending + pone el slot en held.
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
      heldUntil: now + HOLD_MS,
    });

    const derivationIndex: number = await ctx.runMutation(
      internal.payments.derivation.getNextDerivationIndex,
      {},
    );

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: profile.role,
      action: "APPOINTMENT_CREATED",
      targetId: appointmentId,
      channel: "web",
    });

    return {
      appointmentId,
      patientId: patient._id,
      derivationIndex,
      amountExpected: specialist.consultationFeeSYS,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// insertAppointmentInvoiceInternal (internalMutation)
// ─────────────────────────────────────────────────────────────────────────────

export const insertAppointmentInvoiceInternal = internalMutation({
  args: {
    appointmentId: v.id("appointments"),
    patientId: v.id("patients"),
    derivationIndex: v.number(),
    derivedAddress: v.string(),
    amountExpected: v.string(),
  },
  returns: v.object({
    invoiceId: v.id("paymentInvoices"),
    invoiceCode: v.string(),
  }),
  handler: async (ctx, args) => {
    const year = new Date().getFullYear();
    const invoiceCode = `SPH-${year}-${String(args.derivationIndex).padStart(6, "0")}`;

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

    const invoiceId = await ctx.db.insert("paymentInvoices", {
      patientId: args.patientId,
      invoiceCode,
      derivedAddress: args.derivedAddress,
      derivationIndex: args.derivationIndex,
      amountExpected: args.amountExpected,
      currency: "SYS",
      tokenDecimals: 18,
      expectedChainId: SYSCOIN_TESTNET_CHAIN_ID,
      status: "pending",
      expiresAt: Date.now() + HOLD_MS,
      subscriptionMonths: 0,
      appointmentId: args.appointmentId,
    });

    await ctx.db.patch("appointments", args.appointmentId, { invoiceId });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "PAYMENT_INVOICE_CREATED",
      targetId: invoiceId,
      targetType: "payment",
      channel: "system",
    });

    return { invoiceId, invoiceCode };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// confirmAppointmentPayment (helper plano) — compartido por el pipeline on-chain
// y por confirmPaymentFromMonitor. NO es función registrada.
// ─────────────────────────────────────────────────────────────────────────────

export async function confirmAppointmentPayment(
  ctx: MutationCtx,
  invoiceId: Id<"paymentInvoices">,
  txHash: string,
  amountPaidSYS: string,
): Promise<{ outcome: "confirmed" | "late_payment" | "skipped" }> {
  const invoice = await ctx.db.get("paymentInvoices", invoiceId);
  if (!invoice || !invoice.appointmentId) return { outcome: "skipped" };

  const appointment = await ctx.db.get("appointments", invoice.appointmentId);
  if (!appointment) return { outcome: "skipped" };
  const slot = await ctx.db.get("appointmentSlots", appointment.slotId);
  const now = Date.now();

  const withinHold =
    appointment.status === "pending" &&
    !!slot &&
    slot.status === "held" &&
    slot.heldUntil !== undefined &&
    slot.heldUntil >= now &&
    slot.patientId === invoice.patientId &&
    slot._id === appointment.slotId;

  if (withinHold) {
    await ctx.db.patch("appointments", appointment._id, {
      status: "confirmed",
      txHash,
      amountPaidSYS,
    });
    await ctx.db.patch("appointmentSlots", slot._id, { status: "confirmed", heldUntil: undefined });
    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "APPOINTMENT_CONFIRMED",
      targetId: appointment._id,
      channel: "system",
    });
    return { outcome: "confirmed" };
  }

  // Pago tardío / fuera de hold: NO confirma cita, NO libera slot.
  // Marca la cita para que entre en la cola de revisión admin (listLatePaymentAppointments).
  await ctx.db.patch("appointments", appointment._id, {
    status: "pending_payment_late",
  });
  await ctx.db.patch("paymentInvoices", invoice._id, { status: "late_payment" });
  await ctx.runMutation(internal.audit.log, {
    actorType: "system",
    action: "APPOINTMENT_LATE_PAYMENT_REQUIRES_REVIEW",
    targetId: appointment._id,
    channel: "system",
  });
  await ctx.scheduler.runAfter(
    0,
    internal.maintenance.alertOps.sendOpsAlert,
    {
      level: "warning",
      event: "LATE_PAYMENT_REVIEW",
      resourceType: "payment",
      resourceId: invoice._id,
    },
  );
  return { outcome: "late_payment" };
}

// ─────────────────────────────────────────────────────────────────────────────
// confirmPaymentFromMonitor (internalMutation) — wrapper registrado del helper
// ─────────────────────────────────────────────────────────────────────────────

export const confirmPaymentFromMonitor = internalMutation({
  args: {
    invoiceId: v.id("paymentInvoices"),
    txHash: v.string(),
    amountPaidSYS: v.string(),
  },
  returns: v.object({
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("late_payment"),
      v.literal("skipped"),
    ),
  }),
  handler: async (ctx, args) => {
    return await confirmAppointmentPayment(
      ctx,
      args.invoiceId,
      args.txHash,
      args.amountPaidSYS,
    );
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// handleLatePayment (mutation, admin) — reagendar / crédito / rechazar
// ─────────────────────────────────────────────────────────────────────────────

export const handleLatePayment = mutation({
  args: {
    appointmentId: v.id("appointments"),
    decision: v.union(
      v.literal("reschedule"),
      v.literal("credit"),
      v.literal("reject"),
    ),
  },
  returns: v.object({
    appointmentId: v.id("appointments"),
    decision: v.string(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const appointment = await ctx.db.get("appointments", args.appointmentId);
    if (!appointment) {
      throw new ConvexError({
        code: "APPOINTMENT_NOT_FOUND",
        message: "Cita no encontrada",
      });
    }
    const slot = await ctx.db.get("appointmentSlots", appointment.slotId);

    if (args.decision === "reschedule") {
      await ctx.db.patch("appointments", appointment._id, { status: "pending_reschedule" });
      if (slot) await ctx.db.patch("appointmentSlots", slot._id, { status: "expired" });
    } else if (args.decision === "credit") {
      await ctx.db.patch("appointments", appointment._id, { status: "credit_issued" });
      if (slot) await ctx.db.patch("appointmentSlots", slot._id, { status: "expired" });
    } else {
      // reject
      await ctx.db.patch("appointments", appointment._id, { status: "cancelled" });
      if (slot) {
        await ctx.db.patch("appointmentSlots", slot._id, {
          status: "available",
          patientId: undefined,
          heldUntil: undefined,
        });
      }
    }

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "LATE_PAYMENT_HANDLED",
      targetId: appointment._id,
      channel: "web",
    });

    return { appointmentId: appointment._id, decision: args.decision };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// completeAppointment (mutation, paciente o especialista) — crea payout earned
// ─────────────────────────────────────────────────────────────────────────────

export const completeAppointment = mutation({
  args: { appointmentId: v.id("appointments") },
  returns: v.object({
    appointmentId: v.id("appointments"),
    payoutId: v.id("specialistPayouts"),
  }),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "paymentsEnabled");
    const profile = await requireAuth(ctx);

    const appointment = await ctx.db.get("appointments", args.appointmentId);
    if (!appointment) {
      throw new ConvexError({
        code: "APPOINTMENT_NOT_FOUND",
        message: "Cita no encontrada",
      });
    }
    if (appointment.status !== "confirmed") {
      throw new ConvexError({
        code: "APPOINTMENT_NOT_CONFIRMED",
        message: `La cita debe estar confirmada (status: ${appointment.status})`,
      });
    }

    // Autorización: el paciente dueño o el especialista de la cita (o admin).
    const specialist = await ctx.db.get("marketplaceSpecialists", appointment.specialistId);
    const patient = await ctx.db.get("patients", appointment.patientId);
    const isPatient = !!patient && patient.profileId === profile._id;
    const isSpecialist = !!specialist && specialist.profileId === profile._id;
    if (profile.role !== "admin" && !isPatient && !isSpecialist) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Solo el paciente o el especialista pueden completar la cita",
      });
    }
    if (!specialist) {
      throw new ConvexError({
        code: "SPECIALIST_NOT_FOUND",
        message: "Especialista no encontrado",
      });
    }

    const now = Date.now();
    await ctx.db.patch("appointments", appointment._id, { status: "completed", completedAt: now });
    await ctx.db.patch("appointmentSlots", appointment.slotId, { status: "completed" });

    const amountSYS = appointment.amountPaidSYS ?? "0";
    const { platformFeeSYS, amountToSpecialistSYS } = computePayoutSplit(amountSYS);
    const destinationWalletAddressHash = await truncatedSha256(
      specialist.walletAddress,
    );

    const payoutId = await ctx.db.insert("specialistPayouts", {
      specialistId: appointment.specialistId,
      appointmentId: appointment._id,
      amountSYS,
      platformFeeSYS,
      amountToSpecialistSYS,
      status: "earned", // cita completada → directo a earned
      destinationWalletAddressHash,
      createdAt: now,
      earnedAt: now,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: profile.role,
      action: "APPOINTMENT_COMPLETED",
      targetId: appointment._id,
      channel: "web",
    });
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: profile.role,
      action: "SPECIALIST_PAYOUT_EARNED",
      targetId: payoutId,
      channel: "web",
    });

    return { appointmentId: appointment._id, payoutId };
  },
});
