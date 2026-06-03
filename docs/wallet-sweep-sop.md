# Wallet Sweep SOP — HD Wallet Syscoin NEVM

PRG check: `wallet_sweep_sop`. Procedimiento para barrer (consolidar) los fondos
recibidos en las direcciones derivadas por factura hacia la **treasury / cold
wallet**, firmando offline. Sin claves privadas en este documento.

## 1. Modelo de custodia

- El servidor (Convex) solo conoce la **xpub** (clave pública extendida):
  `HD_XPUB_TESTNET` / `HD_XPUB_MAINNET`. Es **watch-only**: puede derivar
  direcciones EVM pero **no firmar**.
- La **seed BIP39** que controla los fondos vive **offline** (cold), en custodia
  del custodio de claves. NUNCA se carga en Convex ni se transmite digitalmente.
- Paths de derivación (`convex/payments/hdwallet.ts`):
  - Testnet: `m/44'/57'/1'/0/<index>`
  - Mainnet: `m/44'/57'/0'/0/<index>`
- Cada factura usa un `derivationIndex` incremental (`nextDerivationIndex` en
  `systemSettings`). Direcciones EVM `0x...` (Syscoin NEVM), no legacy `sys1...`.

## 2. Cuándo barrer

- Programado: cuando el saldo acumulado en direcciones derivadas supere un umbral
  definido por Tesorería, o en cadencia fija (p.ej. semanal).
- Ad-hoc: ante incidente de seguridad (ver `incident-response.md` §4.2).

## 3. Pre-requisitos

- Acceso de **solo lectura** al índice actual: `nextDerivationIndex`
  (`systemSettings`), para conocer el rango `[0, N)` de direcciones a inspeccionar.
- Nodo/RPC Syscoin NEVM (`SYSCOIN_RPC_TESTNET` o el de mainnet) para consultar
  saldos por dirección.
- Dispositivo offline (air-gapped) con la seed para firmar.
- Dirección de **treasury/cold** destino, verificada por 2 personas.

## 4. Procedimiento (dual control)

1. **Enumerar** direcciones derivadas `index = 0..N-1` desde la xpub (watch-only)
   y consultar saldo on-chain de cada una vía RPC.
2. **Conciliar** los saldos con `paymentInvoices` (qué factura corresponde a qué
   index). Marcar discrepancias → incidente.
3. **Construir** la(s) transacción(es) de barrido hacia la treasury en el
   dispositivo offline (inputs = direcciones con saldo; output = cold wallet;
   reservar gas).
4. **Verificar en 2 personas**: dirección destino, montos, fees, índices.
5. **Firmar offline** con la seed. La seed nunca sale del dispositivo.
6. **Difundir** la tx firmada vía RPC.
7. **Confirmar** inclusión on-chain (esperar N confirmaciones) y registrar el
   `txHash` en el registro de tesorería (NO en `auditLogs` ni logs de app — ver
   `logging-policy.md`).

## 5. Rotación / compromiso

- Si la xpub o un index se considera comprometido: generar nueva seed offline,
  derivar nueva xpub, actualizar `HD_XPUB_*` (`npx convex env set ...`), reiniciar
  `nextDerivationIndex` y barrer los fondos remanentes de la wallet antigua a la
  treasury inmediatamente.

## 6. Controles

- **Separación de funciones:** quien opera Convex ≠ custodio de la seed.
- **Watch-only en caliente:** el sistema en línea jamás tiene capacidad de firma.
- **Sin secretos en logs:** direcciones de pago y `txHash` fuera de `auditLogs`
  (política de logging). Tesorería los guarda en su registro propio.
- **Evidencia:** cada barrido se documenta (fecha, rango de índices, total
  barrido, txHash, firmantes) para auditoría y para el PRG.
