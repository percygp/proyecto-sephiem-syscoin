# Diagnóstico de Implementación — según Linear (2026-06-04)

Clasificación de cada issue pendiente en **Implementado** / **Necesario** /
**Obviado**, y veredicto global. Basado en revisión de código + engram (memoria de
proyecto). Equipo Valder (VAL-). Total ~60 issues: 27 Done, 17 Canceled, y los
pendientes que se analizan abajo (9 In Progress + 7 Todo al inicio; VAL-48 cerrado
esta sesión).

## Veredicto global

**El producto está CODE-COMPLETE; el bloqueo es operativo, no de ingeniería.**
Backend (auth, marketplace, agendamiento, pagos HD/payouts, feature flags, crons,
auditoría) y frontend (dashboard, marketplace, booking, pagos, responsive) están
implementados y verificados en lectura. Lo que falta para producción es: (1)
provisión de entornos staging/prod (Convex deploy-key, Railway, Privy), (2) firmas
legales/clínicas (DPAs, aprobación, red-team), (3) config de secretos (número
Twilio, seed HD segura). **NO GO** vigente (ver `go-no-go.md`).

Cambio estructural (engram): **pivot chat→WhatsApp** elimina Hermes-OpenAI del
portal → varios issues de IA quedan obviados/redefinidos.

## Clasificación por issue

### In Progress

| Issue | Implementado | Necesario | Obviado |
|---|---|---|---|
| **VAL-69** lint plugin | `@convex-dev/eslint-plugin` en package.json; `npm run lint` pasa | — (cerrable ya) | — |
| **VAL-50** requireFeatureFlag | `convex/lib/featureFlags.ts`: lee systemSettings, type-check, errores tipados | — (cerrable ya) | — |
| **VAL-53** Frontend Marketplace | `MarketplacePage.tsx`: filtros, detalle, rating tiempo-real (verificado 4.5) | — (cerrable ya) | — |
| **VAL-58** Frontend Agendamiento | `MarketplacePage.tsx`: booking, hold, timer 15min, dirección pago, estado pago tardío | prueba con sesión Privy | — |
| **VAL-56** completeAppointment + payout | `payments/payouts.ts`: retry (MAX_RETRIES), transición atómica a processing, idempotencia `PAYOUT_ALREADY_PAID`, `failureReason`/`retryCount` | validación e2e en staging | envío on-chain real (hoy mock siempre exitoso) |
| **VAL-71** Responsive UI | commit responsive previo (Tailwind, design tokens) | verificación visual mobile/tablet/desktop | validación en dispositivos reales |
| **VAL-61** Smoke test e2e | **lado lectura ejecutado en dev** (marketplace, rating, slots, detalle, RBAC sin leak) — `smoke-test-staging.md` | staging desplegado + sesión Privy para write-side | write-side (auth-gated) por falta de entorno |
| **VAL-45** Entorno staging | Convex dev `exciting-dragon-400` operativo; rama `staging`; repo GitHub + branch protection (VAL-48) | Railway + app Privy staging + envs | — |
| **VAL-66** Deploy Convex staging | — | `CONVEX_DEPLOY_KEY` de staging | — |

### Todo

| Issue | Implementado | Necesario | Obviado |
|---|---|---|---|
| **VAL-48** Branch protection | ✅ **COMPLETADO** (main+staging: 4 checks, 1 approval, enforce_admins, no force-push, linear) | required workflow `head==staging` (opcional) | "main solo desde staging" como regla nativa (no existe en GitHub) |
| **VAL-62** GO/NO-GO | dictamen documentado = **NO GO** + matriz 14 checks (`go-no-go.md`) | smoke completo + PRG ✅ para re-emitir | — |
| **VAL-60** PRG 14 checks | 4/14 ✅: auth_spike, incident_response_doc, wallet_sweep_sop, hd_wallet_setup(dev) | DPAs (convex/privy/twilio/hosting), legal_retention_review, vps_hardening, backup_restore | openai_dpa + hermes_redteam → **N/A por pivot**; hermes_clinical_approval → reevaluar como consejo humano |
| **VAL-70** Fix Hermes prod OpenAI | — | — | **MOOT por pivot WhatsApp** (Hermes ya no usa OpenAI en portal). Cancelar o redefinir como "config Twilio prod" |
| **VAL-63** Railway staging | — | dashboard Railway | — |
| **VAL-65** Deploy-key / CI creds | — | deploy key (Convex/Railway) en secrets CI | — |
| **VAL-67** Privy app staging | — | dashboard Privy (nueva app + customJwt ES256) | — |

## Diagnóstico por capa

- **Auth (engram A0):** Privy customJwt ES256 validado (VAL-16 Done). Sólido.
- **Backend dominio:** schema 21 tablas, RBAC estricto (walletAddress solo admin/payout — verificado: queries públicas no lo filtran), feature flags, marketplace, appointments, payouts con retry, crons, auditoría sin PHI. **Completo.**
- **Pagos/Web3:** HD wallet BIP44 (`m/44'/57'/N'/0`), derivación EVM Syscoin NEVM, monitor on-chain. Código ✅. En dev funciona con **seed de PRUEBA desechable**; staging/prod requieren seed segura del custodio. Envío de payout es **mock** (no broadcast real) → punto a cerrar para producción.
- **Frontend:** dashboard dark (paleta oficial 5 colores, layout 3 columnas/4 tabs — engram), marketplace, booking, pagos, responsive. **Completo**; falta verificación visual y pruebas con auth.
- **IA/Hermes:** servicio GPT-4o-mini + prompts versionados + skill clínico (VAL-36/39/44 Done) **pero el pivot WhatsApp lo desconecta del portal**. Hoy el portal redirige a WhatsApp (Twilio). Decisión pendiente: archivar el módulo Hermes-OpenAI o mantenerlo para otro canal.
- **Infra/CI:** CI (typecheck/lint/build) + CodeRabbit + branch protection ✅. Falta staging (Railway/Convex deploy-key) y app Privy staging.
- **Legal/PRG:** 4/14. El grueso restante son firmas de terceros, no código.

## Inconsistencias / riesgos detectados (engram)

1. **Deployment activo cambió** a `exciting-dragon-400` (dev) sin envs — causa raíz de los errores originales (HD + Hermes). HD ya resuelto; Twilio número aún vacío.
2. **Hermes-OpenAI huérfano:** módulo Done pero sin consumidor en el portal tras el pivot → deuda técnica/decisión de producto.
3. **Payout on-chain mock:** `processSpecialistPayout` simula éxito; el envío real y los casos 8/9 (failed/retry) no se ejercitan sin broadcast.
4. **Seed HD de prueba en dev:** no usar en staging/prod.
5. **"main solo desde staging"** no es forzable nativamente — riesgo de merge desde otra rama si no se respeta la convención.

## Acciones para culminar (clasificadas por responsable)

**Cerrables YA en Linear (sin trabajo):** VAL-69, VAL-50, VAL-53, VAL-58(code),
VAL-56(code), VAL-48, VAL-62(dictamen).

**Requieren credencial del usuario (agente ejecuta al recibirla):**
- Número Twilio E.164 → `VITE_HERMES_WHATSAPP`.
- `CONVEX_DEPLOY_KEY` staging → VAL-66.

**Requieren consola externa / firma (no-agente):** Railway (VAL-63), Privy staging
(VAL-67), DPAs + legal + clínico + red-team + vps_hardening + backup (VAL-60),
decisión sobre VAL-70 (cancelar/redefinir).
