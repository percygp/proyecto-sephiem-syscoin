import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getSystemPrompt, extractContextSummary, stripContextSummary, LATEST_VERSION } from "./prompts";

const MAX_RECENT_MSGS = 10;
const MAX_CHECKIN_PATIENTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal queries (reads)
// ─────────────────────────────────────────────────────────────────────────────

export const _getConversation = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});

export const _getPatientMessage = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderType !== "patient") return null;
    return msg;
  },
});

export const _getHermesState = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .unique();
  },
});

export const _getRecentMessages = internalQuery({
  args: { conversationId: v.id("conversations"), limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_sentAt", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(args.limit);
  },
});

export const _getAllHermesStates = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db.query("hermesState").take(args.limit);
  },
});

export const _getHermesConversationByPatient = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_patientId_and_type", (q) =>
        q.eq("patientId", args.patientId).eq("type", "hermes_patient"),
      )
      .unique();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// processMessage — main entry point, called via scheduler from sendMessage
// ─────────────────────────────────────────────────────────────────────────────

export const processMessage = internalAction({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.runQuery(internal.ai.hermes._getConversation, {
      conversationId: args.conversationId,
    });
    if (!conversation || conversation.type !== "hermes_patient") return;

    const patientMessage = await ctx.runQuery(internal.ai.hermes._getPatientMessage, {
      messageId: args.messageId,
    });
    if (!patientMessage) return;

    let state = await ctx.runQuery(internal.ai.hermes._getHermesState, {
      patientId: conversation.patientId,
    });

    if (!state) {
      await ctx.runMutation(internal.ai.hermes.ensureHermesState, {
        patientId: conversation.patientId,
      });
      const fresh = await ctx.runQuery(internal.ai.hermes._getHermesState, {
        patientId: conversation.patientId,
      });
      if (!fresh) return;
      state = fresh;
    }

    const rawMessages = await ctx.runQuery(internal.ai.hermes._getRecentMessages, {
      conversationId: args.conversationId,
      limit: MAX_RECENT_MSGS,
    });
    const recentMessages = [...rawMessages].reverse();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.ai.hermes._sendHermesMessage, {
        conversationId: args.conversationId,
        content: "⚠️ Hermes no está disponible en este momento. Tu mensaje ha sido registrado y será revisado cuando el servicio se reactive.",
      });
      return;
    }

    const systemPrompt = getSystemPrompt(state.promptVersion);
    const openAiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (state.contextSummary) {
      openAiMessages.push({
        role: "system",
        content: `Contexto del paciente: ${state.contextSummary}`,
      });
    }

    for (const msg of recentMessages) {
      openAiMessages.push({
        role: msg.senderType === "hermes" ? "assistant" : "user",
        content: msg.content,
      });
    }

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: openAiMessages,
          max_tokens: 1500,
          temperature: 0.7,
        }),
      });
    } catch (err) {
      console.error("[Hermes] fetch error:", err);
      return;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Hermes] OpenAI API error:", response.status, errorBody);
      return;
    }

    const data = await response.json();
    const aiContent: string = data.choices?.[0]?.message?.content ?? "";
    if (!aiContent) return;

    const newSummary = extractContextSummary(aiContent);
    const cleanContent = stripContextSummary(aiContent);

    if (cleanContent) {
      await ctx.runMutation(internal.ai.hermes._sendHermesMessage, {
        conversationId: args.conversationId,
        content: cleanContent,
      });
    }

    await ctx.runMutation(internal.ai.hermes._updateHermesState, {
      patientId: conversation.patientId,
      contextSummary: newSummary ?? state.contextSummary,
      totalInteractions: state.totalInteractions + 1,
    });

    await ctx.runMutation(internal.audit.log, {
      actorType: "hermes",
      action: "HERMES_RESPONSE",
      targetId: args.conversationId,
      targetType: "message",
      channel: "web",
      promptVersion: state.promptVersion,
      modelVersion: "gpt-4o-mini",
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ensureHermesState — crea hermesState si no existe
// ─────────────────────────────────────────────────────────────────────────────

export const ensureHermesState = internalMutation({
  args: {
    patientId: v.id("patients"),
  },
  returns: v.id("hermesState"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("hermesState", {
      patientId: args.patientId,
      contextSummary: "",
      alertLevel: "normal",
      promptVersion: LATEST_VERSION,
      totalInteractions: 0,
      updatedAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// hermesDailyCheckin — cron diario 9:00
// ─────────────────────────────────────────────────────────────────────────────

export const hermesDailyCheckin = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return;

    const states = await ctx.runQuery(internal.ai.hermes._getAllHermesStates, {
      limit: MAX_CHECKIN_PATIENTS,
    });
    const now = Date.now();

    for (const state of states) {
      if (state.lastCheckinAt && now - state.lastCheckinAt < DAY_MS) continue;
      if (state.totalInteractions === 0) continue;

      const conversation = await ctx.runQuery(
        internal.ai.hermes._getHermesConversationByPatient,
        { patientId: state.patientId },
      );
      if (!conversation || !conversation.isActive) continue;

      const systemPrompt = getSystemPrompt(state.promptVersion);
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];
      if (state.contextSummary) {
        messages.push({
          role: "system",
          content: `Contexto del paciente: ${state.contextSummary}`,
        });
      }
      messages.push({
        role: "user",
        content: "Genera un mensaje de checkin diario breve y cálido para este paciente.",
      });

      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            max_tokens: 500,
            temperature: 0.8,
          }),
        });
      } catch {
        continue;
      }

      if (!response.ok) continue;

      const data = await response.json();
      const aiContent: string = data.choices?.[0]?.message?.content ?? "";
      if (!aiContent) continue;

      const newSummary = extractContextSummary(aiContent);
      const cleanContent = stripContextSummary(aiContent);

      if (cleanContent) {
        await ctx.runMutation(internal.ai.hermes._sendHermesMessage, {
          conversationId: conversation._id,
          content: cleanContent,
        });
      }

      const summary = newSummary ?? state.contextSummary;
      await ctx.runMutation(internal.ai.hermes._updateHermesStateDaily, {
        patientId: state.patientId,
        contextSummary: summary,
        totalInteractions: state.totalInteractions + 1,
        lastCheckinAt: now,
      });

      await ctx.runMutation(internal.audit.log, {
        actorType: "hermes",
        action: "HERMES_RESPONSE",
        targetId: conversation._id,
        targetType: "message",
        channel: "system",
        promptVersion: state.promptVersion,
        modelVersion: "gpt-4o-mini",
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// migrateToV2 — actualiza todos los hermesState a promptVersion v2.0.0
// ─────────────────────────────────────────────────────────────────────────────

export const migrateToV2 = internalMutation({
  args: {},
  handler: async (ctx) => {
    const states = await ctx.db.query("hermesState").collect();
    let count = 0;
    for (const s of states) {
      if (s.promptVersion === "v2.0.0") continue;
      await ctx.db.patch(s._id, { promptVersion: "v2.0.0", updatedAt: Date.now() });
      count++;
    }
    return count;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal mutations (writes)
// ─────────────────────────────────────────────────────────────────────────────

export const _sendHermesMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.type !== "hermes_patient") return;
    const text = args.content.trim().slice(0, 4000);
    if (text.length === 0) return;
    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderType: "hermes",
      content: text,
      messageType: "text",
      isRead: false,
      sentAt: now,
    });
    await ctx.db.patch(args.conversationId, { lastMessageAt: now });
  },
});

export const _updateHermesState = internalMutation({
  args: {
    patientId: v.id("patients"),
    contextSummary: v.string(),
    totalInteractions: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .unique();
    if (!existing) return;
    await ctx.db.patch(existing._id, {
      contextSummary: args.contextSummary.slice(0, 2000),
      totalInteractions: args.totalInteractions,
      updatedAt: Date.now(),
    });
  },
});

export const _updateHermesStateDaily = internalMutation({
  args: {
    patientId: v.id("patients"),
    contextSummary: v.string(),
    totalInteractions: v.number(),
    lastCheckinAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .unique();
    if (!existing) return;
    await ctx.db.patch(existing._id, {
      contextSummary: args.contextSummary.slice(0, 2000),
      totalInteractions: args.totalInteractions,
      lastCheckinAt: args.lastCheckinAt,
      updatedAt: Date.now(),
    });
  },
});
