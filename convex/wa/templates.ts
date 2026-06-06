export interface TemplateParams {
  patientName?: string;
  date?: string;
  time?: string;
  doctorName?: string;
  invoiceCode?: string;
  amount?: string;
}

const TEMPLATES: Record<string, (p: TemplateParams) => string> = {
  CHECKIN_INVITATION: (p) => {
    const name = p.patientName ? ` ${p.patientName}` : "";
    return `Hola${name}, soy SEPH-AI, tu asistente de salud. ¿Cómo te sientes hoy? Responde desde tu portal en Sephiem para contarme cómo estás.`;
  },

  NEW_DOCTOR_MESSAGE: (p) => {
    const name = p.patientName ? ` ${p.patientName}` : "";
    const doctor = p.doctorName ? ` tu médico${p.doctorName ? ` (${p.doctorName})` : ""}` : " tu médico";
    return `Hola${name}, tienes un nuevo mensaje de${doctor} en tu portal Sephiem. Revisa tu bitácora para leerlo.`;
  },

  APPOINTMENT_REMINDER: (p) => {
    const name = p.patientName ? ` ${p.patientName}` : "";
    const date = p.date ? ` para el ${p.date}` : "";
    const time = p.time ? ` a las ${p.time}` : "";
    return `Hola${name}, recordatorio: tienes una consulta agendada${date}${time}. Confirma o reagenda desde tu portal Sephiem.`;
  },

  HEALTH_PLAN_REMINDER: (p) => {
    const name = p.patientName ? ` ${p.patientName}` : "";
    return `Hola${name}, recuerda seguir tu plan de salud. Si tienes dudas, consulta a tu médico desde el portal Sephiem.`;
  },

  SUBSCRIPTION_RENEWAL: (p) => {
    const name = p.patientName ? ` ${p.patientName}` : "";
    const invoice = p.invoiceCode ? ` (factura: ${p.invoiceCode})` : "";
    return `Hola${name}, tu suscripción a Sephiem está por vencer${invoice}. Renueva desde tu portal para seguir usando el servicio.`;
  },

  MEDICAL_ALERT_URGENT: (p) => {
    const name = p.patientName ? `, ${p.patientName}` : "";
    return `⚠️ Alerta médica importante${name}. SEPH-AI detectó algo que requiere atención. Revisa tu portal médico de inmediato o contacta a tu médico.`;
  },
};

export function buildMessage(templateCode: string, params: TemplateParams): string | null {
  const builder = TEMPLATES[templateCode];
  if (!builder) return null;
  return builder(params);
}

const DESCRIPTIONS: Record<string, string> = {
  CHECKIN_INVITATION: "Invitación a checkin diario con SEPH-AI",
  NEW_DOCTOR_MESSAGE: "Notificación de nuevo mensaje del médico",
  APPOINTMENT_REMINDER: "Recordatorio de cita médica",
  HEALTH_PLAN_REMINDER: "Recordatorio de plan de salud",
  SUBSCRIPTION_RENEWAL: "Aviso de renovación de suscripción",
  MEDICAL_ALERT_URGENT: "Alerta médica urgente de SEPH-AI",
};

export function getTemplateDescription(code: string): string {
  return DESCRIPTIONS[code] ?? code;
}

export type TemplateCode = keyof typeof TEMPLATES;
