/**
 * SMOKE (validación money-path B) — Scaffold de payout "earned" listo a promover.
 *
 * Crea una cita "completed" + un specialistPayouts en estado "earned" con
 * earnedAt BACKDATEADO > 24h, de modo que el cron updatePayoutStatuses lo
 * promueva earned -> payable sin esperar la ventana real, y luego
 * processReadyPayouts lo lleve payable -> processing -> paid (mock txHash).
 *
 * Replica la lógica de completeAppointment (booking.ts) SIN auth de app:
 * mismo split de comisión (computePayoutSplit) y hash de wallet destino
 * (truncatedSha256), status inicial "earned".
 *
 * Idempotente: si ya existe un payout "earned" con earnedAt vencido (> 24h),
 * lo reutiliza en vez de crear otro.
 */
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { computePayoutSplit, truncatedSha256 } from "../lib/money";

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 30 * 60 * 1000;
const BACKDATE_MS = 25 * 60 * 60 * 1000; // 25h: supera la ventana de 24h del cron

export const seedEarnedPayout = internalMutation({
  args: {},
  returns: v.object({
    payoutId: v.id("specialistPayouts"),
    reused: v.boolean(),
  }),
  handler: async (ctx, args) => {
    void args;
    const now = Date.now();

    // ── Idempotencia: reutilizar un earned ya vencido (promovible) ───────────
    const earnedPayouts = await ctx.db
      .query("specialistPayouts")
      .withIndex("by_status", (q) => q.eq("status", "earned"))
      .collect();
    const ready = earnedPayouts.find(
      (p) => p.earnedAt !== undefined && now - p.earnedAt >= DAY_MS,
    );
    if (ready) {
      return { payoutId: ready._id, reused: true };
    }

    // ── Prerrequisitos: paciente + especialista verificado ───────────────────
    const patient = await ctx.db.query("patients").first();
    if (!patient) {
      throw new ConvexError({
        code: "NO_PATIENT",
        message: "No hay patients en el deployment (correr seedTestData primero)",
      });
    }
    const specialist = await ctx.db
      .query("marketplaceSpecialists")
      .withIndex("by_isVerifiedByAdmin", (q) => q.eq("isVerifiedByAdmin", true))
      .first();
    if (!specialist) {
      throw new ConvexError({
        code: "NO_SPECIALIST",
        message: "No hay marketplaceSpecialists verificados",
      });
    }
    const amountSYS = specialist.consultationFeeSYS;
    const backdated = now - BACKDATE_MS;

    // ── Cita completada (slot + appointment) backdateada ─────────────────────
    const slotStart = now - 2 * DAY_MS;
    const slotId = await ctx.db.insert("appointmentSlots", {
      specialistId: specialist._id,
      startTime: slotStart,
      endTime: slotStart + SLOT_MS,
      status: "completed",
      patientId: patient._id,
      createdAt: backdated,
    });
    const appointmentId = await ctx.db.insert("appointments", {
      specialistId: specialist._id,
      patientId: patient._id,
      slotId,
      startTime: slotStart,
      endTime: slotStart + SLOT_MS,
      status: "completed",
      completedAt: backdated,
      amountPaidSYS: amountSYS,
      txHash: "0xSMOKEB",
      createdAt: backdated,
    });

    // ── Payout "earned" (mismo split/hash que completeAppointment) ───────────
    const { platformFeeSYS, amountToSpecialistSYS } = computePayoutSplit(amountSYS);
    const destinationWalletAddressHash = await truncatedSha256(
      specialist.walletAddress,
    );
    const payoutId = await ctx.db.insert("specialistPayouts", {
      specialistId: specialist._id,
      appointmentId,
      amountSYS,
      platformFeeSYS,
      amountToSpecialistSYS,
      status: "earned",
      destinationWalletAddressHash,
      createdAt: backdated,
      earnedAt: backdated,
    });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "SPECIALIST_PAYOUT_EARNED",
      targetId: payoutId,
      channel: "system",
    });

    return { payoutId, reused: false };
  },
});
