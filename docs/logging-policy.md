# Política de Logging y Auditoría (B15 / VAL-59)

Regla dura: **cero PHI y cero secretos en logs/auditLogs.**

## auditLogs (convex/audit.ts)

Punto único de escritura: `internal.audit.log`. Cada registro contiene solo:

- `actorProfileId` (opcional) — `_id` opaco de Convex.
- `actorType` — patient | doctor | admin | hermes | system.
- `action` — enum cerrado.
- `targetId` (opcional) — **`_id` opaco de Convex** de la entidad afectada.
- `targetType`, `channel`, y metadata técnica (`ipAddress`, `promptVersion`, `modelVersion`).

Los `_id` de Convex son identificadores opacos **no-PHI**; se almacenan completos
para permitir trazabilidad/lookup. No son nombres, direcciones ni hashes de cadena.

## PROHIBIDO en cualquier log/audit

- `walletAddress` completa (de paciente o especialista).
- `payoutTxHash` / `txHash` completo de transacción.
- Nombres, emails, teléfonos, direcciones, fechas clínicas, comentarios libres.

## Cómo se cumple en Marketplace/Payments

- `marketplaceSpecialists.walletAddress`: solo accesible vía
  `getSpecialistPayoutWallet` (admin/owner, **mutation** que audita el acceso con
  `SPECIALIST_WALLET_ACCESSED`). Nunca en `getSpecialists`/`getSpecialistDetail`.
- `specialistPayouts.payoutTxHash` (completo): solo vía `getPayoutTxHash` (admin,
  audita `SPECIALIST_PAYOUT_TXHASH_ACCESSED`). En la tabla se guarda además
  `payoutTxHashHash` (truncado) y `destinationWalletAddressHash` (SHA-256
  truncado) para logs/listados sin exponer el valor.
- En `auditLogs` solo se registran `_id` + acción; nunca el `walletAddress` ni el
  `txHash`. El `targetId` referencia la entidad por su `_id`.

## Helpers

- `lib/money.ts:truncatedSha256(input)` — SHA-256 hex truncado (16 chars) para
  hashes persistidos (`destinationWalletAddressHash`, `payoutTxHashHash`).
- `lib/money.ts:truncateHash(id)` — 12 chars + "…" para mensajes/UI/logs externos
  human-facing (no para `targetId` de auditLogs, que va completo).
- Frontend: `txHash` siempre se muestra truncado (12 chars); `walletAddress` nunca
  se muestra (solo badge `walletVerified`).
