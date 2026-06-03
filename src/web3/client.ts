import { createPublicClient, http, type Address, type Hex } from "viem";
import { zkTanenbaum } from "./chain";
import { CONTRACTS } from "./contracts";

// Cliente de lectura (RPC público, sin wallet). Singleton — reutilizable
// dentro y fuera de React. Los tipos de retorno los infiere viem desde los
// ABI `as const`.
export const publicClient = createPublicClient({
  chain: zkTanenbaum,
  transport: http(),
});

// ── Lecturas DoctorRegistry ──────────────────────────────────────────────────

export function isVerifiedDoctor(addr: Address) {
  return publicClient.readContract({
    ...CONTRACTS.DoctorRegistry,
    functionName: "isVerified",
    args: [addr],
  });
}

export interface OnChainDoctorInfo {
  colegiatura: string;
  especializacion: string;
  activo: boolean;
  registradoEn: bigint;
  totalAtenciones: bigint;
}

export function getDoctorInfo(addr: Address) {
  return publicClient.readContract({
    ...CONTRACTS.DoctorRegistry,
    functionName: "getDoctorInfo",
    args: [addr],
  });
}

// ── Lecturas PatientRegistry ─────────────────────────────────────────────────

export function isPatient(addr: Address) {
  return publicClient.readContract({
    ...CONTRACTS.PatientRegistry,
    functionName: "isPatient",
    args: [addr],
  });
}

export function hasAccess(paciente: Address, medico: Address) {
  return publicClient.readContract({
    ...CONTRACTS.PatientRegistry,
    functionName: "hasAccess",
    args: [paciente, medico],
  });
}

// ── Lecturas MedicalRecordRegistry ───────────────────────────────────────────

export function getRecordsByPaciente(paciente: Address) {
  return publicClient.readContract({
    ...CONTRACTS.MedicalRecordRegistry,
    functionName: "getRecordsByPaciente",
    args: [paciente],
  });
}

export function getRecordsByMedico(medico: Address) {
  return publicClient.readContract({
    ...CONTRACTS.MedicalRecordRegistry,
    functionName: "getRecordsByMedico",
    args: [medico],
  });
}

export function verifyIntegrity(recordId: Hex, hash: Hex) {
  return publicClient.readContract({
    ...CONTRACTS.MedicalRecordRegistry,
    functionName: "verifyIntegrity",
    args: [recordId, hash],
  });
}
