import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireAdmin } from "../lib/rbac";

export const listAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
    actionFilter: v.optional(v.string()),
    actorTypeFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = args.limit ?? 100;
    let logs = await ctx.db.query("auditLogs").order("desc").take(limit);
    if (args.actionFilter) {
      logs = logs.filter((l) => l.action === args.actionFilter);
    }
    if (args.actorTypeFilter) {
      logs = logs.filter((l) => l.actorType === args.actorTypeFilter);
    }
    const result = [];
    for (const log of logs) {
      let actorName: string | null = null;
      if (log.actorProfileId) {
        const profile = await ctx.db.get("profiles", log.actorProfileId);
        actorName = profile?.name ?? null;
      }
      result.push({
        _id: log._id,
        _creationTime: log._creationTime,
        actorType: log.actorType,
        actorName,
        action: log.action,
        targetId: log.targetId,
        targetType: log.targetType,
        channel: log.channel,
        ipAddress: log.ipAddress,
        promptVersion: log.promptVersion,
        modelVersion: log.modelVersion,
      });
    }
    return result;
  },
});

export const getAuditDetail = query({
  args: { auditLogId: v.id("auditLogs") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const log = await ctx.db.get("auditLogs", args.auditLogId);
    if (!log) return null;
    let actorName: string | null = null;
    if (log.actorProfileId) {
      const profile = await ctx.db.get("profiles", log.actorProfileId);
      actorName = profile?.name ?? null;
    }
    return {
      _id: log._id,
      _creationTime: log._creationTime,
      actorProfileId: log.actorProfileId,
      actorName,
      actorType: log.actorType,
      action: log.action,
      targetId: log.targetId,
      targetType: log.targetType,
      channel: log.channel,
      ipAddress: log.ipAddress,
      promptVersion: log.promptVersion,
      modelVersion: log.modelVersion,
    };
  },
});
