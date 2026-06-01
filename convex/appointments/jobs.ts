/**
 * B13 (VAL-57) — Jobs cron de agendamiento/pagos.
 *
 *  - generarSlotsDesdeAvailability (cada hora): crea slots "available" desde la
 *    disponibilidad semanal de especialistas verificados, próximos 14 días,
 *    slots de 30 min. NUNCA modifica slots existentes; idempotente por startTime.
 *  - expireHeldSlots (cada 5 min): held con heldUntil vencido → expired (+ cita +
 *    invoice). Audita APPOINTMENT_EXPIRED.
 *  - updatePayoutStatuses (cada hora): earned con >=24h → payable. Audita
 *    SPECIALIST_PAYOUT_PAYABLE.
 *
 * (processReadyPayouts vive en convex/payments/payouts.ts.)
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const SLOT_MS = 30 * 60 * 1000; // 30 min
const HORIZON_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "HH:MM" → minutos desde medianoche (o null si inválido). */
function parseHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const generarSlotsDesdeAvailability = internalMutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;

    const specialists = await ctx.db
      .query("marketplaceSpecialists")
      .withIndex("by_isVerifiedByAdmin", (q) => q.eq("isVerifiedByAdmin", true))
      .collect();

    for (const specialist of specialists) {
      const avails = (
        await ctx.db
          .query("specialistAvailability")
          .withIndex("by_specialistId", (q) =>
            q.eq("specialistId", specialist._id),
          )
          .collect()
      ).filter((a) => a.isActive);
      if (avails.length === 0) continue;

      // Set de startTimes ya existentes para este especialista (evita duplicados).
      const existing = await ctx.db
        .query("appointmentSlots")
        .withIndex("by_specialistId", (q) =>
          q.eq("specialistId", specialist._id),
        )
        .collect();
      const existingStarts = new Set(existing.map((s) => s.startTime));

      for (let d = 0; d < HORIZON_DAYS; d++) {
        const dayDate = new Date(now + d * DAY_MS);
        const dayMidnightUTC = Date.UTC(
          dayDate.getUTCFullYear(),
          dayDate.getUTCMonth(),
          dayDate.getUTCDate(),
        );
        const dow = new Date(dayMidnightUTC).getUTCDay();

        for (const avail of avails) {
          if (avail.dayOfWeek !== dow) continue;
          const startMin = parseHHMM(avail.startTime);
          const endMin = parseHHMM(avail.endTime);
          if (startMin === null || endMin === null || endMin <= startMin) continue;

          for (let m = startMin; m + 30 <= endMin; m += 30) {
            const slotStart = dayMidnightUTC + m * 60 * 1000;
            if (slotStart <= now) continue; // no slots en el pasado
            if (existingStarts.has(slotStart)) continue;

            await ctx.db.insert("appointmentSlots", {
              specialistId: specialist._id,
              startTime: slotStart,
              endTime: slotStart + SLOT_MS,
              status: "available",
              createdAt: now,
            });
            existingStarts.add(slotStart);
            created++;
          }
        }
      }
    }

    return { created };
  },
});

export const expireHeldSlots = internalMutation({
  args: {},
  returns: v.object({ expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let expired = 0;

    const heldSlots = await ctx.db
      .query("appointmentSlots")
      .withIndex("by_status", (q) => q.eq("status", "held"))
      .collect();

    for (const slot of heldSlots) {
      if (slot.heldUntil === undefined || slot.heldUntil >= now) continue;

      await ctx.db.patch(slot._id, { status: "expired" });

      // Cita pendiente asociada a este slot.
      const appts = await ctx.db
        .query("appointments")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .collect();
      const appointment = appts.find((a) => a.status === "pending");
      if (appointment) {
        await ctx.db.patch(appointment._id, { status: "expired" });
        // Invoice asociada: expira si seguía pendiente.
        if (appointment.invoiceId) {
          const invoice = await ctx.db.get(appointment.invoiceId);
          if (invoice && invoice.status === "pending") {
            await ctx.db.patch(invoice._id, { status: "expired" });
          }
        }
        await ctx.runMutation(internal.audit.log, {
          actorType: "system",
          action: "APPOINTMENT_EXPIRED",
          targetId: appointment._id,
          channel: "system",
        });
      }
      expired++;
    }

    return { expired };
  },
});

export const updatePayoutStatuses = internalMutation({
  args: {},
  returns: v.object({ promoted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let promoted = 0;

    const earned = await ctx.db
      .query("specialistPayouts")
      .withIndex("by_status", (q) => q.eq("status", "earned"))
      .collect();

    for (const payout of earned) {
      if (payout.earnedAt === undefined || now - payout.earnedAt < DAY_MS) continue;
      await ctx.db.patch(payout._id, { status: "payable" });
      await ctx.runMutation(internal.audit.log, {
        actorType: "system",
        action: "SPECIALIST_PAYOUT_PAYABLE",
        targetId: payout._id,
        channel: "system",
      });
      promoted++;
    }

    return { promoted };
  },
});
