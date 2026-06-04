# Smoke Test E2E — Staging (B17 / VAL-61)

Runbook para validar los flujos críticos en staging con datos sintéticos.
Marcar cada paso: ✅ éxito (con evidencia) · ❌ falla (error + repro) · ⏭️ skip (razón).

## Prerrequisitos

```bash
# 1. Datos base (settings + PRG + feature flags=true)
npx convex run seed:seedAll
# 2. Datos sintéticos (3 especialistas verificados, slots, pacientes, reviews)
npx convex run maintenance/seedTestData:seedTestData
```

Algunos pasos requieren la **app corriendo** con login Privy (mutations con auth
de paciente/admin no son ejecutables por CLI sin identidad). Phase 1 (PR/CI)
requiere el **repo en GitHub** (VAL-64) + branch protection (VAL-48).

---

## Fase 1 — Gates de calidad  *(requiere GitHub: VAL-64/48/47 — externo)*

| Paso | Acción | Esperado |
|---|---|---|
| 1 | PR feature→staging | CI (typecheck/lint/build) verde + CodeRabbit + 1 approval |
| 2 | merge directo a main | bloqueado por branch protection |
| 3 | flag `marketplaceEnabled=false` → `registerAsSpecialist` | falla `FEATURE_FLAG_DISABLED` |
| 4 | flag `marketplaceEnabled=true` → reintentar | funciona |

Toggle flag (admin, vía app o): `admin/featureFlags:toggleFeatureFlag {flagKey, enabled}`.

## Fase 2 — Marketplace  *(app + auth)*

| Paso | Acción | Esperado |
|---|---|---|
| 1 | `registerAsSpecialist` (paciente) | creado `isVerifiedByAdmin=false` |
| 2 | `approveSpecialist` (admin) | `isVerifiedByAdmin=true`, aparece en `getSpecialists` |
| 3 | `getSpecialists` (público) | **sin** `walletAddress` (solo `walletVerified`) |
| 4 | `createSpecialistReview` (cita completed) | éxito |
| 5 | review duplicada misma cita | error `DUPLICATE` (`by_appointmentId.unique`) |
| 6 | rating en `getSpecialistDetail` | coincide con reviews (seed: spec 1 = 4.5) |

CLI verificable sin auth: `getSpecialists` (los 3 del seed; spec 1 rating 4.5).

## Fase 3 — Agendamiento + Pagos  *(app + auth; pago = simulado)*

| Paso | Acción | Esperado |
|---|---|---|
| 1 | `createAppointmentHold` (paciente, slot del seed) | appointment `pending`, slot `held` + TTL, invoice creada |
| 2 | pago dentro del hold | appointment `confirmed`, slot `confirmed` |
| 3 | pago fuera del hold | invoice `late_payment`, appointment NO confirmado |
| 4 | `handleLatePayment` crédito (admin) | appointment `credit_issued`, slot `expired` |
| 5 | `completeAppointment` | payout `earned`, `completedAt` seteado |
| 6 | cron `updatePayoutStatuses` (o esperar 24h) | payout `payable` |
| 7 | `processSpecialistPayout` desde `payable` | `processing`→`paid` con `payoutTxHash` (mock) |
| 8 | (real) fallo de payout | `failed`, `retryCount=1`, `failureReason` |
| 9 | retry desde `failed` | `processing`→`paid` |
| 10 | idempotencia desde `paid` | error `PAYOUT_ALREADY_PAID` |

> Pago dentro/fuera del hold: el monitor on-chain detecta la tx y dispara
> `recordPayment`→`finalizePaymentInternal`→`confirmAppointmentPayment`. Para
> simular sin tx real, ejecutar el camino vía `confirmPaymentFromMonitor`
> (internal) con un `invoiceId`+`txHash`. Pasos 8/9 aplican al envío real
> (hoy simulado siempre exitoso).

CLI verificable (admin): crons `appointments/jobs:updatePayoutStatuses`,
`payments/payouts:processReadyPayouts`.

## Fase 4 — Seguridad

| Paso | Acción | Esperado |
|---|---|---|
| 1 | acceso a `walletAddress` desde no-admin | `getSpecialistPayoutWallet` → `FORBIDDEN` |
| 2 | revisar `auditLogs` | solo `_id`+acción; **cero** walletAddress/txHash (ver `docs/logging-policy.md`) |
| 3 | Hermes no sugiere especialistas específicos | solo orientación general |

## Fase 5 — Procedimientos

| Paso | Acción | Esperado |
|---|---|---|
| 1 | modo mantenimiento ON | features bloqueadas |
| 2 | modo mantenimiento OFF | features funcionan |
| 3 | `disableProduction` (admin) | `productionEnabled=false` |
| 4 | feature flags vs productionEnabled | flags funcionan independientes |

## Criterio de éxito

Todas las fases ✅, cero PHI/secretos en logs, flujos de pago tardío/payout según
spec, feature flags bloquean correctamente. El resultado alimenta el dictamen
GO/NO-GO (VAL-62) y los checks técnicos del PRG (VAL-60).

---

## Registro de ejecución — lado lectura (dev `exciting-dragon-400`, 2026-06-03)

Ejecutado por CLI sin auth contra el deployment dev con datos sintéticos ya
sembrados (`seedTestData` → `skipped:true`, sentinel `test|spec-1` presente).

| Paso | Comando | Resultado |
|---|---|---|
| Marketplace listing | `getSpecialists {paginationOpts:{cursor:null,numItems:10}}` | ✅ 3 especialistas `isVerifiedByAdmin=true` (Cardiología/Dermatología/Pediatría) |
| Rating tiempo real | (campo `rating` del listing) | ✅ Cardiología 4.5 = avg(5,4) de 2 reviews del seed |
| Slots disponibles | `getAvailableSlots {specialistId:<card>}` | ✅ slots futuros `available` (mañana 09:00+) |
| Detalle | `getSpecialistDetail {specialistId:<card>}` | ✅ rating 4.5, `walletVerified:true` |
| RBAC (Fase 4.1) | payload de `getSpecialists`/`getSpecialistDetail` | ✅ **sin** `walletAddress` (solo `walletVerified`) — VAL-59 OK |

**Pendiente (lado escritura/auth, NO ejecutable por CLI):** Fases 2.1-2.5, 3,
4.3, 5 requieren sesión Privy autenticada. (Gate HD **resuelto** 2026-06-04:
`HD_XPUB_TESTNET` seteado en dev → `createAppointmentHold` ya NO falla por
`HD_WALLET_NOT_CONFIGURED`, solo por `UNAUTHENTICATED`.) Fase 4.3 (Hermes
in-portal) queda **obsoleta** por el pivot chat→WhatsApp; el modo es híbrido
(humano WhatsApp + IA backend). Ver `docs/go-no-go.md`.
