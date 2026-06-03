# Capa on-chain Sephiem-Syscoin (`src/web3`)

Integración de los contratos médicos desplegados en **zkSYS Testnet** dentro de
la app principal (React + Vite + Convex + Privy). Reemplaza al frontend Next.js
standalone de `proyecto-sephiem-syscoin/frontend` (que duplicaba UI + auth +
wagmi). Reutiliza la **wallet Privy/MetaMask existente** vía viem; no añade
wagmi, Next ni ethers.

## Red

| Parámetro | Valor |
|---|---|
| Red | zkSYS Testnet (zkTanenbaum) |
| Chain ID | `57057` |
| RPC | https://rpc-zk.tanenbaum.io |
| Explorer | https://explorer-zk.tanenbaum.io |

> Nota: el panel "Credenciales Web3" antes mostraba `5700` hardcodeado. El valor
> correcto verificado contra el RPC es `57057`.

## Contratos (verificados on-chain)

| Contrato | Dirección |
|---|---|
| PatientRegistry | `0x8753A1C040A656048a3e79B546C1a0765518EdED` |
| DoctorRegistry | `0xb71a157762730C94Ea6675Ed0bDb96eA38d7451a` |
| MedicalRecordRegistry | `0x60f123A5d6cbB068b34D2C937299d84c913B3352` |
| AppointmentRegistry | `0x7a76c3642bC690Cb1123860F182a2F6278B794b8` |

## Estructura

```
src/web3/
├── abis/                 ABIs `as const` (inferencia de tipos viem)
├── chain.ts              defineChain zkTanenbaum + helpers de explorer
├── contracts.ts          direcciones + ABIs + enums/labels on-chain
├── hash.ts               generateDocumentHash (contrato de integridad)
├── client.ts             publicClient (lecturas RPC, sin wallet) + helpers
├── useSyscoin.ts         hooks: useSyscoinNetwork (red en vivo) + useSyscoin (escrituras)
└── index.ts              barrel export
```

## Uso

### Lecturas (sin wallet)

```ts
import { isVerifiedDoctor, getRecordsByPaciente, verifyIntegrity } from "@/web3";

const ok = await isVerifiedDoctor("0x...");
const records = await getRecordsByPaciente("0x...");
```

### Datos de red en vivo (UI)

```ts
const net = useSyscoinNetwork(address); // { chainId, blockNumber, balanceSys, online }
```

Integrado en `App.tsx` → panel `RightSidebar` ("Credenciales Web3").

### Escrituras (firma con wallet Privy)

```ts
const { registerPatient, grantAccess, anchorRecord, RECORD_TYPE } = useSyscoin();

// Médico notariza un documento clínico (sólo el hash va on-chain):
const { recordId, hash, txHash } = await anchorRecord({
  paciente: "0x...",
  tipo: RECORD_TYPE.RECETA,
  contenido: "Paracetamol 500mg c/8h",
});
```

`anchorRecord` cambia la wallet a zkSYS Testnet (switch/add automático), firma
`registerRecord`, espera el receipt y extrae `recordId` del evento
`RecordRegistered`.

## Contrato de integridad (NO modificar)

`generateDocumentHash` debe producir exactamente el mismo hash que la versión
ethers documentada en `proyecto-sephiem-syscoin/DOCUMENTACION.md`. Orden de
campos fijo y direcciones en minúscula. Cambiarlo rompe `verifyIntegrity()`.

## Pre-requisitos on-chain (reglas de los contratos)

- El médico debe estar verificado por el **owner** en `DoctorRegistry`.
- El paciente debe haber registrado su wallet (`registerPatient`) y concedido
  acceso al médico (`grantAccess`) antes de que el médico pueda anclar.
- Se requiere saldo SYS (faucet: https://faucet-zk.tanenbaum.io) para firmar.

## Sub-proyecto de referencia

`proyecto-sephiem-syscoin/` se conserva como fuente de verdad: contratos
Hardhat + tests (42) + `DOCUMENTACION.md`. Los ABIs en `src/web3/abis` se
copiaron de ahí. El frontend Next.js standalone queda obsoleto (no se usa).
