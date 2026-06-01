/**
 * A6 — Audit module (ÚNICO punto de inserción a auditLogs)
 *
 * Reglas arquitectónicas:
 *  1. SOLO `internal.audit.log` puede hacer `ctx.db.insert("auditLogs", ...)`.
 *  2. NINGÚN otro archivo en convex/ debe hacer .insert/.patch/.replace sobre auditLogs.
 *  3. La eliminación está reservada al cron de retención (A16) en
 *     convex/audit/retention.ts (pendiente).
 *  4. Sin PHI en los campos: solo IDs, action, channel, metadata técnica.
 *
 * Patrón de uso desde cualquier mutation/internalMutation:
 *
 *   import { internal } from "../_generated/api";
 *   ...
 *   await ctx.runMutation(internal.audit.log, {
 *     actorProfileId: profile._id,
 *     actorType: profile.role,
 *     action: "PATIENT_CREATED",
 *     targetId: patientId,
 *     targetType: "patient",
 *     channel: "web",
 *   });
 *
 * Para que TypeScript valide el `action` está acotado al enum del schema:
 * usar los strings tal cual aparecen en convex/schema.ts (auditActionEnum).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A12 — INVENTARIO DE COBERTURA DE AUDITLOGS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lista cerrada de 30 actions (definidas en schema.ts auditActionEnum). Cada
 * fila describe: cuándo se dispara, quién la registra, severidad clínica/legal.
 *
 * | ACCIÓN                       | CUÁNDO                                      | QUIÉN     | SEV  |
 * |------------------------------|---------------------------------------------|-----------|------|
 * | PATIENT_CREATED              | completeOnboarding (A9)                     | patient   | med  |
 * | PATIENT_RECORD_READ_FULL     | doctor abre expediente (A12, este módulo)   | doctor    | high |
 * | PATIENT_UPDATED              | assignDoctorToPatient (A10)                 | system    | med  |
 * | CONSULTATION_CREATED         | createConsultation (A10)                    | doctor    | high |
 * | CONSULTATION_NOTES_UPDATED   | updateConsultationNotes (A10)               | doctor    | high |
 * | TREATMENT_CREATED            | createTreatment (A10)                       | doctor    | high |
 * | TREATMENT_UPDATED            | updateTreatmentStatus (A10)                 | doctor    | high |
 * | MEDICATION_CREATED           | (pendiente A20 medication management)       | doctor    | high |
 * | MEDICATION_DEACTIVATED       | (pendiente A20)                             | doctor    | high |
 * | HERMES_RESPONSE              | (pendiente A18 Hermes/GPT)                  | hermes    | high |
 * | HERMES_ESCALATION            | (pendiente A18)                             | hermes    | crit |
 * | WA_NOTIFICATION_SENT         | (pendiente A19 WhatsApp templates)          | system    | low  |
 * | WA_INCOMING_REDIRECTED       | (pendiente A19)                             | system    | low  |
 * | PAYMENT_INVOICE_CREATED      | (pendiente A14 paymentInvoices)             | system    | med  |
 * | PAYMENT_CONFIRMED            | (pendiente A14)                             | system    | high |
 * | PAYMENT_PARTIAL              | (pendiente A14)                             | system    | med  |
 * | PAYMENT_WRONG_NETWORK        | (pendiente A14)                             | system    | med  |
 * | ROLE_CHANGED                 | promoteProfileToDoctor (A10)                | system    | crit |
 * | ACCOUNT_DEACTIVATED          | (pendiente A20 admin)                       | admin     | crit |
 * | CONSENT_GRANTED              | grantConsent (A9)                           | patient   | high |
 * | CONSENT_REVOKED              | revokeConsent (A9)                          | patient   | high |
 * | DATA_DELETED                 | (pendiente A16 retention cron)              | system    | crit |
 * | DATA_ANONYMIZED              | (pendiente A16)                             | system    | crit |
 * | PRODUCTION_ENABLED           | enableProduction (A8)                       | admin     | crit |
 * | PRODUCTION_DISABLED          | disableProduction (A8)                      | admin     | crit |
 * | WALLET_VERIFIED              | consumeNonceAndSaveWallet (A4)              | patient   | high |
 * | PRG_CHECK_UPDATED            | updatePRGCheck (A8)                         | admin     | high |
 * | PRG_CHECK_APPROVED           | updatePRGCheck approve (A8)                 | admin     | crit |
 * | PRG_CHECK_REJECTED           | updatePRGCheck reject (A8)                  | admin     | crit |
 * | PRG_CHECK_EXPIRED            | updatePRGCheck expire (A8)                  | admin     | crit |
 *
 * NO se audita por decisión de diseño (alta frecuencia, sin valor legal):
 *  - sendMessage (A11): mensajes son volumen alto; el contenido se guarda
 *    cifrado en messages, eso es la evidencia. Solo se audita la apertura
 *    completa del expediente clínico (PATIENT_RECORD_READ_FULL).
 *  - markConversationRead (A11): cambio idempotente sin valor clínico.
 *  - listMyConversations, listMessages (A11): lecturas rutinarias.
 *  - getMyProfile, getMyPatient, getMyConsents (A9): self-reads.
 *  - listMyPatients, getMyDoctor (A10): self-reads del doctor.
 *
 * Severidades sugeridas para reportes:
 *  - crit: revisión inmediata (cambios de rol, producción, datos eliminados)
 *  - high: revisión periódica (datos clínicos, consentimientos, pagos)
 *  - med:  análisis estadístico (creación de cuentas, asignaciones)
 *  - low:  trazabilidad pasiva (notificaciones)
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ─────────────────────────────────────────────────────────────────────────────
// Lista cerrada de actions (debe coincidir EXACTAMENTE con auditActionEnum en
// convex/schema.ts). Mantener sincronizada manualmente: si se agrega una nueva
// action al schema, agregarla aquí también.
// ─────────────────────────────────────────────────────────────────────────────

const actionValidator = v.union(
  v.literal("PATIENT_CREATED"),
  v.literal("PATIENT_RECORD_READ_FULL"),
  v.literal("PATIENT_UPDATED"),
  v.literal("CONSULTATION_CREATED"),
  v.literal("CONSULTATION_NOTES_UPDATED"),
  v.literal("TREATMENT_CREATED"),
  v.literal("TREATMENT_UPDATED"),
  v.literal("MEDICATION_CREATED"),
  v.literal("MEDICATION_DEACTIVATED"),
  v.literal("HERMES_RESPONSE"),
  v.literal("HERMES_ESCALATION"),
  v.literal("WA_NOTIFICATION_SENT"),
  v.literal("WA_INCOMING_REDIRECTED"),
  v.literal("PAYMENT_INVOICE_CREATED"),
  v.literal("PAYMENT_CONFIRMED"),
  v.literal("PAYMENT_PARTIAL"),
  v.literal("PAYMENT_WRONG_NETWORK"),
  v.literal("ROLE_CHANGED"),
  v.literal("ACCOUNT_DEACTIVATED"),
  v.literal("CONSENT_GRANTED"),
  v.literal("CONSENT_REVOKED"),
  v.literal("DATA_DELETED"),
  v.literal("DATA_ANONYMIZED"),
  v.literal("PRODUCTION_ENABLED"),
  v.literal("PRODUCTION_DISABLED"),
  v.literal("WALLET_VERIFIED"),
  v.literal("PRG_CHECK_UPDATED"),
  v.literal("PRG_CHECK_APPROVED"),
  v.literal("PRG_CHECK_REJECTED"),
  v.literal("PRG_CHECK_EXPIRED"),
  v.literal("FEATURE_FLAG_TOGGLED"),
  v.literal("SPECIALIST_REGISTERED"),
  v.literal("SPECIALIST_APPROVED"),
  v.literal("SPECIALIST_WALLET_ACCESSED"),
  v.literal("APPOINTMENT_CREATED"),
  v.literal("APPOINTMENT_CONFIRMED"),
  v.literal("APPOINTMENT_LATE_PAYMENT_REQUIRES_REVIEW"),
  v.literal("LATE_PAYMENT_HANDLED"),
  v.literal("APPOINTMENT_COMPLETED"),
  v.literal("SPECIALIST_PAYOUT_EARNED"),
  v.literal("SPECIALIST_PAYOUT_PAID"),
  v.literal("SPECIALIST_PAYOUT_FAILED"),
);

const actorTypeValidator = v.union(
  v.literal("patient"),
  v.literal("doctor"),
  v.literal("admin"),
  v.literal("hermes"),
  v.literal("system"),
);

const targetTypeValidator = v.union(
  v.literal("patient"),
  v.literal("consultation"),
  v.literal("treatment"),
  v.literal("message"),
  v.literal("payment"),
  v.literal("profile"),
);

const channelValidator = v.union(
  v.literal("web"),
  v.literal("whatsapp"),
  v.literal("system"),
);

// ─────────────────────────────────────────────────────────────────────────────
// internal.audit.log — ÚNICA función que escribe en auditLogs
// ─────────────────────────────────────────────────────────────────────────────

export const log = internalMutation({
  args: {
    actorProfileId: v.optional(v.id("profiles")),
    actorType: actorTypeValidator,
    action: actionValidator,
    targetId: v.optional(v.string()),
    targetType: v.optional(targetTypeValidator),
    channel: channelValidator,
    ipAddress: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
  },
  returns: v.id("auditLogs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      actorProfileId: args.actorProfileId,
      actorType: args.actorType,
      action: args.action,
      targetId: args.targetId,
      targetType: args.targetType,
      channel: args.channel,
      ipAddress: args.ipAddress,
      promptVersion: args.promptVersion,
      modelVersion: args.modelVersion,
    });
  },
});
