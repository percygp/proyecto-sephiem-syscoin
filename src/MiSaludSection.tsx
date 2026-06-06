/**
 * A19 — Dashboard "Mi salud" del paciente
 *
 * Muestra: próxima cita, estado suscripción, último check-in Hermes,
 * alertas activas, historial reciente y acceso rápido a WhatsApp.
 */
import { useState } from "react";
import { useQuery, useAction, useConvexAuth } from "convex/react";
import { useWallets } from "@privy-io/react-auth";
import { api } from "../convex/_generated/api";
import { Onboarding } from "./Onboarding";
import {
  useNextOnChainAppointment,
  APPOINTMENT_STATUS_LABEL,
} from "./web3/useSyscoin";

const DISCORD_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.031.053a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

function DiscordBotButton() {
  const botId = import.meta.env.VITE_DISCORD_BOT_ID as string | undefined;
  const getDMUrl = useAction(api.discord.dmChannel.getDiscordDMUrl);
  const [loading, setLoading] = useState(false);

  if (!botId) return null;

  async function openDM() {
    setLoading(true);
    try {
      const url = await getDMUrl({});
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        // Fallback: perfil del bot (usuario no tiene Discord vinculado)
        window.open(`https://discord.com/users/${botId}`, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(`https://discord.com/users/${botId}`, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => void openDM()}
      disabled={loading}
      className="flex-1 flex items-center justify-center gap-2 bg-[#5865F2]/10 border border-[#5865F2]/40 text-[#5865F2] text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#5865F2]/20 transition disabled:opacity-60"
    >
      {loading ? (
        <span className="animate-spin inline-block text-base">⟳</span>
      ) : (
        DISCORD_SVG
      )}
      {loading ? "Abriendo Discord…" : "Hablar con SEPH-AI — Discord"}
    </button>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

const CONSULT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Programada",
  completed: "Completada",
  cancelled: "Cancelada",
  in_progress: "En curso",
  no_show: "No asistió",
};

const FEATURE_CARDS = [
  {
    icon: "📅",
    title: "Próxima cita",
    desc: "Ve la fecha, hora y especialidad de tu siguiente consulta agendada.",
  },
  {
    icon: "⚕",
    title: "Datos clínicos",
    desc: "Tipo de sangre, alergias y contacto de emergencia registrados.",
  },
  {
    icon: "📋",
    title: "Historial de consultas",
    desc: "Tus últimas consultas con resumen y estado.",
  },
  {
    icon: "◐",
    title: "Atención por Discord",
    desc: "Habla con SEPH-AI directamente desde Discord.",
  },
];

export function MiSaludSection({ isGuest, onLogin }: { isGuest?: boolean; onLogin?: () => void }) {
  const { isAuthenticated: convexOk } = useConvexAuth();
  const dashboard = useQuery(
    api.patients.healthDashboard.getPatientDashboard,
    convexOk ? {} : "skip",
  );
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;
  const { appointment: onChainAppt, loading: onChainLoading } = useNextOnChainAppointment(walletAddress);

  if (isGuest) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Hero */}
          <div className="bg-graphite border border-royal-azure/30 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-royal-azure to-ship-cove flex items-center justify-center shrink-0 shadow-lg shadow-royal-azure/20">
              <span className="text-porcelain font-bold text-lg">S</span>
            </div>
            <div className="flex-1">
              <h1 className="font-bold text-base text-porcelain mb-0.5">Tu salud, bajo tu control</h1>
              <p className="text-xs text-porcelain/60 leading-relaxed">
                Gestiona tu historial clínico, agenda citas con especialistas y accede a Hermes IA.
                Conéctate para activar todas las funciones.
              </p>
            </div>
            <button
              onClick={onLogin}
              className="shrink-0 bg-royal-azure hover:bg-royal-azure/90 text-porcelain text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              Conectar →
            </button>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURE_CARDS.map((f) => (
              <div key={f.title} className="bg-graphite border border-mist rounded-lg p-4 flex gap-3 relative overflow-hidden">
                <span className="text-xl shrink-0 opacity-50">{f.icon}</span>
                <div>
                  <div className="text-sm font-medium text-porcelain/70 mb-0.5">{f.title}</div>
                  <p className="text-xs text-porcelain/45 leading-relaxed">{f.desc}</p>
                </div>
                {/* lock overlay */}
                <div
                  onClick={onLogin}
                  className="absolute inset-0 bg-ink/0 hover:bg-ink/40 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-all cursor-pointer group"
                >
                  <span className="text-[10px] text-royal-azure font-medium bg-ink/80 border border-royal-azure/40 px-2 py-1 rounded-full group-hover:border-royal-azure">
                    Conectar para ver →
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-porcelain/35 text-center font-mono pt-2">
            SEPHIEM · Protocolo Clínico Web3 · Datos cifrados AES-256
          </p>
        </div>
      </div>
    );
  }

  if (dashboard === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center text-porcelain/50 text-sm">
        Cargando dashboard…
      </div>
    );
  }

  if (dashboard === null) {
    return <Onboarding />;
  }

  const {
    patient,
    activeAlertsCount,
    recentConsultations,
  } = dashboard;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">

        {/* Header bienvenida */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Mi salud</h1>
            <p className="text-xs text-porcelain/50">Resumen de tu estado clínico</p>
          </div>
          {activeAlertsCount > 0 && (
            <div className="flex items-center gap-1.5 bg-soft-fawn/10 border border-soft-fawn/40 text-soft-fawn text-xs px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-soft-fawn animate-pulse" />
              {activeAlertsCount} alerta{activeAlertsCount > 1 ? "s" : ""} activa{activeAlertsCount > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Próxima cita — leída desde blockchain */}
          <Card title="Próxima cita" icon="📅">
            {onChainLoading && !onChainAppt ? (
              <p className="text-xs text-porcelain/40">Consultando blockchain…</p>
            ) : onChainAppt ? (
              <div>
                <div className="text-sm font-medium text-porcelain mb-1">
                  Cita médica
                </div>
                <div className="text-xs text-porcelain/65 font-mono">
                  {formatDate(onChainAppt.fechaTimestamp)} · {formatTime(onChainAppt.fechaTimestamp)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                    onChainAppt.estado === 1
                      ? "bg-success/15 text-success border-success/30"
                      : "bg-porcelain/5 text-porcelain/60 border-mist"
                  }`}>
                    {APPOINTMENT_STATUS_LABEL[onChainAppt.estado] ?? "Pendiente"}
                  </span>
                  <span className="text-[10px] text-porcelain/35 font-mono">⛓ On-chain</span>
                </div>
              </div>
            ) : (
              <EmptySlot text="Sin citas próximas" />
            )}
          </Card>

          {/* Datos clínicos rápidos */}
          <Card title="Datos clínicos" icon="⚕">
            <div className="space-y-1.5">
              <DataRow
                label="Tipo de sangre"
                value={patient.bloodType ?? "No registrado"}
                highlight={!!patient.bloodType}
              />
              <DataRow
                label="Alergias"
                value={patient.allergiesCount > 0 ? `${patient.allergiesCount} registrada${patient.allergiesCount > 1 ? "s" : ""}` : "Ninguna"}
                highlight={patient.allergiesCount > 0}
              />
            </div>
          </Card>
        </div>

        {/* Historial reciente */}
        <Card title="Consultas recientes" icon="📋" fullWidth>
          {recentConsultations.length === 0 ? (
            <EmptySlot text="Sin consultas registradas" />
          ) : (
            <div className="space-y-2 mt-1">
              {recentConsultations.map((c) => (
                <div
                  key={c._id}
                  className="flex items-start justify-between py-2 border-b border-mist/60 last:border-0"
                >
                  <div>
                    <div className="text-xs text-porcelain/80 font-mono">
                      {formatDate(c.scheduledAt)}
                    </div>
                    {c.summary && (
                      <div className="text-xs text-porcelain/55 mt-0.5 line-clamp-1">
                        {c.summary}
                      </div>
                    )}
                  </div>
                  <StatusPill
                    status={c.status}
                    labels={CONSULT_STATUS_LABELS}
                    green="completed"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Canales de atención */}
        <Card title="Atención y comunicación" icon="◐" fullWidth>
          <p className="text-xs text-porcelain/55 mb-3">
            Habla con SEPH-AI directamente desde Discord. El asistente coordina y deriva al especialista adecuado.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <DiscordBotButton />
          </div>
          <p className="text-[10px] text-porcelain/35 mt-3 font-mono">
            SEPH-AI es un asistente de acompañamiento. No sustituye la consulta médica.
          </p>
        </Card>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Card({
  title,
  icon,
  children,
  fullWidth,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={`bg-graphite border border-mist rounded-lg p-4 ${
        fullWidth ? "sm:col-span-2" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-royal-azure text-sm">{icon}</span>
        <h2 className="text-[11px] uppercase tracking-wider text-porcelain/55 font-mono">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function DataRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-porcelain/50">{label}</span>
      <span className={highlight ? "text-porcelain/85 font-medium" : "text-porcelain/45"}>
        {value}
      </span>
    </div>
  );
}

function StatusPill({
  status,
  labels,
  green,
}: {
  status: string;
  labels: Record<string, string>;
  green: string;
}) {
  const isGreen = status === green;
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
        isGreen
          ? "bg-success/15 text-success border border-success/30"
          : "bg-porcelain/5 text-porcelain/60 border border-mist"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function EmptySlot({ text, action, href }: { text: string; action?: string; href?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-porcelain/40">{text}</span>
      {action && href && (
        <a
          href={href}
          className="text-[11px] text-royal-azure hover:underline"
        >
          {action}
        </a>
      )}
    </div>
  );
}
