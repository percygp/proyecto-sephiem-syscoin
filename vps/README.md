# Sephiem — Servicio VPS (Hermes + Monitor de pagos)

> **Estado: SCAFFOLD / NO DESPLEGADO.** Este directorio documenta el servicio
> Node.js que correrá en el VPS. No se ejecuta todavía. Forma parte del
> check `vps_hardening` y `hd_wallet_setup` del Production Readiness Gate.

## Qué corre en el VPS (no en Convex)

Convex cubre DB + funciones serverless. El VPS aloja procesos de larga
duración y código que necesita secretos sensibles fuera de Convex:

1. **Hermes service** (A18): recibe webhooks de Twilio (WhatsApp), llama
   GPT-4o mini, escribe en Convex. System prompt versionado.
2. **Monitor de pagos** (A15/A16): vigila las `derivedAddress` de los invoices
   en Syscoin NEVM via RPC, llama `recordPayment` / `updateConfirmations` en
   Convex cuando detecta transacciones.
3. **OIDC/JWT**: NO aplica — Privy lo gestiona. El VPS no maneja auth.

## Variables de entorno del VPS

```
# Convex (para que el VPS escriba en la DB)
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_DEPLOY_KEY=<deploy key>

# OpenAI (Hermes — A18)
OPENAI_API_KEY=sk-...

# Twilio (WhatsApp — A19)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+...

# Syscoin RPC (monitor de pagos — primario + fallback)
SYSCOIN_RPC_PRIMARY=https://rpc.tanenbaum.io
SYSCOIN_RPC_FALLBACK=https://...

# HD wallet — SOLO xpub (la seed NUNCA toca el VPS). Ver A14.
HD_XPUB_TESTNET=xpub...

# Alertas operativas (A17) — también se configuran en Convex env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

> Las mismas alertas (`TELEGRAM_BOT_TOKEN`/`CHAT_ID` o `ALERT_WEBHOOK_URL`)
> se configuran **también en Convex** con `npx convex env set` para que
> `internal.maintenance.alertOps.sendOpsAlert` pueda emitir desde los crons.

## Hardening (check PRG `vps_hardening`)

- [ ] HTTPS con Let's Encrypt (nginx/caddy reverse proxy)
- [ ] Firewall: solo 80, 443, 22 (SSH con key, sin password)
- [ ] PM2 con `ecosystem.config.js` + log rotation
- [ ] Logs estructurados JSON **sin PHI** (solo IDs/eventos)
- [ ] Cifrado de disco activo
- [ ] Alerta de prueba enviada y recibida (requisito para aprobar el check)
- [ ] DPA del proveedor (DigitalOcean/AWS) firmado

## PM2 ecosystem (referencia)

```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: "hermes",
    script: "dist/index.js",
    instances: 1,
    max_memory_restart: "400M",
    error_file: "/var/log/sephiem/hermes-error.log",
    out_file: "/var/log/sephiem/hermes-out.log",
    // Hook de crash: PM2 reinicia y un script externo envía alerta.
    // El crash se reporta via alertOps (PROCESS_CRASH) desde un watcher
    // o desde el propio servicio en su shutdown handler.
  }],
};
```

## Payload de alerta (sin PHI)

```json
{
  "level": "critical | warning",
  "event": "PROCESS_CRASH | CRON_CHECKIN_MISSED | OPENAI_ERRORS | WA_FAILURES | RPC_DOWN | RECONCILIATION_DISCREPANCY | PRG_CHECK_EXPIRED",
  "resourceType": "system | payment | job | auth",
  "resourceId": "<Convex _id opaco — nunca nombre/wallet/monto>",
  "timestamp": 1748000000000,
  "app": "sephiem"
}
```

## Próximos pasos (Track B)

1. Levantar VPS, hardening según checklist
2. `npx convex env set TELEGRAM_BOT_TOKEN ...` (y CHAT_ID)
3. Generar seed offline → cargar `HD_XPUB_TESTNET` en VPS y Convex
4. Implementar el monitor de pagos (consume A15 `recordPayment`)
5. Implementar Hermes service (A18)
6. Marcar `vps_hardening` approved con evidencia (alerta de prueba recibida)
