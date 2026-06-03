# Dictamen GO / NO-GO — Producción

Issue: VAL-62 (B18). Depende de VAL-61 (smoke) y VAL-60 (PRG, 14 checks).
Fecha de corte: 2026-06-03.

## Veredicto actual: **NO GO**

Razón resumida: el código está completo y verificado en lectura, pero faltan (a)
config de entornos staging/prod, (b) 5 DPAs + revisiones legales/clínicas, y (c)
endurecimiento de infra y validación de backup. Ninguno es bloqueo de código.

## Criterios de GO (todos deben cumplirse)

| # | Criterio | Estado | Evidencia / bloqueo |
|---|---|---|---|
| 1 | Smoke test VAL-61 completo en staging | ⚠️ Parcial | Lado lectura ✅ en dev (ver `smoke-test-staging.md`); escritura/pagos requieren auth + `HD_XPUB_TESTNET` + staging desplegado |
| 2 | Calidad: typecheck + lint + build | ✅ | Los 3 pasan en local |
| 3 | CI verde + CodeRabbit + branch protection | ❌ | VAL-48 (PAT sin `Administration:write`) |
| 4 | PRG 14/14 con evidencia (VAL-60) | ❌ | 3/14 ✅ (ver matriz) |
| 5 | Cero PHI/secretos en logs | ✅ | `logging-policy.md`; RBAC verificado (no `walletAddress` en queries públicas) |
| 6 | Entornos staging+prod operativos | ❌ | VAL-45/66/63/65/67 (Convex/Railway/Privy) |

## Matriz PRG — 14 checks (VAL-60)

| Check | Tipo | Estado | Nota |
|---|---|---|---|
| `auth_spike_validated` | técnico | ✅ | A0 validado (VAL-16): Privy customJwt ES256 |
| `incident_response_doc` | doc | ✅ | `docs/incident-response.md` (esta sesión) |
| `wallet_sweep_sop` | doc | ✅ | `docs/wallet-sweep-sop.md` (esta sesión) |
| `hd_wallet_setup` | config | ⚠️ | Código ✅ (BIP44 `m/44'/57'/…`); falta `HD_XPUB_*` seteado |
| `legal_retention_review` | legal | ⚠️ | Retención implementada (730d / 12 meses); falta revisión legal |
| `convex_dpa` | legal | ❌ | Firma DPA |
| `privy_dpa` | legal | ❌ | Firma DPA |
| `twilio_dpa` | legal | ❌ | Firma DPA — **crítico**: WhatsApp ahora va por Twilio |
| `hosting_dpa` | legal | ❌ | Firma DPA (Railway) |
| `openai_dpa` | legal | 🔵 N/A* | Pivot chat→WhatsApp elimina OpenAI del portal |
| `hermes_clinical_approval` | clínico | 🔵 Reevaluar* | Hermes ahora es atención **humana** por WhatsApp, no LLM en portal |
| `hermes_redteam_complete` | seguridad | 🔵 N/A* | No hay LLM expuesto al paciente en el portal |
| `vps_hardening` | infra | ❌ | Endurecimiento de hosting |
| `backup_restore_validated` | ops | ❌ | Ejecutar y validar restore |

\* **Impacto del pivot chat→WhatsApp** (commit `feat(chat)`): Hermes IA deja de
responder con OpenAI en el portal; la asistencia se da por WhatsApp (operada por
humano vía número Twilio). Esto vuelve `openai_dpa` y `hermes_redteam_complete`
no aplicables al portal, y transforma `hermes_clinical_approval` en gobernanza de
**consejo médico humano** (no aprobación de un agente IA). Confirmar con Legal y
Clínico antes de cerrar esos 3 checks. El `twilio_dpa` sube de prioridad.

## Acciones para pasar a GO (dueño = usuario/organización)

1. **Config:** `VITE_HERMES_WHATSAPP` (número Twilio) + `HD_XPUB_TESTNET` en
   Convex; envs de prod.
2. **Infra:** desplegar Convex+Railway staging (VAL-45/66/63/65/67); branch
   protection (VAL-48).
3. **Smoke completo:** correr VAL-61 lado escritura en staging autenticado.
4. **Legal/Clínico:** firmar DPAs (convex/privy/twilio/hosting), revisión de
   retención, y definir gobernanza del consejo médico por WhatsApp.
5. **Ops:** vps_hardening + backup/restore validado.

Re-emitir este dictamen cuando 1-5 estén resueltos.
