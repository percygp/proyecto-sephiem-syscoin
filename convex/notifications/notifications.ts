/**
 * A13 — Notifications con plantillas cerradas
 *
 * SIN title/body libres. type enum + templateParams seguros. El texto se
 * resuelve server-side en resolveNotificationText (helper puro). Imposible
 * inyectar PHI desde la mutation.
 *
 * Funciones:
 *  - internal.notifications.notifications.create — única vía de inserción,
 *    llamada por otras mutations server-side (sendMessage, createConsultation,
 *    medicalAlerts, etc.)
 *  - listMyNotifications (paginated)
 *  - countUnreadNotifications (badge)
 *  - markNotificationRead
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError } from "convex/values";
import { requireAuth } from "../lib/rbac";

const notificationTypeEnum = v.union(
  v.literal("appointment_scheduled"),
  v.literal("appointment_reminder"),
  v.literal("payment_confirmed"),
  v.literal("payment_pending"),
  v.literal("hermes_alert"),
  v.literal("medication_reminder"),
  v.literal("new_message"),
  v.literal("subscription_expiring"),
);

// ─────────────────────────────────────────────────────────────────────────────
// Helper puro: resuelve el texto server-side por tipo. Sin PHI.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveNotificationText(
  type: string,
  templateParams: { date?: string; invoiceCode?: string },
): { title: string; body: string } {
  switch (type) {
    case "appointment_scheduled":
      return {
        title: "Nueva consulta agendada",
        body: templateParams.date
          ? `Tu consulta está programada para ${templateParams.date}. Revisa los detalles en tu portal.`
          : "Tu consulta ha sido agendada. Revisa los detalles en tu portal.",
      };
    case "appointment_reminder":
      return {
        title: "Recordatorio de cita",
        body: "Tienes una cita próxima. Revisa tu portal para los detalles.",
      };
    case "payment_confirmed":
      return {
        title: "Pago confirmado",
        body: templateParams.invoiceCode
          ? `Tu pago ${templateParams.invoiceCode} fue confirmado. Acceso activado.`
          : "Tu pago fue confirmado. Acceso activado.",
      };
    case "payment_pending":
      return {
        title: "Pago pendiente",
        body: templateParams.invoiceCode
          ? `Esperamos la confirmación on-chain del pago ${templateParams.invoiceCode}.`
          : "Esperamos la confirmación on-chain de tu pago.",
      };
    case "hermes_alert":
      return {
        title: "Alerta de SEPH-AI",
        body: "SEPH-AI detectó algo importante. Revisa tu portal médico.",
      };
    case "medication_reminder":
      return {
        title: "Recordatorio de medicación",
        body: "Tienes un recordatorio en tu portal sobre tu plan de salud.",
      };
    case "new_message":
      return {
        title: "Nuevo mensaje",
        body: "Tienes un nuevo mensaje en tu portal Sephiem.",
      };
    case "subscription_expiring":
      return {
        title: "Tu suscripción vence pronto",
        body: "Renueva tu suscripción para continuar usando Sephiem.",
      };
    default:
      return {
        title: "Notificación",
        body: "Tienes una notificación en tu portal.",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// internal.create — única vía de inserción
// ─────────────────────────────────────────────────────────────────────────────

export const create = internalMutation({
  args: {
    profileId: v.id("profiles"),
    type: notificationTypeEnum,
    templateParams: v.optional(
      v.object({
        date: v.optional(v.string()),
        invoiceCode: v.optional(v.string()),
      }),
    ),
    relatedId: v.optional(v.string()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      profileId: args.profileId,
      type: args.type,
      templateParams: args.templateParams ?? {},
      relatedId: args.relatedId,
      isRead: false,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// listMyNotifications (paginated)
// ─────────────────────────────────────────────────────────────────────────────

export const listMyNotifications = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("notifications"),
        _creationTime: v.number(),
        type: v.string(),
        title: v.string(),
        body: v.string(),
        relatedId: v.optional(v.string()),
        isRead: v.boolean(),
        readAt: v.optional(v.number()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    // Convex pagination espera que continueCursor sea siempre string.
    // Si no hay auth o profile, retornamos un paginate vacío sobre una query
    // que sabemos será vacía (filtrando por id inexistente).
    const emptyPage = {
      page: [] as Array<{
        _id: import("../_generated/dataModel").Id<"notifications">;
        _creationTime: number;
        type: string;
        title: string;
        body: string;
        relatedId?: string;
        isRead: boolean;
        readAt?: number;
      }>,
      isDone: true,
      continueCursor: "",
    };
    if (!identity) return emptyPage;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!profile) return emptyPage;

    const page = await ctx.db
      .query("notifications")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: page.page.map((n) => {
        const text = resolveNotificationText(n.type, n.templateParams);
        return {
          _id: n._id,
          _creationTime: n._creationTime,
          type: n.type,
          title: text.title,
          body: text.body,
          relatedId: n.relatedId,
          isRead: n.isRead,
          readAt: n.readAt,
        };
      }),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      splitCursor: page.splitCursor,
      pageStatus: page.pageStatus,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// countUnreadNotifications — para el badge
// ─────────────────────────────────────────────────────────────────────────────

export const countUnreadNotifications = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!profile) return 0;

    // Limitado a 100 para mantener el query rápido. Si hay más sin leer,
    // se muestra "99+" en la UI.
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_profileId_and_isRead", (q) =>
        q.eq("profileId", profile._id).eq("isRead", false),
      )
      .take(100);
    return unread.length;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// markNotificationRead
// ─────────────────────────────────────────────────────────────────────────────

export const markNotificationRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const profile = await requireAuth(ctx);
    const notification = await ctx.db.get("notifications", args.notificationId);
    if (!notification) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Notificación no existe",
      });
    }
    if (notification.profileId !== profile._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "No puedes marcar notificaciones de otro usuario",
      });
    }
    if (notification.isRead) {
      return { success: true };
    }
    await ctx.db.patch("notifications", args.notificationId, {
      isRead: true,
      readAt: Date.now(),
    });
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// markAllNotificationsRead
// ─────────────────────────────────────────────────────────────────────────────

export const markAllNotificationsRead = mutation({
  args: {},
  returns: v.object({ marked: v.number() }),
  handler: async (ctx) => {
    const profile = await requireAuth(ctx);
    const now = Date.now();

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_profileId_and_isRead", (q) =>
        q.eq("profileId", profile._id).eq("isRead", false),
      )
      .take(100);

    for (const n of unread) {
      await ctx.db.patch("notifications", n._id, { isRead: true, readAt: now });
    }
    return { marked: unread.length };
  },
});
