import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Sephiem — Schema Convex v5.3 (21 tablas de aplicación)
 *
 * Reglas globales:
 *  - Sin authTables: Privy gestiona la identidad fuera de Convex.
 *  - Enums siempre con v.union(v.literal(...)) para garantizar valores controlados.
 *  - Sin arrays no-acotados: listas largas viven en tablas separadas.
 *  - _creationTime es automático; sólo se define `updatedAt`/`sentAt`/`scheduledAt`
 *    cuando el valor de negocio difiere del momento de creación.
 *  - Índices con formato by_field1_and_field2.
 *  - Unicidad NO es nativa: se garantiza con .unique() + throw en internalMutation.
 *  - Validaciones de tamaño (allergies máx 50, content máx 4000 chars, etc.) se
 *    aplican en runtime dentro de las mutations correspondientes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums reutilizables — definidos una vez, importados donde haga falta
// ─────────────────────────────────────────────────────────────────────────────

const roleEnum = v.union(
  v.literal("patient"),
  v.literal("doctor"),
  v.literal("admin"),
);

const subscriptionStatusEnum = v.union(
  v.literal("pending_payment"),
  v.literal("active"),
  v.literal("expired"),
  v.literal("suspended"),
);

const consultationStatusEnum = v.union(
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const consultationChannelEnum = v.union(
  v.literal("web"),
  v.literal("presential"),
);

const treatmentStatusEnum = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("suspended"),
);

const conversationTypeEnum = v.union(
  v.literal("hermes_patient"),
  v.literal("doctor_patient"),
);

const senderTypeEnum = v.union(
  v.literal("patient"),
  v.literal("doctor"),
  v.literal("hermes"),
);

const messageTypeEnum = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("document"),
  v.literal("audio"),
);

const alertLevelEnum = v.union(
  v.literal("normal"),
  v.literal("attention"),
  v.literal("urgent"),
);

const alertCategoryEnum = v.union(
  v.literal("pain_reported"),
  v.literal("emergency_keywords"),
  v.literal("doctor_requested"),
  v.literal("mood_decline"),
  v.literal("medication_concern"),
  v.literal("other"),
);

const severityEnum = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const alertStatusEnum = v.union(
  v.literal("open"),
  v.literal("acknowledged"),
  v.literal("resolved"),
);

const currencyEnum = v.union(v.literal("SYS"), v.literal("USDT"));

const networkEnum = v.union(
  v.literal("syscoin_testnet"),
  v.literal("syscoin_mainnet"),
);

const invoiceStatusEnum = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("overpaid"),
  v.literal("partial"),
  v.literal("expired"),
  v.literal("cancelled"),
  v.literal("late_payment"), // B11 (VAL-55): pago de cita fuera del hold
);

const paymentStatusEnum = v.union(
  v.literal("pending"),
  v.literal("confirming"),
  v.literal("confirmed"),
  v.literal("failed"),
  v.literal("wrong_network"),
);

const consentTypeEnum = v.union(
  v.literal("terms"),
  v.literal("whatsapp_notifications"),
  v.literal("data_processing"),
  v.literal("ai_interaction"),
);

const actorTypeEnum = v.union(
  v.literal("patient"),
  v.literal("doctor"),
  v.literal("admin"),
  v.literal("hermes"),
  v.literal("system"),
);

const auditActionEnum = v.union(
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
  v.literal("APPOINTMENT_EXPIRED"),
  v.literal("SPECIALIST_PAYOUT_PAYABLE"),
);

const auditTargetTypeEnum = v.union(
  v.literal("patient"),
  v.literal("consultation"),
  v.literal("treatment"),
  v.literal("message"),
  v.literal("payment"),
  v.literal("profile"),
);

const auditChannelEnum = v.union(
  v.literal("web"),
  v.literal("whatsapp"),
  v.literal("system"),
);

const notificationTypeEnum = v.union(
  v.literal("appointment_scheduled"),
  v.literal("appointment_reminder"),
  v.literal("payment_confirmed"),
  v.literal("payment_pending"),
  v.literal("hermes_alert"),
  v.literal("medication_reminder"),
  v.literal("new_message"),
  v.literal("subscription_expiring"),
);

