import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const _findPatientByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const profiles = await ctx.db.query("profiles").collect();
    const profile = profiles.find((p) => p.phone === args.phone);
    if (!profile) return null;
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .first();
    if (!patient) return null;
    return { patientId: patient._id, profileName: profile.name ?? null };
  },
});

export const _logIncomingAudit = internalMutation({
  args: {
    targetId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actorType: "system",
      action: "WA_INCOMING_REDIRECTED",
      targetId: args.targetId,
      targetType: args.targetId ? "patient" : undefined,
      channel: "whatsapp",
    });
  },
});
