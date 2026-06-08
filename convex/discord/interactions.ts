import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Actualiza la respuesta diferida visible en el canal (pública). */
async function followup(appId: string, token: string, body: object): Promise<void> {
  try {
    await fetch(
      `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch (err) {
    console.error("[Discord followup] error:", err);
  }
}

/** Envía un DM al usuario. Retorna false si tiene DMs desactivados. */
async function sendDM(botToken: string, userId: string, body: object): Promise<boolean> {
  try {
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: userId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!dmRes.ok) return false;
    const dm = await dmRes.json() as { id: string };

    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return msgRes.ok;
  } catch (err) {
    console.error("[Discord sendDM] error:", err);
    return false;
  }
}

/**
 * Si el comando viene de un canal: envía DM + ACK público.
 * Si viene de un DM: responde directo (sin ACK intermedio).
 * Si el DM falla: avisa sin exponer datos médicos.
 */
async function replyViaDM(
  appId: string,
  token: string,
  botToken: string,
  userId: string,
  dmBody: object,
  fromDM: boolean,
): Promise<void> {
  if (fromDM) {
    await followup(appId, token, dmBody);
    return;
  }
  const sent = botToken ? await sendDM(botToken, userId, dmBody) : false;
  if (sent) {
    await followup(appId, token, { content: "📨 Te envié un DM con la respuesta." });
  } else {
    await followup(appId, token, {
      content: "⚠️ No pude enviarte un DM. Activa los mensajes directos en Discord:\n**Configuración → Privacidad → Permitir mensajes directos de miembros del servidor.**",
    });
  }
}

const COLOR = {
  green:  0x2ecc71,
  blue:   0x3498db,
  orange: 0xe67e22,
  red:    0xe74c3c,
  teal:   0x1abc9c,
};

function simpleEmbed(title: string, description: string, color: number) {
  return { title, description, color, footer: { text: "SEPHIEM • Plataforma Clínica Web3" } };
}

// ─────────────────────────────────────────────────────────────────────────────
// processCommand
// ─────────────────────────────────────────────────────────────────────────────

export const processCommand = internalAction({
  args: { interactionJson: v.string() },
  handler: async (ctx, { interactionJson }) => {
    const i = JSON.parse(interactionJson) as {
      token: string;
      data?: { name?: string; options?: Array<{ name: string; value: string }> };
      member?: { user?: { id?: string; username?: string } };
      user?: { id?: string; username?: string };
    };

    const fromDM    = !i.member; // sin member = viene de un DM directo
    const userObj   = i.member?.user ?? i.user;
    const userId    = userObj?.id ?? "";
    const username  = userObj?.username ?? "usuario";
    const token     = i.token;
    const appId     = process.env.DISCORD_APPLICATION_ID ?? "";
    const botToken  = process.env.DISCORD_BOT_TOKEN ?? "";
    const commandName = i.data?.name ?? "";

    const options: Record<string, string> = {};
    for (const opt of i.data?.options ?? []) {
      options[opt.name] = opt.value;
    }

    if (!appId) {
      console.error("[interactions] DISCORD_APPLICATION_ID no configurado");
      return;
    }

    try {
      switch (commandName) {

        // ── /salud ──────────────────────────────────────────────────────────
        case "salud": {
          const pregunta = options.pregunta ?? "";
          if (!pregunta) {
            await followup(appId, token, { content: "❌ Debes escribir tu consulta. Ejemplo: `/salud tengo fiebre`" });
            return;
          }

          const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, { discordId: userId });

          // Bloquear IA si el usuario no ha vinculado su cuenta
          if (!profile) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed(
                "❌ Cuenta no vinculada",
                `Para usar SEPH-AI debes vincular tu cuenta de Discord en SEPHIEM.\n\n` +
                `**Cómo hacerlo:**\n1. Ingresa al [Portal SEPHIEM](https://sephiem.vercel.app)\n` +
                `2. Ve a **Configuración → Discord**\n3. Pega tu Discord ID\n\n` +
                `Tu Discord ID: \`${userId}\``,
                COLOR.orange,
              )],
            }, fromDM);
            return;
          }

          const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, { profileId: profile._id });
          let contextSummary: string | undefined;
          let promptVersion: string | undefined;
          let history: Array<{ role: "user" | "assistant"; content: string }> | undefined;

          if (patient) {
            const [clinicalCtx, hermesState] = await Promise.all([
              ctx.runQuery(internal.discord.handlers._getPatientClinicalContext, { patientId: patient._id }),
              ctx.runQuery(internal.discord.handlers._getHermesContext, { patientId: patient._id }),
            ]);
            contextSummary = clinicalCtx.contextSummary || undefined;
            promptVersion  = clinicalCtx.promptVersion;
            if (hermesState?.discordHistory && hermesState.discordHistory.length > 0) {
              history = hermesState.discordHistory;
            }
          }

          const reply = await ctx.runAction(internal.discord.handlers._callHermesDiscord, {
            message: pregunta,
            contextSummary,
            promptVersion,
            history,
          });

          if (patient) {
            await ctx.runMutation(internal.discord.handlers._saveDiscordHistory, {
              patientId: patient._id,
              userMessage: pregunta,
              assistantReply: reply,
            });
          }

          await replyViaDM(appId, token, botToken, userId, {
            embeds: [{
              title: "🤖 SEPH-AI — Asistente Médico",
              description: reply,
              color: COLOR.green,
              fields: [{ name: "Tu consulta", value: `> ${pregunta.slice(0, 200)}`, inline: false }],
              footer: { text: "SEPHIEM • Plataforma Clínica Web3" },
            }],
          }, fromDM);
          break;
        }

        // ── /cita ───────────────────────────────────────────────────────────
        case "cita": {
          const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, { discordId: userId });

          if (!profile) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed("❌ Cuenta no vinculada", `Inicia sesión en [SEPHIEM Portal](https://sephiem.vercel.app) → Configuración → Discord.\nTu Discord ID: \`${userId}\``, COLOR.orange)],
            }, fromDM);
            return;
          }

          const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, { profileId: profile._id });
          if (!patient) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed("⚠️ Sin perfil clínico", "Completa tu onboarding en el portal.", COLOR.orange)],
            }, fromDM);
            return;
          }

          const next = await ctx.runQuery(internal.discord.handlers._getNextAppointment, { patientId: patient._id });
          if (!next) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed("📅 Sin citas pendientes", "No tienes citas agendadas próximamente.", COLOR.orange)],
            }, fromDM);
            return;
          }

          const date = new Date(next.startTime);
          await replyViaDM(appId, token, botToken, userId, {
            embeds: [{
              title: "📅 Tu próxima cita",
              color: COLOR.blue,
              fields: [
                { name: "Especialidad", value: next.specialty, inline: true },
                { name: "Fecha", value: date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" }), inline: true },
                { name: "Hora",  value: date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }), inline: true },
                { name: "Estado", value: next.status === "confirmed" ? "✅ Confirmada" : "⏳ Pendiente de confirmación", inline: true },
              ],
              footer: { text: "SEPHIEM • Plataforma Clínica Web3" },
            }],
          }, fromDM);
          break;
        }

        // ── /checkin ────────────────────────────────────────────────────────
        case "checkin": {
          const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, { discordId: userId });

          if (!profile) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed("❌ Cuenta no vinculada", `Inicia sesión en [SEPHIEM Portal](https://sephiem.vercel.app) → Configuración → Discord.\nTu Discord ID: \`${userId}\``, COLOR.orange)],
            }, fromDM);
            return;
          }

          const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, { profileId: profile._id });
          if (!patient) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed("⚠️ Sin perfil clínico", "Completa tu onboarding en el portal.", COLOR.orange)],
            }, fromDM);
            return;
          }

          const mood = options.estado;
          await ctx.runMutation(internal.discord.handlers._updateCheckin, {
            patientId: patient._id,
            mood,
            contextNote: `Check-in vía Discord slash (${username})`,
          });

          await replyViaDM(appId, token, botToken, userId, {
            embeds: [{
              title: "✅ Check-in registrado",
              description: `Tu estado de salud ha sido registrado, ${profile.name}.`,
              color: COLOR.green,
              fields: mood ? [{ name: "Estado reportado", value: mood.slice(0, 200), inline: false }] : [],
              footer: { text: "SEPHIEM • Plataforma Clínica Web3" },
            }],
          }, fromDM);
          break;
        }

        // ── /estado ─────────────────────────────────────────────────────────
        case "estado": {
          const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, { discordId: userId });

          if (!profile) {
            await replyViaDM(appId, token, botToken, userId, {
              embeds: [simpleEmbed("❌ Sin vincular", `Tu Discord **no está vinculado** a SEPHIEM.\nInicia sesión en [SEPHIEM Portal](https://sephiem.vercel.app) → Configuración → Discord.\nTu Discord ID: \`${userId}\``, COLOR.orange)],
            }, fromDM);
            return;
          }

          const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, { profileId: profile._id });
          await replyViaDM(appId, token, botToken, userId, {
            embeds: [simpleEmbed(
              "🔗 Estado de cuenta",
              patient
                ? `✅ Vinculado como **${profile.name}**.\nTus consultas incluyen tu historial clínico.`
                : `⚠️ Vinculado como **${profile.name}** sin perfil clínico activo.\nCompleta tu onboarding en el portal.`,
              patient ? COLOR.green : COLOR.orange,
            )],
          }, fromDM);
          break;
        }

        // ── /ayuda ──────────────────────────────────────────────────────────
        case "ayuda": {
          await followup(appId, token, {
            embeds: [{
              title: "🏥 SEPHIEM Bot — Comandos",
              description: "Plataforma de gestión clínica Web3",
              color: COLOR.teal,
              fields: [
                {
                  name: "Comandos disponibles",
                  value:
                    "`/salud <pregunta>` — consulta al asistente SEPH-AI\n" +
                    "`/cita` — tu próxima cita médica\n" +
                    "`/checkin [estado]` — registro diario de salud\n" +
                    "`/estado` — verificar vinculación con SEPHIEM\n" +
                    "`/ayuda` — este mensaje",
                  inline: false,
                },
                {
                  name: "🔒 Privacidad",
                  value: "Los comandos personales responden por DM — nadie más los ve.",
                  inline: false,
                },
              ],
              footer: { text: "SEPHIEM • Plataforma Clínica Web3" },
            }],
          });
          break;
        }

        default:
          await followup(appId, token, { content: "❌ Comando no reconocido. Usa `/ayuda` para ver los comandos." });
      }
    } catch (err) {
      console.error("[processCommand] error:", err);
      await followup(appId, token, { content: "⚠️ Error interno. Intenta de nuevo en unos segundos." });
    }
  },
});
