/**
 * A17 — Alertas operativas
 *
 * sendOpsAlert: internalAction que envía una alerta a un canal externo
 * (Telegram o webhook genérico). Payload SIN PHI — solo metadata técnica.
 *
 * Configuración (env vars Convex, opcionales):
 *   - TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  → envía a Telegram
 *   - ALERT_WEBHOOK_URL                       → POST JSON genérico (Discord, etc.)
 *
 * Si ninguna está configurada, retorna { skipped: true } sin fallar. Esto
 * permite que los disparadores (crons) llamen alertOps sin romperse cuando el
 * canal aún no existe (prototipo / pre-VPS).
 *
 * fetch() está disponible en el runtime default de Convex, así que NO requiere
 * "use node".
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const levelEnum = v.union(v.literal("critical"), v.literal("warning"));

// Catálogo cerrado de eventos. Severidad sugerida entre paréntesis:
//   PROCESS_CRASH (crit)            — proceso Hermes cae (VPS/PM2)
//   CRON_CHECKIN_MISSED (crit)      — cron checkin no ejecutó en 25h
//   OPENAI_ERRORS (warn)            — 3+ errores consecutivos OpenAI
//   WA_FAILURES (warn)              — 5+ envíos WA fallidos/hora
//   RPC_DOWN (crit)                 — ambos RPC Syscoin sin respuesta
//   RECONCILIATION_DISCREPANCY (warn) — pago sin conciliar por inconsistencia
//   PRG_CHECK_EXPIRED (warn)        — un PRG check approved venció
const eventEnum = v.union(
  v.literal("PROCESS_CRASH"),
  v.literal("CRON_CHECKIN_MISSED"),
  v.literal("OPENAI_ERRORS"),
  v.literal("WA_FAILURES"),
  v.literal("RPC_DOWN"),
  v.literal("RECONCILIATION_DISCREPANCY"),
  v.literal("PRG_CHECK_EXPIRED"),
  v.literal("LATE_PAYMENT_REVIEW"), // B11 (VAL-55): pago de cita fuera del hold
);

export const sendOpsAlert = internalAction({
  args: {
    level: levelEnum,
    event: eventEnum,
    resourceType: v.string(), // "system" | "payment" | "job" | "auth" | ...
    resourceId: v.optional(v.string()), // Convex _id opaco, NUNCA PHI
  },
  returns: v.object({
    sent: v.boolean(),
    channel: v.optional(v.string()),
    skipped: v.boolean(),
  }),
  handler: async (_ctx, args): Promise<{
    sent: boolean;
    channel?: string;
    skipped: boolean;
  }> => {
    // Payload neutro, sin PHI. Solo metadata técnica.
    const payload = {
      level: args.level,
      event: args.event,
      resourceType: args.resourceType,
      resourceId: args.resourceId ?? null,
      timestamp: Date.now(),
      app: "sephiem",
    };

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;

    // Prioridad: Telegram si está configurado, si no webhook genérico.
    if (telegramToken && telegramChatId) {
      const emoji = args.level === "critical" ? "🔴" : "🟡";
      const text =
        `${emoji} *SEPHIEM ${args.level.toUpperCase()}*\n` +
        `event: \`${args.event}\`\n` +
        `resource: \`${args.resourceType}\`` +
        (args.resourceId ? ` \`${args.resourceId}\`` : "") +
        `\ntime: ${new Date(payload.timestamp).toISOString()}`;
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${telegramToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text,
              parse_mode: "Markdown",
            }),
          },
        );
        return { sent: res.ok, channel: "telegram", skipped: false };
      } catch {
        return { sent: false, channel: "telegram", skipped: false };
      }
    }

    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return { sent: res.ok, channel: "webhook", skipped: false };
      } catch {
        return { sent: false, channel: "webhook", skipped: false };
      }
    }

    // Sin canal configurado: no-op seguro.
    return { sent: false, skipped: true };
  },
});


