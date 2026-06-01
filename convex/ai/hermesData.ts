/**
 * A18 — Acceso a datos de Hermes (queries/mutations internas)
 *
 * processMessage (internalAction) no puede usar ctx.db; delega lectura y
 * escritura a estas funciones internas.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const CONTEXT_MSG_LIMIT = 10;
const CONTEXT_SUMMARY_MAX = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// getHermesContext — contextSummary + últimos N mensajes del hilo
// ─────────────────────────────────────────────────────────────────────────────

export const getHermesContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(
    v.null(),
    v.object({
      patientId: v.id("patients"),
      contextSummary: v.string(),
      promptVersion: v.string(),
      recentMessages: v.array(
        v.object({
          senderType: v.string(),
          content: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.type !== "hermes_patient") return null;

    const patientId = conversation.patientId;

    const hermesState = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", patientId))
      .unique();

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_sentAt", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(CONTEXT_MSG_LIMIT);

    return {
      patientId,
      contextSummary: hermesState?.contextSummary ?? "",
      promptVersion: hermesState?.promptVersion ?? "v1.0",
      // Devolvemos en orden cronológico (oldest first) para el prompt
      recentMessages: recent
        .reverse()
        .map((m) => ({ senderType: m.senderType, content: m.content })),
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// saveHermesReply — inserta respuesta + actualiza hermesState + audit
// ─────────────────────────────────────────────────────────────────────────────

export const saveHermesReply = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    patientId: v.id("patients"),
    content: v.string(),
    promptVersion: v.string(),
    modelVersion: v.string(),
    newContextSummary: v.optional(v.string()),
    reportedMood: v.optional(v.string()),
  },
  returns: v.object({ messageId: v.id("messages") }),
  handler: async (ctx, args): Promise<{ messageId: Id<"messages"> }> => {
    const now = Date.now();

    // 1. Insertar mensaje de Hermes
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderProfileId: undefined, // Hermes no tiene profile
      senderType: "hermes",
      content: args.content,
      messageType: "text",
      isRead: false,
      sentAt: now,
    });

    await ctx.db.patch("conversations", args.conversationId, { lastMessageAt: now });

    // 2. Upsert hermesState
    const existing = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .unique();

    const summary = (args.newContextSummary ?? existing?.contextSummary ?? "")
      .slice(0, CONTEXT_SUMMARY_MAX);

    if (existing) {
      await ctx.db.patch("hermesState", existing._id, {
        contextSummary: summary,
        lastReportedMood: args.reportedMood ?? existing.lastReportedMood,
        promptVersion: args.promptVersion,
        totalInteractions: existing.totalInteractions + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("hermesState", {
        patientId: args.patientId,
        contextSummary: summary,
        lastReportedMood: args.reportedMood,
        alertLevel: "normal",
        promptVersion: args.promptVersion,
        totalInteractions: 1,
        updatedAt: now,
      });
    }

    // 3. Audit HERMES_RESPONSE
    await ctx.runMutation(internal.audit.log, {
      actorType: "hermes",
      action: "HERMES_RESPONSE",
      targetId: messageId,
      targetType: "message",
      channel: "web",
      promptVersion: args.promptVersion,
      modelVersion: args.modelVersion,
    });

    return { messageId };
  },
});
