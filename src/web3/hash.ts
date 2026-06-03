import { keccak256, stringToHex, type Hex } from "viem";

export interface DocumentData {
  tipo: number;
  paciente: string;
  medico: string;
  contenido: string;
  timestamp: number;
}

// CRÍTICO: el formato del payload debe ser EXACTAMENTE este (mismo orden de
// campos, direcciones en minúscula). Es el contrato de integridad documentado
// en proyecto-sephiem-syscoin/DOCUMENTACION.md. Cambiarlo rompe
// verifyIntegrity() on-chain.
//
// Equivalente a ethers: keccak256(toUtf8Bytes(JSON.stringify(payload))).
// En viem: stringToHex codifica la string como bytes UTF-8 → mismo hash.
export function generateDocumentHash(data: DocumentData): Hex {
  const payload = JSON.stringify({
    tipo: data.tipo,
    paciente: data.paciente.toLowerCase(),
    medico: data.medico.toLowerCase(),
    contenido: data.contenido,
    timestamp: data.timestamp,
  });
  return keccak256(stringToHex(payload));
}

export function generateHashFromContent(contenido: string): Hex {
  return keccak256(stringToHex(contenido));
}
