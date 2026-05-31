/**
 * A11 — Messages del portal web
 *
 * - sendMessage: requireAuth + access conversation + content ≤ 4000 chars +
 *   patch conversation.lastMessageAt. sin auditLog (alta frecuencia).
 * - listMessages: paginationOptsValidator. Orden desc por sentAt. RBAC via
 *   resolveConversationAccess.
 * - markConversationRead: marca todos los mensajes recientes recibidos como
 *   leídos para el caller.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import { assertStringLength } from "../lib/validation";
import { resolveConversationAccess } from "./conversations";

const messageTypeEnum = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("document"),
  v.literal("audio"),
);

// ─────────────────────────────────────────────────────────────────────────────
// sendMessage
// ─────────────────────────────────────────────────────────────────────────────

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    messageType: v.optional(messageTypeEnum),
    mediaStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.id("messages"),
  }),
  handler: async (ctx, args) => {
    const { profile, conversation } = await resolveConversationAccess(
      ctx,
      args.conversationId,
    );

    // Validación content
    assertStringLength(args.content, 1, 4000, "content");

    // senderType según el rol y tipo de conversación
    let senderType: "patient" | "doctor" | "hermes";
    if (profile.role === "patient") senderType = "patient";
    else if (profile.role === "doctor") senderType = "doctor";
    else {
      // admin no debería enviar mensajes en flujos normales
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "admin no envía mensajes en este flujo",
      });
    }

    // No permitir doctor escribiendo en conversación hermes_patient
    if (conversation.type === "hermes_patient" && senderType === "doctor") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Los doctores no participan en conversaciones con Hermes",
      });
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderProfileId: profile._id,
      senderType,
      content: args.content.trim(),
      messageType: args.messageType ?? "text",
      mediaStorageId: args.mediaStorageId,
      isRead: false,
      sentAt: now,
    });

    // Patch lastMessageAt
    await ctx.db.patch(args.conversationId, { lastMessageAt: now });

    // A18: si es conversación con Hermes, agendar procesamiento AI
    if (conversation.type === "hermes_patient") {
      await ctx.scheduler.runAfter(0, internal.ai.hermes.processMessage, {
        conversationId: args.conversationId,
        messageId,
      });
    }

    // A13: notificar al counterpart (no a sí mismo)
    // Solo aplica para conversation type = doctor_patient.
    // hermes_patient: Hermes no recibe notification (es un sistema, A18).
    if (conversation.type === "doctor_patient" && conversation.doctorId) {
      // Si el sender es paciente, notificar al doctor; si es doctor, notificar al paciente
      if (senderType === "patient") {
        const doctor = await ctx.db.get(conversation.doctorId);
        if (doctor) {
          await ctx.runMutation(
            internal.notifications.notifications.create,
            {
              profileId: doctor.profileId,
              type: "new_message",
              relatedId: conversation._id,
            },
          );
        }
      } else if (senderType === "doctor") {
        const patient = await ctx.db.get(conversation.patientId);
        if (patient) {
          await ctx.runMutation(
            internal.notifications.notifications.create,
            {
              profileId: patient.profileId,
              type: "new_message",
              relatedId: conversation._id,
            },
          );
        }
      }
    }

    return { success: true, messageId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listMessages (paginated)
// ─────────────────────────────────────────────────────────────────────────────

export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("messages"),
        _creationTime: v.number(),
        senderProfileId: v.optional(v.id("profiles")),
        senderType: v.string(),
        content: v.string(),
        messageType: v.string(),
        mediaStorageId: v.optional(v.id("_storage")),
        isRead: v.boolean(),
        readAt: v.optional(v.number()),
        sentAt: v.number(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    // RBAC
    await resolveConversationAccess(ctx, args.conversationId);

    const page = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_sentAt", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: page.page.map((m) => ({
        _id: m._id,
        _creationTime: m._creationTime,
        senderProfileId: m.senderProfileId,
        senderType: m.senderType,
        content: m.content,
        messageType: m.messageType,
        mediaStorageId: m.mediaStorageId,
        isRead: m.isRead,
        readAt: m.readAt,
        sentAt: m.sentAt,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      splitCursor: page.splitCursor,
      pageStatus: page.pageStatus,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// markConversationRead — marca mensajes recibidos como leídos
// ─────────────────────────────────────────────────────────────────────────────

export const markConversationRead = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({ marked: v.number() }),
  handler: async (ctx, args) => {
    const { profile } = await resolveConversationAccess(
      ctx,
      args.conversationId,
    );

    const now = Date.now();
    // Solo mensajes que NO envió el caller y aún no leídos
    const unread = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_and_sentAt", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(100);

    let marked = 0;
    for (const m of unread) {
      if (!m.isRead && m.senderProfileId !== profile._id) {
        await ctx.db.patch(m._id, { isRead: true, readAt: now });
        marked++;
      }
    }
    return { marked };
  },
});
