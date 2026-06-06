/**
 * Discord Bot Handlers
 *
 * Funciones internas que conectan los endpoints HTTP /api/discord/* con el
 * backend Convex. Accesibles solo desde http.ts via ctx.runQuery/runMutation/runAction.
 */
import { v } from "convex/values";
import { internalQuery, internalMutation, internalAction } from "../_generated/server";
import { getSystemPrompt, stripContextSummary, LATEST_VERSION } from "../ai/prompts";

// ─────────────────────────────────────────────────────────────────────────────
// Queries internas
// ─────────────────────────────────────────────────────────────────────────────

export const _findProfileByDiscordId = internalQuery({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
      .unique();
  },
});

export const _getPatientByProfileId = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    return await ctx.db
      .query("patients")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .unique();
  },
});

export const _getNextAppointment = internalQuery({
  args: { patientId: v.id("patients") },
  returns: v.union(
    v.null(),
    v.object({
      specialty: v.string(),
      startTime: v.number(),
      endTime: v.number(),
      status: v.string(),
    }),
  ),
  handler: async (ctx, { patientId }) => {
    const now = Date.now();
    const appts = await ctx.db
      .query("appointments")
      .withIndex("by_patientId", (q) => q.eq("patientId", patientId))
      .order("asc")
      .collect();

    const next = appts.find(
      (a) => a.startTime > now && (a.status === "confirmed" || a.status === "pending"),
    );
    if (!next) return null;

    const specialist = await ctx.db.get("marketplaceSpecialists", next.specialistId);
    return {
      specialty: specialist?.specialty ?? "Especialista",
      startTime: next.startTime,
      endTime: next.endTime,
      status: next.status,
    };
  },
});

export const _getHermesContext = internalQuery({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => {
    return await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", patientId))
      .unique();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations internas
// ─────────────────────────────────────────────────────────────────────────────

export const _updateCheckin = internalMutation({
  args: {
    patientId: v.id("patients"),
    mood: v.optional(v.string()),
    contextNote: v.optional(v.string()),
  },
  handler: async (ctx, { patientId, mood, contextNote }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("hermesState")
      .withIndex("by_patientId", (q) => q.eq("patientId", patientId))
      .unique();

    if (existing) {
      await ctx.db.patch("hermesState", existing._id, {
        lastCheckinAt: now,
        lastReportedMood: mood ?? existing.lastReportedMood,
        updatedAt: now,
        totalInteractions: existing.totalInteractions + 1,
        contextSummary: contextNote
          ? `[Discord check-in] ${contextNote}`.slice(0, 2000)
          : existing.contextSummary,
      });
    } else {
      await ctx.db.insert("hermesState", {
        patientId,
        contextSummary: contextNote ? `[Discord check-in] ${contextNote}`.slice(0, 2000) : "",
        lastCheckinAt: now,
        lastReportedMood: mood,
        alertLevel: "normal",
        promptVersion: LATEST_VERSION,
        totalInteractions: 1,
        updatedAt: now,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Action: llamar OpenAI con el prompt de Hermes
// ─────────────────────────────────────────────────────────────────────────────

export const _callHermesDiscord = internalAction({
  args: {
    message: v.string(),
    contextSummary: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (_ctx, { message, contextSummary, promptVersion }): Promise<string> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return "⚠️ El asistente SEPH-AI no está disponible en este momento. Por favor intenta más tarde.";
    }

    const version = promptVersion ?? LATEST_VERSION;
    const systemPrompt = getSystemPrompt(version);

    const openAiMessages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (contextSummary) {
      openAiMessages.push({
        role: "system" as const,
        content: `Contexto previo del paciente: ${contextSummary}`,
      });
    }

    openAiMessages.push({ role: "user", content: message });

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: openAiMessages,
          max_tokens: 500,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        return "⚠️ SEPH-AI no pudo procesar tu consulta. Intenta más tarde.";
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const raw = data.choices[0]?.message?.content ?? "";
      return stripContextSummary(raw).trim();
    } catch {
      return "⚠️ Timeout al conectar con SEPH-AI. Intenta en unos segundos.";
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation pública: vincular Discord ID al perfil del usuario autenticado
// Llamada desde el portal (requiere Convex auth).
// ─────────────────────────────────────────────────────────────────────────────

export const linkDiscordAccount = internalMutation({
  args: { discordId: v.string(), profileId: v.id("profiles") },
  handler: async (ctx, { discordId, profileId }) => {
    // Verificar que el discordId no esté ya vinculado a otro perfil
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_discordId", (q) => q.eq("discordId", discordId))
      .unique();
    if (existing && existing._id !== profileId) {
      throw new Error("Este Discord ID ya está vinculado a otra cuenta.");
    }
    await ctx.db.patch(profileId, { discordId });
  },
});
