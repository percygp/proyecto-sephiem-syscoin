/**
 * Sephiem — Cron jobs
 *
 * Reglas de Convex:
 *  - SOLO usar crons.interval o crons.cron (no helpers daily/hourly/weekly)
 *  - Pasar FunctionReference, no la función directamente
 *  - Importar `internal` desde _generated/api
 *
 * Crons activos:
 *  - pruneExpiredNonces      (cada 1 hora)   — limpia walletNonces expirados (A4)
 *  - prgExpirationCheck      (cada 24 horas) — marca PRG checks expired (A14)
 *  - reconcilePayments       (cada 24 horas) — concilia pagos confirmados (A16)
 *  - pruneOldAuditLogs       (cada 24 horas) — retención de auditLogs (A16)
 *
 * Por agregar más adelante:
 *  - hermes daily checkin       (cada día 9:00) — A20
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "prune expired wallet nonces",
  { hours: 1 },
  internal.auth.nonceCleanup.pruneExpiredNonces,
  {},
);

crons.interval(
  "prg expiration check",
  { hours: 24 },
  internal.admin.prgExpiration.prgExpirationCheck,
  {},
);

// A16: conciliación diaria de pagos confirmados sin conciliar.
crons.interval(
  "reconcile payments",
  { hours: 24 },
  internal.payments.reconciliation.reconcilePayments,
  {},
);

// A16: retención de auditLogs — borra registros más antiguos que el límite.
crons.interval(
  "prune old audit logs",
  { hours: 24 },
  internal.maintenance.auditRetention.pruneOldAuditLogs,
  {},
);

// A18: checkin diario de Hermes — 9:00 UTC. Pacientes sin interacción en 24h
// reciben un saludo personalizado con IA.
crons.cron(
  "hermes daily checkin",
  "0 9 * * *",
  internal.ai.hermes.hermesDailyCheckin,
  {},
);

// A21: monitor on-chain — cada 5 minutos revisa invoices pendientes
// y actualiza confirmaciones.
crons.interval(
  "on-chain payment monitor",
  { minutes: 5 },
  internal.payments.monitor.monitorTransactions,
  { network: "syscoin_testnet" },
);

// B13 (VAL-57): agendamiento + payouts
crons.interval(
  "generar slots desde availability",
  { hours: 1 },
  internal.appointments.jobs.generarSlotsDesdeAvailability,
  {},
);

crons.interval(
  "expirar holds de slots",
  { minutes: 5 },
  internal.appointments.jobs.expireHeldSlots,
  {},
);

crons.interval(
  "actualizar estados de payouts",
  { hours: 1 },
  internal.appointments.jobs.updatePayoutStatuses,
  {},
);

crons.interval(
  "procesar payouts payable",
  { minutes: 30 },
  internal.payments.payouts.processReadyPayouts,
  {},
);

export default crons;
