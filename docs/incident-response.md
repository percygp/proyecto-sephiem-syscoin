# Incident Response SOP — Sephiem

PRG check: `incident_response_doc`. Define detección, clasificación, contención y
post-mortem de incidentes operativos y de seguridad. Sin PHI en este documento.

## 1. Detección

Fuentes de señal:

- **Alertas Telegram** (`maintenance/alertOps:sendOpsAlert`) disparadas por crons
  y rutas críticas. Requiere `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (y
  opcional `ALERT_WEBHOOK_URL`).
- **Convex dashboard → Logs/Functions**: errores `ConvexError` por función.
- **Monitor on-chain** (pagos): payouts en `failed`, invoices en `late_payment`.
- Reporte manual de usuario/operador.

## 2. Clasificación (severidad)

| Sev | Criterio | Ejemplos |
|---|---|---|
| SEV-1 | Pérdida/fuga de datos clínicos (PHI) o de fondos | walletAddress/txHash en logs, sweep no autorizado, leak de PHI |
| SEV-2 | Servicio crítico caído | Convex deployment caído, auth Privy rota, pagos sin confirmar masivos |
| SEV-3 | Degradación parcial | un cron fallando, payout aislado en `failed`, WhatsApp Twilio sin enviar |
| SEV-4 | Cosmético / sin impacto a usuario | ruido de logs, typo |

## 3. Roles

- **Incident Commander (IC):** coordina, decide contención, comunica.
- **Operador técnico:** ejecuta acciones en Convex/infra.
- **Custodio de claves:** único con acceso a `HD_MNEMONIC`/seed de la HD wallet
  (ver `wallet-sweep-sop.md`). NUNCA comparte la seed por canales digitales.

## 4. Contención por tipo

### 4.1 Fuga potencial de PHI/secretos en logs (SEV-1)
1. IC declara incidente, congela despliegues.
2. Verificar `docs/logging-policy.md`: los logs deben llevar solo `_id`+acción.
   Identificar la función que loguea de más.
3. Parchear (quitar el campo sensible), `npx convex deploy`.
4. Rotar el secreto expuesto (ver §5).

### 4.2 Compromiso de fondos / sweep no autorizado (SEV-1)
1. IC + custodio. Detener crons de pago si aplica.
2. Ejecutar el procedimiento de barrido controlado a la cold wallet
   (`wallet-sweep-sop.md`) hacia una dirección segura.
3. Rotar `HD_XPUB_*` e índice de derivación si la xpub se considera comprometida.

### 4.3 Servicio caído (SEV-2)
1. Activar **modo mantenimiento** / `disableProduction` (admin) para bloquear
   features de escritura mientras se diagnostica.
2. Revisar estado del deployment (Convex), Railway (frontend), Privy.
3. Restaurar; validar con `docs/smoke-test-staging.md` (lado lectura) antes de
   reactivar producción.

## 5. Rotación de secretos

Secretos en Convex env (`npx convex env set <KEY> <value>` por deployment):
`TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `OPENAI_API_KEY` (si aplica),
`HD_XPUB_TESTNET`/`HD_XPUB_MAINNET`, `TELEGRAM_BOT_TOKEN`, `SYSCOIN_RPC_TESTNET`.
Tras rotar: invalidar el valor anterior en el proveedor y `npx convex deploy`.

## 6. Comunicación

- Interna: canal de incidentes (Telegram ops). Sin PHI.
- Externa/regulatoria: si SEV-1 con PHI, evaluar obligación de notificación de
  brecha según `legal_retention_review` y los DPAs firmados (Convex/Privy/Twilio
  /hosting/OpenAI). Plazo y destinatarios los define Legal.

## 7. Post-mortem (≤ 5 días hábiles)

Blameless. Documentar: timeline, causa raíz, impacto, detección, acciones de
contención, y **acciones correctivas con dueño y fecha**. Enlazar el issue Linear.

## 8. Retención de evidencia

`auditLogs` se retienen 730 días (`auditLogRetentionDays`, cron
`auditRetention`). No purgar logs relevantes a un incidente abierto.
