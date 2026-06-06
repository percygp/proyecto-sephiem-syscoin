import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Router HTTP de Sephiem
//   - GET  /health              — Health check de servicios externos
//   - POST /twilio              — Webhook entrante de Twilio WhatsApp
//   - POST /api/discord/message — Hermes IA desde Discord
//   - POST /api/discord/appointment — Próxima cita desde Discord
//   - POST /api/discord/checkin — Check-in diario desde Discord
//
// El auth ya no se maneja aquí: Privy emite los JWT y el frontend los envía
// a Convex automáticamente vía ConvexProviderWithAuth.

/** Valida X-Bot-Secret contra la env DISCORD_BOT_SECRET. */
function verifyBotSecret(req: Request): boolean {
  const secret = process.env.DISCORD_BOT_SECRET;
  if (!secret) return false;
  return req.headers.get("X-Bot-Secret") === secret;
}

/** Verifica la firma Ed25519 que Discord incluye en cada interaction. */
async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const message = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signatureHex), message);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): ArrayBuffer {
  const len = hex.length / 2;
  const buffer = new ArrayBuffer(len);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buffer;
}

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (_ctx) => {
    const checks = {
      syscoin_rpc_testnet: false,
      openai_api_key: false,
      telegram_bot: false,
      twilio_credentials: false,
      hd_xpub_testnet: false,
    };

    const rpcUrl =
      process.env.SYSCOIN_RPC_TESTNET ??
      "https://rpc.tanenbaum.io";

    try {
      const rpcRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (rpcRes.ok) {
        const json = await rpcRes.json();
        checks.syscoin_rpc_testnet = typeof json.result === "string";
      }
    } catch {
      // RPC no disponible
    }

    checks.openai_api_key = !!process.env.OPENAI_API_KEY;
    checks.telegram_bot = !!process.env.TELEGRAM_BOT_TOKEN;
    checks.twilio_credentials =
      !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
    checks.hd_xpub_testnet = !!process.env.HD_XPUB_TESTNET;

    const allOk = Object.values(checks).every(Boolean);
    const statusCode = allOk ? 200 : 503;

    return Response.json(
      {
        status: allOk ? "healthy" : "degraded",
        timestamp: Date.now(),
        services: checks,
        summary: `${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} servicios operativos`,
      },
      { status: statusCode },
    );
  }),
});

