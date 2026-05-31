/**
 * A9 — Onboarding del paciente
 *
 * Aparece después de Verificar Wallet (A4) cuando el patient aún no existe.
 * Recoge datos personales + los 4 consents obligatorios y dispara:
 *   - completeOnboarding (crea patient + actualiza profile)
 *   - grantConsent x4 (uno por cada tipo)
 *
 * Usa la paleta Sephiem y mantiene look del dashboard (ink/graphite/mist).
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { useWallets } from "@privy-io/react-auth";
import { api } from "../convex/_generated/api";

const DOC_VERSION = "v1.0"; // version del texto de consentimiento

const CONSENT_DEFINITIONS = [
  {
    key: "terms" as const,
    title: "Términos y condiciones",
    body: "Acepto los términos y condiciones de uso de Sephiem.",
  },
  {
    key: "data_processing" as const,
    title: "Procesamiento de datos",
    body: "Autorizo el almacenamiento y procesamiento de mis datos clínicos en la plataforma Sephiem.",
  },
  {
    key: "ai_interaction" as const,
    title: "Interacción con IA (Hermes)",
    body: "Acepto que Hermes (asistente IA) procese mis mensajes del portal web para darme acompañamiento. Hermes NO sustituye al médico humano.",
  },
  {
    key: "whatsapp_notifications" as const,
    title: "Notificaciones por WhatsApp",
    body: "Acepto recibir notificaciones de Sephiem por WhatsApp. Entiendo que estos mensajes pueden revelar que soy usuario de un servicio de salud.",
  },
];

export function Onboarding() {
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const completeOnboarding = useMutation(
    api.patients.onboarding.completeOnboarding,
  );
  const grantConsent = useMutation(api.patients.consents.grantConsent);

  const [step, setStep] = useState<"form" | "consents" | "submitting" | "error">(
    "form",
  );
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  // Consents state (4)
  const [consentsGranted, setConsentsGranted] = useState<Record<string, boolean>>(
    {
      terms: false,
      data_processing: false,
      ai_interaction: false,
      whatsapp_notifications: false,
    },
  );

  function handleNext() {
    setError(null);
    // Validaciones básicas client-side (la mutation re-valida en server)
    if (name.trim().length < 2) {
      setError("Ingresa tu nombre completo");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Email inválido");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      setError("Fecha de nacimiento inválida (YYYY-MM-DD)");
      return;
    }
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
      setError("Teléfono debe estar en formato E.164 (+584141234567)");
      return;
    }
    setStep("consents");
  }

  async function handleSubmit() {
    setError(null);
    // Los 3 primeros son obligatorios. whatsapp_notifications es opcional.
    const mandatory: Array<keyof typeof consentsGranted> = [
      "terms",
      "data_processing",
      "ai_interaction",
    ];
    for (const key of mandatory) {
      if (!consentsGranted[key]) {
        setError(`Debes aceptar: ${key.replace("_", " ")}`);
        return;
      }
    }

    setStep("submitting");
    try {
      // 1. completeOnboarding
      const allergiesArr = allergies
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      await completeOnboarding({
        name,
        email,
        phone: phone || undefined,
        dateOfBirth,
        bloodType: bloodType || undefined,
        allergies: allergiesArr.length > 0 ? allergiesArr : undefined,
        emergencyContactName: emergencyName || undefined,
        emergencyContactPhone: emergencyPhone || undefined,
      });

      // 2. grantConsent por cada uno marcado
      for (const def of CONSENT_DEFINITIONS) {
        if (consentsGranted[def.key]) {
          await grantConsent({
            consentType: def.key,
            documentVersion: DOC_VERSION,
          });
        }
      }

      // Listo. App.tsx detecta getMyPatient !== null y oculta este componente.
    } catch (err) {
      const e = err as Error;
      const data = (err as { data?: { code?: string; message?: string } }).data;
      setError(data?.message ?? e.message ?? "Error desconocido");
      setStep("error");
    }
  }

  return (
    <div className="min-h-screen bg-ink text-porcelain flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-royal-azure to-ship-cove flex items-center justify-center shadow-lg shadow-royal-azure/20">
              <span className="text-porcelain font-bold">S</span>
            </div>
            <span className="font-bold text-xl tracking-wide">SEPHIEM</span>
          </div>
          <h1 className="text-2xl font-bold">Completemos tu perfil</h1>
          <p className="text-porcelain/60 text-sm mt-1">
            Tomará menos de un minuto. Tus datos son tuyos.
          </p>
        </div>

        {/* Indicador de paso */}
        <div className="flex items-center gap-2 mb-6 justify-center">
          <StepDot active={step === "form"} done={step !== "form"} label="1. Datos" />
          <div className="w-8 h-px bg-mist" />
          <StepDot
            active={step === "consents"}
            done={step === "submitting" || step === "error"}
            label="2. Consentimientos"
          />
        </div>

        <div className="bg-graphite border border-mist rounded-lg p-6">
          {step === "form" && (
            <FormStep
              name={name} setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              dateOfBirth={dateOfBirth} setDateOfBirth={setDateOfBirth}
              bloodType={bloodType} setBloodType={setBloodType}
              allergies={allergies} setAllergies={setAllergies}
              emergencyName={emergencyName} setEmergencyName={setEmergencyName}
              emergencyPhone={emergencyPhone} setEmergencyPhone={setEmergencyPhone}
              walletAddress={wallet?.address}
            />
          )}

          {step === "consents" && (
            <ConsentsStep
              consentsGranted={consentsGranted}
              setConsentsGranted={setConsentsGranted}
            />
          )}

          {step === "submitting" && (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-2 border-porcelain/30 border-t-royal-azure rounded-full animate-spin mb-3" />
              <p className="text-sm text-porcelain/70">Guardando tu perfil…</p>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-8">
              <p className="text-soft-fawn font-semibold mb-2">No pudimos completar el registro</p>
              <p className="text-xs text-porcelain/60 font-mono mb-4 break-words">{error}</p>
              <button
                onClick={() => setStep("form")}
                className="bg-royal-azure hover:bg-royal-azure/90 text-porcelain text-sm px-4 py-2 rounded-md"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Errors inline */}
          {error && step !== "error" && step !== "submitting" && (
            <p className="text-soft-fawn text-xs mt-4 font-mono">{error}</p>
          )}

          {/* Footer botones */}
          {(step === "form" || step === "consents") && (
            <div className="flex justify-between items-center mt-6 pt-6 border-t border-mist">
              {step === "consents" ? (
                <button
                  onClick={() => { setStep("form"); setError(null); }}
                  className="text-porcelain/60 hover:text-porcelain text-sm"
                >
                  ← Volver
                </button>
              ) : <div />}
              <button
                onClick={step === "form" ? handleNext : () => void handleSubmit()}
                className="bg-royal-azure hover:bg-royal-azure/90 text-porcelain font-medium px-6 py-2 rounded-md transition-colors"
              >
                {step === "form" ? "Continuar →" : "Finalizar onboarding"}
              </button>
            </div>
          )}
        </div>

        <p className="text-[10px] text-porcelain/40 mt-4 text-center font-mono">
          Modo prototipo · datos marcados como ficticios · sin PHI real
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function StepDot({
  active, done, label,
}: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span
        className={`w-2 h-2 rounded-full ${
          done ? "bg-success" : active ? "bg-royal-azure" : "bg-mist"
        }`}
      />
      <span className={active ? "text-porcelain" : "text-porcelain/50"}>
        {label}
      </span>
    </div>
  );
}

