/**
 * A10 — Dashboard del médico
 *
 * Layout 3 columnas (mismo shell del paciente):
 *  - Izq: lista de pacientes asignados (listMyPatients)
 *  - Centro: detalle del paciente seleccionado (getPatientDetail) +
 *            formularios rápidos de createConsultation / createTreatment /
 *            updateConsultationNotes
 *  - Der: card del propio doctor + estadísticas
 *
 * Paleta Sephiem. Datos reales del backend.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ChatPanel } from "./ChatPanel";
import { NotificationsBell } from "./NotificationsBell";

export function DoctorDashboard() {
  const { logout } = usePrivy();
  const doctor = useQuery(api.doctors.queries.getMyDoctor);
  const patients = useQuery(api.doctors.queries.listMyPatients);
  const [selectedPatientId, setSelectedPatientId] = useState<Id<"patients"> | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-ink text-porcelain overflow-hidden">
      <DoctorHeader
        doctor={doctor}
        onLogout={() => void logout()}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
      />
      <div className="flex-1 flex overflow-hidden">
        <PatientsSidebar
          patients={patients}
          selectedId={selectedPatientId}
          onSelect={(id) => { setSelectedPatientId(id); setLeftOpen(false); }}
          open={leftOpen}
          onClose={() => setLeftOpen(false)}
        />
        <PatientDetailPanel patientId={selectedPatientId} />
        <DoctorInfoSidebar
          doctor={doctor}
          patientsCount={patients?.length ?? 0}
          open={rightOpen}
          onClose={() => setRightOpen(false)}
        />
        {(leftOpen || rightOpen) && (
          <div
            onClick={() => { setLeftOpen(false); setRightOpen(false); }}
            className="fixed inset-x-0 top-14 bottom-0 z-30 bg-black/50 lg:hidden"
            aria-hidden="true"
          />
        )}
      </div>
      <DoctorFooter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function DoctorHeader({
  doctor,
  onLogout,
  onToggleLeft,
  onToggleRight,
}: {
  doctor: ReturnType<typeof useQuery<typeof api.doctors.queries.getMyDoctor>>;
  onLogout: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  return (
    <header className="h-14 border-b border-mist bg-ink/80 backdrop-blur flex items-center px-4 gap-3 sm:gap-4 shrink-0">
      <button
        onClick={onToggleLeft}
        aria-label="Abrir pacientes"
        className="lg:hidden shrink-0 -ml-2 w-11 h-11 flex items-center justify-center text-lg text-porcelain/70 hover:text-porcelain"
      >
        ☰
      </button>
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-royal-azure to-ship-cove flex items-center justify-center shadow-lg shadow-royal-azure/20">
          <span className="text-porcelain font-bold">S</span>
        </div>
        <div className="hidden sm:flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-bold tracking-wide text-base">SEPHIEM</span>
            <span className="bg-royal-azure/15 border border-royal-azure/40 text-royal-azure text-[9px] px-1.5 py-0.5 rounded font-mono">
              MEDIC
            </span>
          </div>
          <span className="text-porcelain/40 uppercase tracking-wider font-mono text-[9px]">
            Vista Médico
          </span>
        </div>
      </div>

      <div className="flex-1 hidden md:flex items-center justify-center text-sm text-porcelain/70 min-w-0">
        {doctor ? (
          <>
            <span className="truncate">{doctor.profile.name}</span>
            <span className="mx-2 text-porcelain/30">·</span>
            <span className="text-soft-fawn">{doctor.specialty}</span>
            <span className="mx-2 text-porcelain/30">·</span>
            <span className="font-mono text-xs">{doctor.licenseNumber}</span>
          </>
        ) : (
          <span className="text-porcelain/40 text-xs">Cargando…</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
        <NotificationsBell />
        <button
          onClick={() => void onLogout()}
          className="text-xs px-3 py-1.5 rounded-md border border-mist hover:border-porcelain/30 transition-colors"
        >
          Cerrar sesión
        </button>
        <button
          onClick={onToggleRight}
          aria-label="Abrir mi perfil médico"
          className="lg:hidden shrink-0 -mr-2 w-11 h-11 flex items-center justify-center text-base text-porcelain/70 hover:text-porcelain"
        >
          ⊞
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar: lista de pacientes
// ─────────────────────────────────────────────────────────────────────────────

function PatientsSidebar({
  patients,
  selectedId,
  onSelect,
  open,
  onClose,
}: {
  patients: ReturnType<typeof useQuery<typeof api.doctors.queries.listMyPatients>>;
  selectedId: Id<"patients"> | null;
  onSelect: (id: Id<"patients">) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`fixed top-14 bottom-0 left-0 z-40 w-72 max-w-[85%] border-r border-mist bg-graphite flex flex-col overflow-hidden transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:bg-graphite/40 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <AlertsSection onSelectPatient={onSelect} />

      <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono">
          Pacientes Asignados
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-porcelain/50 font-mono">
            {patients?.length ?? "…"}
          </span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="lg:hidden text-porcelain/50 hover:text-porcelain text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {patients === undefined && (
          <p className="text-xs text-porcelain/40 text-center mt-6">Cargando…</p>
        )}
        {patients && patients.length === 0 && (
          <p className="text-xs text-porcelain/40 text-center mt-6 leading-relaxed px-3">
            No tienes pacientes asignados todavía.
          </p>
        )}
        {patients?.map((p) => (
          <button
            key={p._id}
            onClick={() => onSelect(p._id)}
            className={`w-full text-left rounded-md p-3 mb-1 transition-colors ${
              selectedId === p._id
                ? "bg-royal-azure/15 border border-royal-azure/40"
                : "border border-transparent hover:bg-slate"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">
                {p.profile.name || "(sin nombre)"}
              </span>
              <StatusPill status={p.subscriptionStatus} />
            </div>
            <p className="text-[11px] text-porcelain/50 truncate mt-0.5">
              {p.profile.email}
            </p>
            <p className="text-[10px] text-porcelain/35 font-mono mt-0.5">
              DOB: {p.dateOfBirth}
              {p.bloodType ? ` · ${p.bloodType}` : ""}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}

function AlertsSection({
  onSelectPatient,
}: {
  onSelectPatient: (id: Id<"patients">) => void;
}) {
  const openAlerts = useQuery(api.doctors.medicalAlerts.listMyAlerts, {
    onlyOpen: true,
  });
  const ack = useMutation(api.doctors.medicalAlerts.acknowledgeAlert);
  const resolve = useMutation(api.doctors.medicalAlerts.resolveAlert);

  if (!openAlerts || openAlerts.length === 0) return null;

  return (
    <div className="border-b border-mist bg-soft-fawn/5">
      <div className="px-4 py-3 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-soft-fawn font-mono">
          ⚠ Alertas activas
        </h2>
        <span className="text-[10px] text-soft-fawn font-mono">
          {openAlerts.length}
        </span>
      </div>
      <div className="px-2 pb-2 flex flex-col gap-1 max-h-44 overflow-y-auto">
        {openAlerts.map((a) => (
          <div
            key={a._id}
            className={`rounded-md p-2 border text-xs ${
              a.severity === "critical"
                ? "border-soft-fawn/70 bg-soft-fawn/10"
                : "border-mist bg-graphite"
            }`}
          >
            <button
              onClick={() => onSelectPatient(a.patientId)}
              className="font-medium text-porcelain hover:text-royal-azure text-left block w-full truncate"
            >
              {a.patientName}
            </button>
            <p className="text-[10px] text-porcelain/55 font-mono mt-0.5">
              {a.severity.toUpperCase()} · {a.alertCategory} · {a.alertCode}
            </p>
            <div className="flex gap-1 mt-1.5">
              <button
                onClick={() => void ack({ alertId: a._id })}
                className="text-[10px] px-2 py-0.5 rounded border border-mist hover:bg-slate"
                title="Reconocer"
              >
                ✓ Ack
              </button>
              <button
                onClick={() => void resolve({ alertId: a._id })}
                className="text-[10px] px-2 py-0.5 rounded border border-success/40 text-success hover:bg-success/10"
                title="Resolver"
              >
                ✓✓ Resolver
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    pending_payment: "bg-soft-fawn/15 text-soft-fawn border-soft-fawn/30",
    expired: "bg-mist text-porcelain/50 border-mist",
    suspended: "bg-mist text-porcelain/50 border-mist",
  };
  const labels: Record<string, string> = {
    active: "Activo",
    pending_payment: "Pago pendiente",
    expired: "Vencido",
    suspended: "Suspendido",
  };
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
        styles[status] ?? "bg-mist text-porcelain/50 border-mist"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: detalle del paciente seleccionado
// ─────────────────────────────────────────────────────────────────────────────

function PatientDetailPanel({
  patientId,
}: {
  patientId: Id<"patients"> | null;
}) {
  if (!patientId) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center text-center bg-ink">
        <div className="w-16 h-16 rounded-2xl bg-graphite border border-mist flex items-center justify-center text-porcelain/60 text-2xl mb-3">
          👥
        </div>
        <p className="text-sm text-porcelain/55">
          Selecciona un paciente para ver su historial
        </p>
      </main>
    );
  }
  return <PatientDetail patientId={patientId} />;
}

function PatientDetail({ patientId }: { patientId: Id<"patients"> }) {
  const detail = useQuery(api.doctors.queries.getPatientDetail, { patientId });
  const myDoctor = useQuery(api.doctors.queries.getMyDoctor);
  const allConversations = useQuery(
    api.messages.conversations.listMyConversations,
  );
  const logAccess = useMutation(
    api.doctors.auditAccess.logPatientRecordAccess,
  );
  const [tab, setTab] = useState<"expediente" | "chat">("expediente");

  // A12: registrar audit PATIENT_RECORD_READ_FULL al abrir expediente.
  // Cada cambio de paciente o cada vez que el tab vuelve a "expediente"
  // dispara un nuevo audit. Decisión deliberada: medir lecturas reales.
  useEffect(() => {
    if (tab !== "expediente") return;
    void logAccess({ patientId });
  }, [patientId, tab, logAccess]);

  if (detail === undefined) {
    return (
      <main className="flex-1 flex items-center justify-center bg-ink">
        <span className="text-xs text-porcelain/40">Cargando expediente…</span>
      </main>
    );
  }

  // Resolver conversación doctor_patient con este paciente
  const conversation = allConversations?.find(
    (c) => c.patientId === patientId && c.type === "doctor_patient",
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-ink">
      {/* Cabecera */}
      <div className="px-6 py-4 border-b border-mist">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-semibold">
            {detail.patient.profile.name}
            {detail.patient.isFictional && (
              <span className="ml-2 text-[10px] text-soft-fawn font-mono">
                · DATO FICTICIO
              </span>
            )}
          </h1>
          <StatusPill status={detail.patient.subscriptionStatus} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-porcelain/60">
          <span className="break-all">📧 {detail.patient.profile.email}</span>
          {detail.patient.profile.phone && (
            <span className="font-mono">📞 {detail.patient.profile.phone}</span>
          )}
          <span>🎂 {detail.patient.dateOfBirth}</span>
          {detail.patient.bloodType && (
            <span>🩸 {detail.patient.bloodType}</span>
          )}
        </div>
        {detail.patient.allergies && detail.patient.allergies.length > 0 && (
          <p className="text-[11px] text-soft-fawn mt-1">
            ⚠ Alergias: {detail.patient.allergies.join(", ")}
          </p>
        )}

        {/* Tabs Expediente / Chat */}
        <div className="flex gap-1 mt-3">
          <SubTab
            label="Expediente"
            icon="📋"
            active={tab === "expediente"}
            onClick={() => setTab("expediente")}
          />
          <SubTab
            label="Chat"
            icon="💬"
            active={tab === "chat"}
            onClick={() => setTab("chat")}
          />
        </div>
      </div>

      {tab === "chat" ? (
        <div className="flex-1 overflow-hidden">
          {conversation && myDoctor ? (
            <ChatPanel
              conversationId={conversation._id}
              title={`Chat con ${detail.patient.profile.name}`}
              subtitle="Hilo doctor-paciente · cifrado"
              avatarChar="P"
              myProfileId={myDoctor.profileId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <p className="text-xs text-porcelain/45 max-w-sm">
                El paciente aún no ha abierto el hilo de chat contigo. Aparecerá
                aquí cuando lo haga desde su portal.
              </p>
            </div>
          )}
        </div>
      ) : (
      /* Expediente: 2 columnas */
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Consultas */}
        <Section title="Consultas">
          {detail.consultations.length === 0 ? (
            <Empty>Sin consultas registradas</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {detail.consultations.map((c) => (
                <Card key={c._id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-porcelain/60">
                      {new Date(c.scheduledAt).toLocaleString()}
                    </span>
                    <StatusPill status={c.status} />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-porcelain/40 font-mono mb-1">
                    Canal: {c.channel}
                  </p>
                  {c.summary && (
                    <p className="text-xs text-porcelain/80 mt-1">{c.summary}</p>
                  )}
                  {c.doctorNotes && (
                    <div className="mt-2 p-2 bg-ink rounded border border-mist/60">
                      <p className="text-[9px] uppercase tracking-wider text-porcelain/40 font-mono mb-1">
                        Notas privadas
                      </p>
                      <p className="text-[11px] text-porcelain/75">
                        {c.doctorNotes}
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          <NewConsultationForm patientId={patientId} />
        </Section>

        {/* Tratamientos */}
        <Section title="Tratamientos">
          {detail.treatments.length === 0 ? (
            <Empty>Sin tratamientos activos</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {detail.treatments.map((t) => (
                <Card key={t._id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{t.diagnosis}</span>
                    <StatusPill status={t.status} />
                  </div>
                  <p className="text-[10px] text-porcelain/45 font-mono">
                    {t.startDate}
                    {t.endDate ? ` → ${t.endDate}` : ""}
                  </p>
                  {t.description && (
                    <p className="text-xs text-porcelain/75 mt-1">
                      {t.description}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
          <NewTreatmentForm patientId={patientId} />

          {/* Medicaciones activas */}
          {detail.activeMedications.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono mb-2">
                Medicación activa
              </h4>
              <div className="flex flex-col gap-1">
                {detail.activeMedications.map((m) => (
                  <div
                    key={m._id}
                    className="text-xs bg-graphite border border-mist rounded px-3 py-2"
                  >
                    <span className="font-medium">{m.name}</span>{" "}
                    <span className="text-porcelain/60">
                      · {m.dosage} · {m.frequency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      </div>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SubTab — tabs internas dentro del PatientDetail
// ─────────────────────────────────────────────────────────────────────────────

function SubTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${
        active
          ? "bg-royal-azure/15 text-porcelain border border-royal-azure/40"
          : "text-porcelain/55 hover:text-porcelain hover:bg-slate/50 border border-transparent"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Forms inline
// ─────────────────────────────────────────────────────────────────────────────

function NewConsultationForm({ patientId }: { patientId: Id<"patients"> }) {
  const createConsultation = useMutation(api.doctors.consultations.createConsultation);
  const [scheduledAt, setScheduledAt] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ts = new Date(scheduledAt).getTime();
      if (Number.isNaN(ts)) {
        setError("Fecha inválida");
        setBusy(false);
        return;
      }
      await createConsultation({
        patientId,
        scheduledAt: ts,
        channel: "web",
        summary: summary || undefined,
      });
      setScheduledAt("");
      setSummary("");
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e)=> { void handleSubmit(e); }} className="mt-3 p-3 border border-mist rounded bg-graphite/50">
      <p className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-2">
        ➕ Nueva consulta
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          required
          className="bg-ink border border-mist rounded px-2 py-1.5 text-xs"
        />
        <input
          type="text"
          placeholder="Resumen breve (opcional)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="bg-ink border border-mist rounded px-2 py-1.5 text-xs"
        />
        {error && <p className="text-[10px] text-soft-fawn font-mono">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-royal-azure hover:bg-royal-azure/90 disabled:bg-royal-azure/40 text-porcelain text-xs py-1.5 rounded-md"
        >
          {busy ? "Agendando…" : "Agendar"}
        </button>
      </div>
    </form>
  );
}

function NewTreatmentForm({ patientId }: { patientId: Id<"patients"> }) {
  const createTreatment = useMutation(api.doctors.treatments.createTreatment);
  const [diagnosis, setDiagnosis] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createTreatment({
        patientId,
        diagnosis,
        description: description || undefined,
        startDate,
      });
      setDiagnosis("");
      setDescription("");
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e)=> { void handleSubmit(e); }} className="mt-3 p-3 border border-mist rounded bg-graphite/50">
      <p className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-2">
        ➕ Nuevo tratamiento
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Diagnóstico *"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          required
          className="bg-ink border border-mist rounded px-2 py-1.5 text-xs"
        />
        <input
          type="text"
          placeholder="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-ink border border-mist rounded px-2 py-1.5 text-xs"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-ink border border-mist rounded px-2 py-1.5 text-xs"
        />
        {error && <p className="text-[10px] text-soft-fawn font-mono">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-royal-azure hover:bg-royal-azure/90 disabled:bg-royal-azure/40 text-porcelain text-xs py-1.5 rounded-md"
        >
          {busy ? "Creando…" : "Crear tratamiento"}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right sidebar: info del doctor
// ─────────────────────────────────────────────────────────────────────────────

function DoctorInfoSidebar({
  doctor,
  patientsCount,
  open,
  onClose,
}: {
  doctor: ReturnType<typeof useQuery<typeof api.doctors.queries.getMyDoctor>>;
  patientsCount: number;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`fixed top-14 bottom-0 right-0 z-40 w-72 max-w-[85%] border-l border-mist bg-graphite flex flex-col overflow-hidden transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:bg-graphite/40 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono">
          Mi Perfil Médico
        </h2>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="lg:hidden text-porcelain/50 hover:text-porcelain text-sm"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {doctor && (
          <>
            <div className="border border-mist rounded-lg p-3 bg-graphite">
              <div className="flex items-center gap-1.5 text-xs mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                <span className="text-porcelain/90 font-medium">Activo</span>
              </div>
              <p className="text-sm font-semibold">{doctor.profile.name}</p>
              <p className="text-xs text-porcelain/60 mt-0.5">{doctor.specialty}</p>
              <p className="text-[10px] text-porcelain/40 font-mono mt-2">
                Licencia: {doctor.licenseNumber}
              </p>
            </div>

            <div className="border border-mist rounded-lg p-3 bg-graphite">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Pacientes" value={String(patientsCount)} />
                <Metric label="Cupo" value={String(doctor.maxPatients)} />
              </div>
            </div>

            {doctor.bio && (
              <div className="border border-mist rounded-lg p-3 bg-graphite">
                <h3 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono mb-2">
                  Bio
                </h3>
                <p className="text-xs text-porcelain/70 leading-relaxed">
                  {doctor.bio}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-mist rounded-md px-2 py-1.5 bg-ink">
      <div className="text-[9px] uppercase tracking-wider text-porcelain/45 font-mono">
        {label}
      </div>
      <div className="text-base font-mono mt-0.5">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces compartidas
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-porcelain/55 font-mono mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-mist rounded-md p-3 bg-graphite">{children}</div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-porcelain/40 text-center py-4">{children}</p>
  );
}

function DoctorFooter() {
  return (
    <footer className="h-7 border-t border-mist bg-ink flex items-center justify-between px-4 text-[10px] font-mono text-porcelain/45">
      <span>SEPHIEM v0.10.0 · Vista médico</span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        Sincronizado
      </span>
    </footer>
  );
}
