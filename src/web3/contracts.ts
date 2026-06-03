import type { Abi, Address } from "viem";
import { PatientRegistryAbi } from "./abis/PatientRegistry";
import { DoctorRegistryAbi } from "./abis/DoctorRegistry";
import { MedicalRecordRegistryAbi } from "./abis/MedicalRecordRegistry";
import { AppointmentRegistryAbi } from "./abis/AppointmentRegistry";

// Direcciones desplegadas en zkSYS Testnet (chain 57057).
// Fuente: proyecto-sephiem-syscoin/DOCUMENTACION.md.
export const CONTRACTS = {
  PatientRegistry: {
    address: "0x8753A1C040A656048a3e79B546C1a0765518EdED" as Address,
    abi: PatientRegistryAbi satisfies Abi,
  },
  DoctorRegistry: {
    address: "0xb71a157762730C94Ea6675Ed0bDb96eA38d7451a" as Address,
    abi: DoctorRegistryAbi satisfies Abi,
  },
  MedicalRecordRegistry: {
    address: "0x60f123A5d6cbB068b34D2C937299d84c913B3352" as Address,
    abi: MedicalRecordRegistryAbi satisfies Abi,
  },
  AppointmentRegistry: {
    address: "0x7a76c3642bC690Cb1123860F182a2F6278B794b8" as Address,
    abi: AppointmentRegistryAbi satisfies Abi,
  },
} as const;

// ── Enums on-chain (espejo de los contratos Solidity) ────────────────────────

export const RECORD_TYPE = {
  RECOMENDACION: 0,
  RECETA: 1,
  RESULTADO: 2,
  CONSTANCIA: 3,
  CONSENTIMIENTO: 4,
} as const;
export type RecordType = (typeof RECORD_TYPE)[keyof typeof RECORD_TYPE];

export const RECORD_TYPE_LABELS: Record<number, string> = {
  0: "Recomendación",
  1: "Receta",
  2: "Resultado",
  3: "Constancia",
  4: "Consentimiento",
};

export const RECORD_STATUS_LABELS: Record<number, string> = {
  0: "Activo",
  1: "Anulado",
  2: "Corregido",
};

export const APPOINTMENT_STATUS_LABELS: Record<number, string> = {
  0: "Pendiente",
  1: "Confirmada",
  2: "Completada",
  3: "Cancelada",
};