type FormStepProps = {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  dateOfBirth: string; setDateOfBirth: (v: string) => void;
  bloodType: string; setBloodType: (v: string) => void;
  allergies: string; setAllergies: (v: string) => void;
  emergencyName: string; setEmergencyName: (v: string) => void;
  emergencyPhone: string; setEmergencyPhone: (v: string) => void;
  walletAddress?: string;
};

function FormStep(p: FormStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold mb-1">Datos personales</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre completo *" value={p.name} onChange={p.setName} placeholder="María García" />
        <Field label="Email *" value={p.email} onChange={p.setEmail} type="email" placeholder="maria@ejemplo.com" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="Teléfono (E.164, opcional)"
          value={p.phone} onChange={p.setPhone}
          placeholder="+584141234567"
        />
        <Field
          label="Fecha de nacimiento *"
          value={p.dateOfBirth} onChange={p.setDateOfBirth}
          type="date"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo de sangre" value={p.bloodType} onChange={p.setBloodType} placeholder="O+" />
        <Field label="Alergias (separadas por coma)" value={p.allergies} onChange={p.setAllergies} placeholder="penicilina, polen" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Contacto de emergencia" value={p.emergencyName} onChange={p.setEmergencyName} placeholder="Juan Pérez" />
        <Field label="Teléfono contacto (E.164)" value={p.emergencyPhone} onChange={p.setEmergencyPhone} placeholder="+584145555555" />
      </div>

      {p.walletAddress && (
        <div className="mt-2 p-3 border border-mist rounded bg-ink/50">
          <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-1">
            Wallet asociada (verificada)
          </div>
          <div className="text-xs font-mono text-porcelain/80 truncate">
            {p.walletAddress}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-porcelain/55 font-mono">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-ink border border-mist rounded px-3 py-2 text-sm focus:outline-none focus:border-royal-azure/60"
      />
    </label>
  );
}

function ConsentsStep({
  consentsGranted,
  setConsentsGranted,
}: {
  consentsGranted: Record<string, boolean>;
  setConsentsGranted: (v: Record<string, boolean>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold mb-1">Consentimientos</h2>
        <p className="text-xs text-porcelain/55 leading-relaxed">
          Los 3 primeros son obligatorios. El cuarto (WhatsApp) es opcional —
          puedes activarlo o desactivarlo en cualquier momento desde tu perfil.
        </p>
      </div>

      {CONSENT_DEFINITIONS.map((def) => {
        const isMandatory = def.key !== "whatsapp_notifications";
        const checked = consentsGranted[def.key];
        return (
          <label
            key={def.key}
            className={`flex gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
              checked
                ? "border-royal-azure/60 bg-royal-azure/5"
                : "border-mist hover:border-mist/80 bg-ink/30"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                setConsentsGranted({
                  ...consentsGranted,
                  [def.key]: e.target.checked,
                })
              }
              className="mt-1 accent-royal-azure"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium">{def.title}</span>
                {isMandatory && (
                  <span className="text-[10px] text-soft-fawn font-mono">
                    Obligatorio
                  </span>
                )}
              </div>
              <p className="text-xs text-porcelain/65 leading-relaxed">
                {def.body}
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
}
