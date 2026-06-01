import { query } from "../_generated/server";
import { requireAdmin } from "../lib/rbac";

export const getAdminMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const allPatients = await ctx.db.query("patients").collect();
    const allDoctors = await ctx.db.query("doctors").collect();

    const profileIds = new Set<string>();
    for (const p of allPatients) profileIds.add(p.profileId);
    for (const d of allDoctors) profileIds.add(d.profileId);

    const activePatients = allPatients.filter((p) => p.subscriptionStatus === "active");

    const doctorsWithProfiles = [];
    for (const d of allDoctors) {
      const profile = await ctx.db.get("profiles", d.profileId);
      if (profile?.isActive !== false) {
        doctorsWithProfiles.push(d);
      }
    }

    const consultations = await ctx.db.query("consultations").collect();
    const consultationsMonth = consultations.filter(
      (c) => c.scheduledAt > now - thirtyDays,
    );

    const payments = await ctx.db.query("payments").collect();
    const confirmedPayments = payments.filter(
      (p) => p.status === "confirmed" && p.confirmedAt && p.confirmedAt > now - thirtyDays,
    );
    const monthlyRevenue = confirmedPayments.reduce(
      (sum, p) => sum + Number(p.amountReceived),
      0,
    );

    const patientsByMonth: Record<string, number> = {};
    const revenueByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now - i * thirtyDays);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      patientsByMonth[key] = 0;
      revenueByMonth[key] = 0;
    }
    for (const p of allPatients) {
      const d = new Date(p._creationTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (patientsByMonth[key] !== undefined) patientsByMonth[key]++;
    }
    for (const p of confirmedPayments) {
      if (!p.confirmedAt) continue;
      const d = new Date(p.confirmedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (revenueByMonth[key] !== undefined) {
        revenueByMonth[key] += Number(p.amountReceived);
      }
    }

    return {
      totalPatients: allPatients.length,
      activePatients: activePatients.length,
      totalDoctors: doctorsWithProfiles.length,
      totalConsultations: consultations.length,
      consultationsThisMonth: consultationsMonth.length,
      monthlyRevenue: String(monthlyRevenue),
      patientsByMonth,
      revenueByMonth,
      expiredSoon: allPatients.filter((p) => {
        if (!p.subscriptionExpiresAt) return false;
        return p.subscriptionExpiresAt > now && p.subscriptionExpiresAt < now + sevenDays;
      }).length,
    };
  },
});

const sevenDays = 7 * 24 * 60 * 60 * 1000;
