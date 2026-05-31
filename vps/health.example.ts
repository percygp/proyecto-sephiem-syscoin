/**
 * A17 — VPS health endpoint (REFERENCIA — no se ejecuta en este repo)
 *
 * Este archivo es código de referencia para el servicio Node.js del VPS.
 * NO es parte del bundle de Convex ni del frontend. Vive en vps/ como
 * documentación ejecutable de cómo debe lucir el endpoint /health y el
 * reporte de crash via alertOps.
 *
 * Cuando se levante el VPS (Track B), este servicio:
 *   - expone GET /health para monitoreo externo (uptime checks)
 *   - en shutdown/crash, reporta PROCESS_CRASH al canal de alertas
 *
 * NOTA: tsconfig de Convex/app excluye vps/ — este archivo no se compila
 * con el resto. Es scaffold.
 */

// Pseudo-implementación de referencia (Express). Las deps (express, etc.)
// se instalarían en el package.json del servicio VPS, no en este repo.

type HealthStatus = {
  status: "ok" | "degraded" | "down";
  checks: {
    convex: boolean;
    syscoinRpc: boolean;
    openai: boolean;
    twilio: boolean;
  };
  uptimeSeconds: number;
  timestamp: number;
};

/**
 * Construye el estado de salud consultando cada dependencia externa.
 * Cada check hace un ping ligero (timeout corto). Si una falla, status
 * pasa a "degraded"; si Convex falla, "down" (no podemos operar).
 */
export async function buildHealth(startedAt: number): Promise<HealthStatus> {
  const checks = {
    convex: await pingConvex(),
    syscoinRpc: await pingSyscoinRpc(),
    openai: await pingOpenAI(),
    twilio: await pingTwilio(),
  };

  let status: HealthStatus["status"] = "ok";
  if (!checks.convex) status = "down";
  else if (!checks.syscoinRpc || !checks.openai || !checks.twilio) {
    status = "degraded";
  }

  return {
    status,
    checks,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: Date.now(),
  };
}

/**
 * Reporta un crash al canal de alertas antes de salir. Llamar desde los
 * handlers de process: 'uncaughtException', 'SIGTERM', 'SIGINT'.
 * Reusa el MISMO payload sin-PHI que convex/maintenance/alertOps.ts.
 */
export async function reportCrash(reason: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // no-op si no hay canal

  const text =
    `🔴 *SEPHIEM CRITICAL*\n` +
    `event: \`PROCESS_CRASH\`\n` +
    `resource: \`system\`\n` +
    `reason: ${reason}\n` + // reason es técnico, sin PHI
    `time: ${new Date().toISOString()}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {
    // último recurso: log local (sin PHI)
    console.error("[crash-report-failed]", reason);
  }
}

// ── Stubs de los pings (implementación real en el VPS) ───────────────────────
async function pingConvex(): Promise<boolean> {
  // GET ${CONVEX_URL}/version o una query trivial
  return true;
}
async function pingSyscoinRpc(): Promise<boolean> {
  // POST eth_blockNumber al RPC primario; si falla, fallback
  return true;
}
async function pingOpenAI(): Promise<boolean> {
  // HEAD a api.openai.com (sin gastar tokens)
  return true;
}
async function pingTwilio(): Promise<boolean> {
  // GET status de la cuenta Twilio
  return true;
}

/**
 * Wiring de referencia (Express):
 *
 *   const startedAt = Date.now();
 *   app.get("/health", async (_req, res) => {
 *     const h = await buildHealth(startedAt);
 *     res.status(h.status === "down" ? 503 : 200).json(h);
 *   });
 *
 *   process.on("uncaughtException", async (err) => {
 *     await reportCrash(err.message);
 *     process.exit(1);
 *   });
 *   process.on("SIGTERM", async () => {
 *     await reportCrash("SIGTERM");
 *     process.exit(0);
 *   });
 */
