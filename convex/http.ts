import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Router HTTP de Sephiem
//   - GET  /health — Health check de servicios externos (A17)
//   - POST /twilio — Webhook entrante de Twilio WhatsApp (A19)
//
// El auth ya no se maneja aquí: Privy emite los JWT y el frontend los envía
// a Convex automáticamente vía ConvexProviderWithAuth.

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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default http;
