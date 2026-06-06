import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getCallerProfile } from "../lib/rbac";

export const _getCallerDiscordId = internalQuery({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const profile = await getCallerProfile(ctx);
    return profile?.discordId ?? null;
  },
});

/**
 * Obtiene la URL directa al DM del bot con el usuario autenticado.
 * Requiere que el usuario haya vinculado su Discord (discordId en perfil).
 * Usa el bot token para crear/obtener el canal DM via Discord API.
 */
export const getDiscordDMUrl = action({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const discordId = await ctx.runQuery(internal.discord.dmChannel._getCallerDiscordId, {});
    if (!discordId) return null;

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return null;

    const res = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordId }),
    });

    if (!res.ok) return null;

    const channel = (await res.json()) as { id: string };
    return `https://discord.com/channels/@me/${channel.id}`;
  },
});
