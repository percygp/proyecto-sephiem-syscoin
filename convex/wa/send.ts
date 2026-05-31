import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { buildMessage, type TemplateParams } from "./templates";

const WA_FAILURE_THRESHOLD = 5;
const WA_FAILURE_WINDOW_MS = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal queries
// ─────────────────────────────────────────────────────────────────────────────

export const _getPatientProfile = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;
    const profile = await ctx.db.get(patient.profileId);
    if (!profile) return null;
    return { patient, profile };
  },
});

export const _hasWaConsent = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    const consent = await ctx.db
      .query("consents")
      .filter((q) =>
        q.and(
          q.eq(q.field("patientId"), args.patientId),
          q.eq(q.field("consentType"), "whatsapp_notifications"),
           q.eq(q.field("granted"), true),
        ),
      )
      .unique();
    return consent !== null;
  },
});

export const _countRecentFailures = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - WA_FAILURE_WINDOW_MS;
    const recent = await ctx.db
      .query("waNotifications")
      .withIndex("by_sentAt", (q) => q.gte("sentAt", cutoff))
      .collect();
    return recent.filter((n) => n.status === "failed").length;
  },
});

export const _getPatientName = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return null;
    const profile = await ctx.db.get(patient.profileId);
    return profile?.name ?? null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// sendWaNotification — sends a WhatsApp message via Twilio REST API
// ─────────────────────────────────────────────────────────────────────────────

export const sendWaNotification = internalAction({
  args: {
    patientId: v.id("patients"),
    templateCode: v.union(
      v.literal("CHECKIN_INVITATION"),
      v.literal("NEW_DOCTOR_MESSAGE"),
      v.literal("APPOINTMENT_REMINDER"),
      v.literal("HEALTH_PLAN_REMINDER"),
      v.literal("SUBSCRIPTION_RENEWAL"),
      v.literal("MEDICAL_ALERT_URGENT"),
    ),
    params: v.optional(
      v.object({
        patientName: v.optional(v.string()),
        date: v.optional(v.string()),
        time: v.optional(v.string()),
        doctorName: v.optional(v.string()),
        invoiceCode: v.optional(v.string()),
        amount: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken || !fromNumber) return;

    const consent = await ctx.runQuery(internal.wa.send._hasWaConsent, {
      patientId: args.patientId,
    });
    if (!consent) return;

    const patientData = await ctx.runQuery(internal.wa.send._getPatientProfile, {
      patientId: args.patientId,
    });
    if (!patientData || !patientData.profile.phone) return;

    const patientName = args.params?.patientName ?? patientData.profile.name;
    const params: TemplateParams = {
      ...args.params,
      patientName: patientName ?? undefined,
    };

    const message = buildMessage(args.templateCode, params);
    if (!message) return;

    const toNumber = `whatsapp:${patientData.profile.phone}`;
    const body = new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: message,
    });

    let success = false;
    let twilioSid: string | undefined;

    try {
      const auth = btoa(`${accountSid}:${authToken}`);
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );
      if (response.ok) {
        const data = await response.json();
        twilioSid = data.sid;
        success = true;
      } else {
        const errorBody = await response.text();
        console.error("[WA] Twilio API error:", response.status, errorBody);
      }
    } catch (err) {
      console.error("[WA] fetch error:", err);
    }

    await ctx.runMutation(internal.wa.send._createWaLog, {
      patientId: args.patientId,
      templateCode: args.templateCode,
      status: success ? "sent" : "failed",
      twilioSid,
    });

    await ctx.runMutation(internal.audit.log, {
      actorType: "system",
      action: "WA_NOTIFICATION_SENT",
      targetId: args.patientId,
      targetType: "patient",
      channel: "whatsapp",
    });

    if (!success) {
      const failures = await ctx.runQuery(internal.wa.send._countRecentFailures, {});
      if (failures >= WA_FAILURE_THRESHOLD) {
        await ctx.runAction(
          internal.maintenance.alertOps.sendOpsAlert,
          {
            level: "warning",
            event: "WA_FAILURES",
            resourceType: "system",
            resourceId: args.patientId,
          },
        );
      }
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal mutation: log wa notification
// ─────────────────────────────────────────────────────────────────────────────

export const _createWaLog = internalMutation({
  args: {
    patientId: v.id("patients"),
    templateCode: v.union(
      v.literal("CHECKIN_INVITATION"),
      v.literal("NEW_DOCTOR_MESSAGE"),
      v.literal("APPOINTMENT_REMINDER"),
      v.literal("HEALTH_PLAN_REMINDER"),
      v.literal("SUBSCRIPTION_RENEWAL"),
      v.literal("MEDICAL_ALERT_URGENT"),
    ),
    status: v.union(v.literal("sent"), v.literal("failed")),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("waNotifications", {
      patientId: args.patientId,
      templateCode: args.templateCode,
      status: args.status,
      twilioSid: args.twilioSid,
      sentAt: Date.now(),
    });
  },
});