http.route({
  path: "/twilio",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const formData = await request.formData();
    const from = (formData.get("From") as string) ?? "";
    const phone = from.replace(/^whatsapp:/, "");

    let patientId: string | undefined;
    let profileName: string | null = null;

    if (phone) {
      const result = await ctx.runQuery(internal.wa.inbound._findPatientByPhone, { phone });
      if (result) {
        patientId = result.patientId;
        profileName = result.profileName;
      }
    }

    const autoReply = patientId
      ? `Hola${profileName ? ` ${profileName}` : ""}, gracias por escribirnos. Por favor, revisa tu portal Sephiem para continuar tu atención médica.`
      : "Gracias por contactar a Sephiem. Si eres paciente, ingresa a tu portal para comunicarte con tu médico.";

    await ctx.runMutation(internal.wa.inbound._logIncomingAudit, {
      targetId: patientId,
    });

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${escapeXml(autoReply)}</Body></Message></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Discord: /api/discord/message
// ─────────────────────────────────────────────────────────────────────────────

http.route({
  path: "/api/discord/message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyBotSecret(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { userId?: string; username?: string; message?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { userId, message } = body;
    if (!userId || !message) {
      return Response.json({ error: "Missing userId or message" }, { status: 400 });
    }

    // Buscar perfil vinculado a este Discord ID
    const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, {
      discordId: userId,
    });

    let contextSummary: string | undefined;
    let promptVersion: string | undefined;

    if (profile) {
      const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, {
        profileId: profile._id,
      });
      if (patient) {
        const state = await ctx.runQuery(internal.discord.handlers._getHermesContext, {
          patientId: patient._id,
        });
        contextSummary = state?.contextSummary;
        promptVersion = state?.promptVersion;
      }
    }

    const reply = await ctx.runAction(internal.discord.handlers._callHermesDiscord, {
      message,
      contextSummary,
      promptVersion,
    });

    return Response.json({ reply, linked: !!profile });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Discord: /api/discord/appointment
// ─────────────────────────────────────────────────────────────────────────────

http.route({
  path: "/api/discord/appointment",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyBotSecret(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { userId?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { userId } = body;
    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, {
      discordId: userId,
    });

    if (!profile) {
      return Response.json({
        appointment: null,
        linked: false,
        message: "Tu cuenta de Discord no está vinculada a SEPHIEM. Inicia sesión en el portal y vincula tu cuenta desde Configuración.",
      });
    }

    const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, {
      profileId: profile._id,
    });

    if (!patient) {
      return Response.json({ appointment: null, linked: true, message: "Perfil clínico no encontrado. Completa tu onboarding en el portal." });
    }

    const next = await ctx.runQuery(internal.discord.handlers._getNextAppointment, {
      patientId: patient._id,
    });

    if (!next) {
      return Response.json({ appointment: null, linked: true });
    }

    const date = new Date(next.startTime);
    return Response.json({
      appointment: {
        doctor: next.specialty,
        date: date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" }),
        time: date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
        reason: next.status === "confirmed" ? "Cita confirmada" : "Pendiente de confirmación",
      },
      linked: true,
    });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Discord: /api/discord/checkin
// ─────────────────────────────────────────────────────────────────────────────

http.route({
  path: "/api/discord/checkin",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyBotSecret(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { userId?: string; username?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { userId, username } = body;
    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, {
      discordId: userId,
    });

    if (!profile) {
      return Response.json({
        ok: false,
        message: "Tu cuenta de Discord no está vinculada a SEPHIEM. Visita el portal para vincularla desde Configuración.",
      });
    }

    const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, {
      profileId: profile._id,
    });

    if (!patient) {
      return Response.json({ ok: false, message: "Perfil clínico no encontrado." });
    }

    await ctx.runMutation(internal.discord.handlers._updateCheckin, {
      patientId: patient._id,
      mood: (body as { mood?: string }).mood,
      contextNote: `Check-in diario vía Discord (${username ?? userId})`,
    });

    return Response.json({
      ok: true,
      message: `¡Check-in registrado correctamente! Tu seguimiento está actualizado en el portal, ${profile.name}.`,
    });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Discord: /api/discord/status
// ─────────────────────────────────────────────────────────────────────────────

http.route({
  path: "/api/discord/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyBotSecret(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { userId?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { userId } = body;
    if (!userId) {
      return Response.json({ error: "Missing userId" }, { status: 400 });
    }

    const profile = await ctx.runQuery(internal.discord.handlers._findProfileByDiscordId, {
      discordId: userId,
    });

    if (!profile) {
      return Response.json({
        linked: false,
        message: "❌ Tu cuenta de Discord **no está vinculada** a SEPHIEM.\nInicia sesión en el portal y vincúlala desde Configuración → Cuenta de Discord.",
      });
    }

    const patient = await ctx.runQuery(internal.discord.handlers._getPatientByProfileId, {
      profileId: profile._id,
    });

    return Response.json({
      linked: true,
      message: patient
        ? `✅ Cuenta vinculada a SEPHIEM como **${profile.name}**.\nTus consultas incluirán tu historial clínico.`
        : `⚠️ Cuenta vinculada como **${profile.name}** pero sin perfil clínico activo.\nCompleta tu onboarding en el portal.`,
    });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Discord Interactions API — /api/discord/interaction
// Recibe slash commands directamente de Discord (sin bot Python).
// Flujo: verificar firma Ed25519 → ACK diferido → processCommand en background.
// ─────────────────────────────────────────────────────────────────────────────

http.route({
  path: "/api/discord/interaction",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";
    const signature = request.headers.get("X-Signature-Ed25519") ?? "";
    const timestamp  = request.headers.get("X-Signature-Timestamp") ?? "";

    const body = await request.text();

    // Discord exige verificar la firma — rechazar si falla
    if (!publicKey || !await verifyDiscordSignature(publicKey, signature, timestamp, body)) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction = JSON.parse(body) as { type: number; token?: string };

    // PING — Discord verifica el endpoint al configurarlo
    if (interaction.type === 1) {
      return Response.json({ type: 1 });
    }

    // APPLICATION_COMMAND — slash command
    if (interaction.type === 2) {
      // Responder en <3s con "SEPH-AI está pensando..." (ephemeral = solo visible al usuario)
      await ctx.scheduler.runAfter(0, internal.discord.interactions.processCommand, {
        interactionJson: body,
      });
      return Response.json({ type: 5 });
    }

    return Response.json({ type: 1 });
  }),
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default http;