const waTemplateCodeEnum = v.union(
  v.literal("CHECKIN_INVITATION"),
  v.literal("NEW_DOCTOR_MESSAGE"),
  v.literal("APPOINTMENT_REMINDER"),
  v.literal("HEALTH_PLAN_REMINDER"),
  v.literal("SUBSCRIPTION_RENEWAL"),
  v.literal("MEDICAL_ALERT_URGENT"),
);

const waNotificationStatusEnum = v.union(
  v.literal("sent"),
  v.literal("failed"),
  v.literal("delivered"),
);

const prgCheckKeyEnum = v.union(
  v.literal("convex_dpa"),
  v.literal("privy_dpa"),
  v.literal("openai_dpa"),
  v.literal("twilio_dpa"),
  v.literal("hosting_dpa"),
  v.literal("auth_spike_validated"),
  v.literal("hd_wallet_setup"),
  v.literal("vps_hardening"),
  v.literal("hermes_clinical_approval"),
  v.literal("hermes_redteam_complete"),
  v.literal("legal_retention_review"),
  v.literal("incident_response_doc"),
  v.literal("backup_restore_validated"),
  v.literal("wallet_sweep_sop"),
);

const prgStatusEnum = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

export default defineSchema({
  // ── 1. profiles ────────────────────────────────────────────────────────────
  // Perfil base de todos los roles. Reemplaza authTables.
  // tokenIdentifier = identity.tokenIdentifier de Privy ("privy.io|did:privy:...").
  // walletAddress se verifica con firma server-side (ver tabla walletNonces).
  profiles: defineTable({
    tokenIdentifier: v.string(),
    walletAddress: v.string(),
    role: roleEnum,
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_walletAddress", ["walletAddress"])
    .index("by_role", ["role"]),

  // ── 2. patients ────────────────────────────────────────────────────────────
  // Datos clínicos y de suscripción.
  // isFictional=true mientras systemSettings.productionEnabled=false.
  // allergies: máx 50 items, máx 100 chars cada uno (validación runtime).
  patients: defineTable({
    profileId: v.id("profiles"),
    assignedDoctorId: v.optional(v.id("doctors")),
    subscriptionStatus: subscriptionStatusEnum,
    subscriptionExpiresAt: v.optional(v.number()),
    onboardingComplete: v.boolean(),
    dateOfBirth: v.string(), // ISO date
    bloodType: v.optional(v.string()),
    allergies: v.optional(v.array(v.string())),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    retentionExpiresAt: v.optional(v.number()),
    isFictional: v.boolean(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_assignedDoctorId", ["assignedDoctorId"])
    .index("by_subscriptionStatus", ["subscriptionStatus"])
    .index("by_isFictional", ["isFictional"]),

  // ── 3. doctors ─────────────────────────────────────────────────────────────
  // Perfil profesional estable. bio máx 1000 chars (validación runtime).
  doctors: defineTable({
    profileId: v.id("profiles"),
    specialty: v.string(),
    licenseNumber: v.string(),
    bio: v.optional(v.string()),
    maxPatients: v.number(),
  }).index("by_profileId", ["profileId"]),

  // ── 4. doctorAvailability ──────────────────────────────────────────────────
  // Alta-churn: separado de doctors para evitar contención.
  // Un registro único por doctor (validar con .unique() en mutation).
  doctorAvailability: defineTable({
    doctorId: v.id("doctors"),
    isAvailable: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_doctorId", ["doctorId"])
    .index("by_isAvailable", ["isAvailable"]),

  // ── 5. doctorSchedules ─────────────────────────────────────────────────────
  // Bloques semanales. dayOfWeek 0-6, startTime < endTime (validación runtime).
  doctorSchedules: defineTable({
    doctorId: v.id("doctors"),
    dayOfWeek: v.number(),
    startTime: v.string(), // "HH:MM"
    endTime: v.string(),
    isActive: v.boolean(),
  })
    .index("by_doctorId", ["doctorId"])
    .index("by_doctorId_and_dayOfWeek", ["doctorId", "dayOfWeek"]),

  // ── 6. consultations ───────────────────────────────────────────────────────
  // scheduledAt: timestamp de la cita (dato de negocio ≠ _creationTime).
  // doctorNotes máx 5000 chars, summary máx 2000 chars (validación runtime).
  consultations: defineTable({
    patientId: v.id("patients"),
    doctorId: v.id("doctors"),
    scheduledAt: v.number(),
    status: consultationStatusEnum,
    channel: consultationChannelEnum,
    doctorNotes: v.optional(v.string()),
    summary: v.optional(v.string()),
    followUpAt: v.optional(v.number()),
  })
    .index("by_patientId", ["patientId"])
    .index("by_doctorId", ["doctorId"])
    .index("by_patientId_and_status", ["patientId", "status"])
    .index("by_scheduledAt", ["scheduledAt"]),

  // ── 7. treatments ──────────────────────────────────────────────────────────
  // Plan de tratamiento. diagnosis máx 500, notes máx 2000 chars.
  treatments: defineTable({
    patientId: v.id("patients"),
    doctorId: v.id("doctors"),
    consultationId: v.optional(v.id("consultations")),
    diagnosis: v.string(),
    description: v.optional(v.string()),
    status: treatmentStatusEnum,
    startDate: v.string(), // ISO date
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_patientId", ["patientId"])
    .index("by_doctorId", ["doctorId"])
    .index("by_patientId_and_status", ["patientId", "status"]),

  // ── 8. medications ─────────────────────────────────────────────────────────
  // Tabla separada — NUNCA como array dentro de treatments (regla Convex).
  // patientId desnormalizado para queries directas.
  medications: defineTable({
    treatmentId: v.id("treatments"),
    patientId: v.id("patients"),
    name: v.string(),
    dosage: v.string(),
    frequency: v.string(),
    instructions: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    isActive: v.boolean(),
    reminderEnabled: v.boolean(),
  })
    .index("by_treatmentId", ["treatmentId"])
    .index("by_patientId", ["patientId"])
    .index("by_patientId_and_isActive", ["patientId", "isActive"]),

  // ── 9. conversations ───────────────────────────────────────────────────────
  // Hilos del portal web ÚNICAMENTE. WhatsApp no genera conversations.
  // doctorId null = conversación solo con Hermes.
  conversations: defineTable({
    patientId: v.id("patients"),
    doctorId: v.optional(v.id("doctors")),
    type: conversationTypeEnum,
    isActive: v.boolean(),
    lastMessageAt: v.number(),
  })
    .index("by_patientId", ["patientId"])
    .index("by_doctorId", ["doctorId"])
    .index("by_patientId_and_type", ["patientId", "type"]),

  // ── 10. messages ───────────────────────────────────────────────────────────
  // Solo mensajes del portal web. content máx 4000 chars (validación runtime).
  // Queries DEBEN usar paginationOptsValidator.
  // sentAt = _creationTime para mensajes web (igualados en mutation).
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderProfileId: v.optional(v.id("profiles")),
    senderType: senderTypeEnum,
    content: v.string(),
    messageType: messageTypeEnum,
    mediaStorageId: v.optional(v.id("_storage")),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    sentAt: v.number(),
  })
    .index("by_conversationId_and_sentAt", ["conversationId", "sentAt"])
    .index("by_senderProfileId", ["senderProfileId"])
    .index("by_conversationId_and_senderType", ["conversationId", "senderType"]),

  // ── 11. hermesState ────────────────────────────────────────────────────────
  // Memoria acotada por paciente. contextSummary máx 2000 chars.
  // Único por patientId (validar con .unique() en mutation).
  // SIN arrays no-acotados (contexto LLM = contextSummary + .take(10) messages).
  hermesState: defineTable({
    patientId: v.id("patients"),
    contextSummary: v.string(),
    lastCheckinAt: v.optional(v.number()),
    lastReportedMood: v.optional(v.string()),
    alertLevel: alertLevelEnum,
    alertReason: v.optional(v.string()),
    promptVersion: v.string(),
    totalInteractions: v.number(),
    updatedAt: v.number(),
  })
    .index("by_patientId", ["patientId"])
    .index("by_alertLevel", ["alertLevel"]),

  // ── 12. medicalAlerts ──────────────────────────────────────────────────────
  // SIN texto libre clínico (BLOCKER auditoría v5).
  // El detalle clínico se ve abriendo triggerMessageId en el portal con RBAC.
  // alertCode máx 50 chars (validación runtime).
  medicalAlerts: defineTable({
    patientId: v.id("patients"),
    doctorId: v.id("doctors"),
    triggeredBy: v.union(v.literal("hermes"), v.literal("patient")),
    severity: severityEnum,
    alertCategory: alertCategoryEnum,
    alertCode: v.string(),
    triggerMessageId: v.optional(v.id("messages")),
    status: alertStatusEnum,
    acknowledgedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    escalationCount: v.number(),
  })
    .index("by_patientId", ["patientId"])
    .index("by_doctorId", ["doctorId"])
    .index("by_status", ["status"])
    .index("by_severity_and_status", ["severity", "status"])
    .index("by_doctorId_and_status", ["doctorId", "status"]),

  // ── 13. paymentInvoices ────────────────────────────────────────────────────
  // Una dirección Syscoin única por invoice (derivada de HD wallet BIP44).
  // invoiceCode y derivedAddress únicos transaccionalmente.
  paymentInvoices: defineTable({
    patientId: v.id("patients"),
    invoiceCode: v.string(), // ej: "SPH-20260001"
    derivedAddress: v.string(),
    derivationIndex: v.number(),
    amountExpected: v.string(), // string para precisión decimal
    currency: currencyEnum,
    tokenDecimals: v.number(), // 18 SYS, 6 USDT
    tokenContractAddress: v.optional(v.string()),
    expectedChainId: v.number(), // 5700 = Syscoin testnet
    status: invoiceStatusEnum,
    expiresAt: v.number(),
    subscriptionMonths: v.number(),
    // B11 (VAL-55): si la invoice corresponde a una cita (no suscripción).
    appointmentId: v.optional(v.id("appointments")),
  })
    .index("by_patientId", ["patientId"])
    .index("by_invoiceCode", ["invoiceCode"])
    .index("by_derivedAddress", ["derivedAddress"])
    .index("by_status", ["status"]),

  // ── 14. payments ───────────────────────────────────────────────────────────
  // Pagos on-chain. Idempotentes por txHash (único transaccional).
  // Previene doble activación de suscripción.
  payments: defineTable({
    invoiceId: v.id("paymentInvoices"),
    patientId: v.id("patients"),
    walletAddress: v.string(),
    txHash: v.string(),
    amountReceived: v.string(),
    currency: currencyEnum,
    network: networkEnum,
    detectedChainId: v.number(),
    status: paymentStatusEnum,
    blockNumber: v.optional(v.number()),
    minConfirmations: v.number(), // 12 testnet, 30 mainnet
    currentConfirmations: v.number(),
    confirmedAt: v.optional(v.number()),
    reconciled: v.boolean(),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_patientId", ["patientId"])
    .index("by_txHash", ["txHash"])
    .index("by_status", ["status"])
    .index("by_reconciled_and_status", ["reconciled", "status"]),

  // ── 15. consents ───────────────────────────────────────────────────────────
  // Consentimientos explícitos. whatsapp_notifications incluye texto informado
  // sobre revelación de relación con servicio de salud.
  consents: defineTable({
    patientId: v.id("patients"),
    consentType: consentTypeEnum,
    granted: v.boolean(),
    grantedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    documentVersion: v.string(),
  })
    .index("by_patientId", ["patientId"])
    .index("by_patientId_and_consentType", ["patientId", "consentType"]),

  // ── 16. auditLogs ──────────────────────────────────────────────────────────
  // Append-only por convención: SOLO internal.audit.log puede insertar aquí.
  // Lista cerrada de actions. SIN PHI en ningún campo de texto.
  // targetId solo refiere IDs (nunca contenido clínico).
  auditLogs: defineTable({
    actorProfileId: v.optional(v.id("profiles")),
    actorType: actorTypeEnum,
    action: auditActionEnum,
    targetId: v.optional(v.string()),
    targetType: v.optional(auditTargetTypeEnum),
    channel: auditChannelEnum,
    ipAddress: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    modelVersion: v.optional(v.string()),
  })
    .index("by_actorProfileId", ["actorProfileId"])
    .index("by_targetId_and_targetType", ["targetId", "targetType"])
    .index("by_action", ["action"]),

  // ── 17. notifications ──────────────────────────────────────────────────────
  // Plantillas cerradas. Sin title/body libre — el texto se resuelve server-side
  // a partir del `type`. templateParams solo lleva date/invoiceCode (sin PHI).
  notifications: defineTable({
    profileId: v.id("profiles"),
    type: notificationTypeEnum,
    templateParams: v.object({
      date: v.optional(v.string()),
      invoiceCode: v.optional(v.string()),
    }),
    relatedId: v.optional(v.string()),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
  })
    .index("by_profileId_and_isRead", ["profileId", "isRead"])
    .index("by_profileId", ["profileId"]),

  // ── 18. waNotifications ────────────────────────────────────────────────────
  // Log de plantillas WA enviadas. SIN contenido clínico.
  // Solo los 6 códigos de plantilla permitidos (templateCode enum).
  waNotifications: defineTable({
    patientId: v.id("patients"),
    templateCode: waTemplateCodeEnum,
    status: waNotificationStatusEnum,
    twilioSid: v.optional(v.string()),
    sentAt: v.number(),
  })
    .index("by_patientId", ["patientId"])
    .index("by_patientId_and_templateCode", ["patientId", "templateCode"])
    .index("by_sentAt", ["sentAt"]),

  // ── 19. systemSettings ─────────────────────────────────────────────────────
  // Discriminated union tipada por key. Cada setting tiene su tipo nativo.
  // Seeds al primer deploy: productionEnabled=false, auditLogRetentionDays=730,
  // patientRetentionMonths=12.
  systemSettings: defineTable(
    v.union(
      v.object({
        key: v.literal("productionEnabled"),
        value: v.boolean(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      v.object({
        key: v.literal("auditLogRetentionDays"),
        value: v.number(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      v.object({
        key: v.literal("patientRetentionMonths"),
        value: v.number(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      v.object({
        key: v.literal("productionDisabledReason"),
        value: v.string(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      // A14: counter atómico de derivationIndex para HD wallet BIP44
      v.object({
        key: v.literal("nextDerivationIndex"),
        value: v.number(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      // B6 (VAL-50): feature flags. Gate de módulos de Fase 1.
      v.object({
        key: v.literal("marketplaceEnabled"),
        value: v.boolean(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      v.object({
        key: v.literal("appointmentsEnabled"),
        value: v.boolean(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
      v.object({
        key: v.literal("paymentsEnabled"),
        value: v.boolean(),
        updatedAt: v.number(),
        updatedByProfileId: v.optional(v.id("profiles")),
      }),
    ),
  ).index("by_key", ["key"]),

  // ── 20. productionReadinessChecks ──────────────────────────────────────────
  // 14 checks del PRG. enableProduction valida que TODOS estén "approved".
  // documentVersion obligatorio runtime para los 9 checks documentales.
  // evidence obligatorio runtime cuando status="approved".
  productionReadinessChecks: defineTable({
    checkKey: prgCheckKeyEnum,
    status: prgStatusEnum,
    evidence: v.optional(v.string()),
    approvedByProfileId: v.optional(v.id("profiles")),
    approvedAt: v.optional(v.number()),
    documentVersion: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_checkKey", ["checkKey"])
    .index("by_status", ["status"]),

  // ── 21. walletNonces ───────────────────────────────────────────────────────
  // Nonces server-side para verificación de wallet (single-use, TTL 5 min).
  // Bound a tokenIdentifier del usuario autenticado.
  // Único por tokenIdentifier (validar con .unique() en mutation).
  walletNonces: defineTable({
    tokenIdentifier: v.string(),
    nonce: v.string(), // crypto.randomUUID()
    expiresAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_expiresAt", ["expiresAt"]),

  // ── 22. marketplaceSpecialists ─────────────────────────────────────────────
  // B7 (VAL-51) — Marketplace de especialistas.
  // SEGURIDAD: walletAddress NUNCA debe exponerse en queries públicas; solo vía
  // RBAC estricto (admin/system). Único por profileId (validar con .unique()).
  // consultationFeeSYS en string para precisión decimal (igual que pagos).
  marketplaceSpecialists: defineTable({
    profileId: v.id("profiles"),
    licenseNumber: v.string(),
    jurisdiction: v.string(),
    walletAddress: v.string(),
    isVerifiedByAdmin: v.boolean(),
    specialty: v.string(),
    description: v.optional(v.string()),
    consultationFeeSYS: v.string(),
    yearsOfExperience: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_isVerifiedByAdmin", ["isVerifiedByAdmin"])
    .index("by_specialty", ["specialty"]),

  // ── 23. specialistAvailability ─────────────────────────────────────────────
  // B7 (VAL-51) — Disponibilidad semanal recurrente del especialista.
  // dayOfWeek: 0=domingo … 6=sábado. startTime/endTime "HH:MM".
  specialistAvailability: defineTable({
    specialistId: v.id("marketplaceSpecialists"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isActive: v.boolean(),
  }).index("by_specialistId", ["specialistId"]),

  // ── 24. appointmentSlots ───────────────────────────────────────────────────
  // B7 (VAL-51) — Slots concretos de cita generados desde availability.
  // Máquina de estados: solo `available` es mutable; held→TTL en heldUntil.
  // (specialistReviews se añade en VAL-54 [B10] junto con la tabla appointments.)
  appointmentSlots: defineTable({
    specialistId: v.id("marketplaceSpecialists"),
    startTime: v.number(),
    endTime: v.number(),
    status: v.union(
      v.literal("available"),
      v.literal("held"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    patientId: v.optional(v.id("patients")),
    heldUntil: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_specialistId", ["specialistId"])
    .index("by_status", ["status"])
    .index("by_specialistId_and_status", ["specialistId", "status"])
    .index("by_status_and_heldUntil", ["status", "heldUntil"])
    .index("by_startTime", ["startTime"]),

  // ── 25. appointments ───────────────────────────────────────────────────────
  // B10 (VAL-54) — Cita = reserva de un appointmentSlot por un paciente.
  // slotId enlaza con appointmentSlots (disponibilidad); appointments lleva el
  // estado de la cita + datos de pago. completedAt marca el paso a "completed"
  // (base para earned→payable del payout tras 24h).
  appointments: defineTable({
    specialistId: v.id("marketplaceSpecialists"),
    patientId: v.id("patients"),
    slotId: v.id("appointmentSlots"),
    startTime: v.number(),
    endTime: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
      v.literal("pending_payment_late"),
      v.literal("pending_reschedule"),
      v.literal("credit_issued"),
    ),
    completedAt: v.optional(v.number()),
    invoiceId: v.optional(v.id("paymentInvoices")),
    amountPaidSYS: v.optional(v.string()),
    txHash: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_specialistId", ["specialistId"])
    .index("by_patientId", ["patientId"])
    .index("by_slotId", ["slotId"])
    .index("by_status", ["status"]),

  // ── 26. specialistReviews ──────────────────────────────────────────────────
  // B7/B10 (VAL-51 diferido → VAL-54) — Reseña de una cita completada.
  // Sin campo `comment` (riesgo PHI). Rating 1-5 validado en runtime.
  // by_appointmentId único: una reseña por cita (validar con .unique()).
  // El rating promedio se calcula en tiempo real (no se almacena).
  specialistReviews: defineTable({
    appointmentId: v.id("appointments"),
    specialistId: v.id("marketplaceSpecialists"),
    patientProfileId: v.id("profiles"),
    rating: v.number(),
    createdAt: v.number(),
  })
    .index("by_appointmentId", ["appointmentId"])
    .index("by_specialistId", ["specialistId"])
    .index("by_createdAt", ["createdAt"]),

  // ── 27. specialistPayouts ──────────────────────────────────────────────────
  // B10 (VAL-54) — Lifecycle financiero del payout al especialista.
  // SEGURIDAD: payoutTxHash completo solo accesible vía RBAC admin/system.
  // Antes del payout NO existe txHash; para logs/audit usar
  // destinationWalletAddressHash (siempre presente desde creación).
  // earnedAt marca earned→ (base para earned→payable tras 24h de hold).
  specialistPayouts: defineTable({
    specialistId: v.id("marketplaceSpecialists"),
    appointmentId: v.id("appointments"),
    amountSYS: v.string(),
    platformFeeSYS: v.optional(v.string()),
    amountToSpecialistSYS: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("earned"),
      v.literal("payable"),
      v.literal("processing"),
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("failed"),
      v.literal("disputed"),
    ),
    destinationWalletAddressHash: v.string(),
    payoutTxHash: v.optional(v.string()),
    payoutTxHashHash: v.optional(v.string()),
    processedByProfileId: v.optional(v.id("profiles")),
    failureReason: v.optional(v.string()),
    retryCount: v.optional(v.number()),
    disputeReason: v.optional(v.string()),
    refundReason: v.optional(v.string()),
    createdAt: v.number(),
    earnedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  })
    .index("by_specialistId", ["specialistId"])
    .index("by_appointmentId", ["appointmentId"])
    .index("by_status", ["status"]),
});
