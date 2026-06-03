// Capa on-chain Sephiem-Syscoin (zkSYS Testnet, chain 57057).
// Contratos desplegados: Patient/Doctor/MedicalRecord/Appointment Registry.
// Ver proyecto-sephiem-syscoin/DOCUMENTACION.md.
export { zkTanenbaum, EXPLORER_URL, explorerTx, explorerAddress } from "./chain";
export {
  CONTRACTS,
  RECORD_TYPE,
  RECORD_TYPE_LABELS,
  RECORD_STATUS_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type RecordType,
} from "./contracts";
export { generateDocumentHash, generateHashFromContent } from "./hash";
export {
  publicClient,
  isVerifiedDoctor,
  getDoctorInfo,
  isPatient,
  hasAccess,
  getRecordsByPaciente,
  getRecordsByMedico,
  verifyIntegrity,
  type OnChainDoctorInfo,
} from "./client";
export {
  useSyscoin,
  useSyscoinNetwork,
  type SyscoinNetwork,
  type AnchorRecordParams,
  type AnchorRecordResult,
} from "./useSyscoin";
