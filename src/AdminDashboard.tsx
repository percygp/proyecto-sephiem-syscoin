import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type AdminTab = "panel" | "doctores" | "suscripciones" | "facturacion" | "auditoria" | "prg" | "pagos_tardios";

export function AdminDashboard() {
  const { logout, user } = usePrivy();
  const [activeTab, setActiveTab] = useState<AdminTab>("panel");
  const metrics = useQuery(api.admin.metrics.getAdminMetrics);
  const doctors = useQuery(api.admin.doctors.listDoctors);
  const subscriptions = useQuery(api.admin.subscriptions.listSubscriptions);
  const invoices = useQuery(api.admin.invoices.listInvoices);
  const auditLogs = useQuery(api.admin.audit.listAuditLogs, {});
  const prgChecks = useQuery(api.admin.prg.listPRGStatus);
  const prgStatus = useQuery(api.admin.prg.isProductionEnabled);

  return (
    <div className="h-screen flex flex-col bg-ink text-porcelain overflow-hidden">
      <AdminHeader activeTab={activeTab} onTabChange={setActiveTab} onLogout = {() => void logout()} />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === "panel" && <PanelTab metrics={metrics} />}
          {activeTab === "doctores" && <DoctoresTab doctors={doctors} />}
          {activeTab === "suscripciones" && <SuscripcionesTab subscriptions={subscriptions} />}
          {activeTab === "facturacion" && <FacturacionTab invoices={invoices} />}
          {activeTab === "auditoria" && <AuditoriaTab auditLogs={auditLogs} />}
          {activeTab === "prg" && <PRGTab checks={prgChecks} status={prgStatus} />}
          {activeTab === "pagos_tardios" && <LatePaymentsTab />}
        </main>
        <AdminSidebar user={user ? { email: user.email?.address } : undefined} metrics={metrics} />
      </div>
      <AdminFooter />
    </div>
  );
}

const TABS: { key: AdminTab; label: string }[] = [
  { key: "panel", label: "Panel" },
  { key: "prg", label: "PRG Gate" },
  { key: "doctores", label: "Médicos" },
  { key: "suscripciones", label: "Suscripciones" },
  { key: "facturacion", label: "Facturación" },
  { key: "auditoria", label: "Auditoría" },
  { key: "pagos_tardios", label: "Pagos tardíos" },
];

function LatePaymentsTab() {
  const appts = useQuery(api.appointments.queries.listLatePaymentAppointments, {});
  const handle = useMutation(api.appointments.booking.handleLatePayment);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(
    id: Id<"appointments">,
    decision: "reschedule" | "credit" | "reject",
  ) {
    setError(null);
    setBusy(id + decision);
    try {
      await handle({ appointmentId: id, decision });
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold mb-1">Pagos tardíos en revisión</h2>
      <p className="text-sm text-porcelain/50 mb-5">
        Citas con pago fuera del hold. Decide reagendar, emitir crédito o rechazar.
      </p>
      {error && (
        <div className="mb-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {appts === undefined ? (
        <p className="text-sm text-porcelain/40">Cargando…</p>
      ) : appts.length === 0 ? (
        <p className="text-sm text-porcelain/40">No hay pagos tardíos pendientes.</p>
      ) : (
        <div className="space-y-3">
          {appts.map((a) => (
            <div key={a._id} className="bg-graphite border border-mist rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.specialty}</div>
                  <div className="text-xs text-porcelain/50">
                    {new Date(a.startTime).toLocaleString("es")}
                    {a.amountPaidSYS ? ` · ${a.amountPaidSYS} SYS` : ""}
                    {a.txHashTruncated ? ` · tx ${a.txHashTruncated}` : ""}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busy !== null}
                  onClick={() => void act(a._id, "reschedule")}
                  className="text-xs px-3 py-1.5 rounded-lg border border-mist text-porcelain/80 hover:border-royal-azure/50 disabled:opacity-40"
                >
                  Aceptar y reagendar
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => { void act(a._id, "credit")}}
                  className="text-xs px-3 py-1.5 rounded-lg border border-soft-fawn/40 text-soft-fawn hover:bg-soft-fawn/10 disabled:opacity-40"
                >
                  Emitir crédito
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => void act(a._id, "reject")}
                  className="text-xs px-3 py-1.5 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminHeader({
  activeTab,
  onTabChange,
  onLogout,
}: {
  activeTab: AdminTab;
  onTabChange: (t: AdminTab) => void;
  onLogout: () => void;
}) {
  return (
    <header className="h-14 border-b border-mist bg-ink/80 backdrop-blur flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-soft-fawn flex items-center justify-center shadow-lg shadow-amber-500/20">
          <span className="text-porcelain font-bold">S</span>
        </div>
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-bold tracking-wide text-base">SEPHIEM</span>
            <span className="bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[9px] px-1.5 py-0.5 rounded font-mono">
              ADMIN
            </span>
          </div>
          <span className="text-porcelain/40 uppercase tracking-wider font-mono text-[9px]">
            Administración
          </span>
        </div>
      </div>
      <nav className="flex-1 flex items-center justify-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "text-porcelain/50 hover:text-porcelain hover:bg-graphite"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <button onClick={onLogout} className="text-xs text-porcelain/40 hover:text-soft-fawn transition-colors">
        Salir
      </button>
    </header>
  );
}

function AdminSidebar({
  user,
  metrics,
}: {
  user?: { email?: string };
  metrics?: {
    totalPatients: number;
    activePatients: number;
    totalDoctors: number;
    totalConsultations: number;
    consultationsThisMonth: number;
    monthlyRevenue: string;
    expiredSoon: number;
  };
}) {
  return (
    <aside className="w-72 border-l border-mist p-4 overflow-y-auto shrink-0 flex flex-col gap-4">
      <div className="bg-graphite rounded-xl p-4 border border-mist">
        <div className="text-[10px] uppercase tracking-widest text-porcelain/40 mb-3 font-mono">
          Admin
        </div>
        <div className="text-sm font-medium truncate">{user?.email ?? "Admin"}</div>
        <div className="text-[10px] text-porcelain/40 font-mono mt-1">Acceso completo</div>
      </div>
      <div className="bg-graphite rounded-xl p-4 border border-mist">
        <div className="text-[10px] uppercase tracking-widest text-porcelain/40 mb-3 font-mono">
          Resumen rápido
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-porcelain/60">Pacientes</span><span>{metrics?.totalPatients ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-porcelain/60">Activos</span><span className="text-success">{metrics?.activePatients ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-porcelain/60">Médicos</span><span>{metrics?.totalDoctors ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-porcelain/60">Consultas/mes</span><span>{metrics?.consultationsThisMonth ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-porcelain/60">Ingresos/mes</span><span>{metrics?.monthlyRevenue ? `${Number(metrics.monthlyRevenue).toFixed(4)} SYS` : "—"}</span></div>
          {metrics && metrics.expiredSoon > 0 && (
            <div className="flex justify-between text-soft-fawn">
              <span>Vencen pronto</span>
              <span>{metrics.expiredSoon}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function AdminFooter() {
  return (
    <footer className="h-7 border-t border-mist bg-ink/80 flex items-center px-4 shrink-0">
      <span className="text-[10px] text-porcelain/30 font-mono">
        Sephiem Admin · {new Date().toISOString().slice(0, 10)}
      </span>
    </footer>
  );
}

function PanelTab({
  metrics,
}: {
  metrics?: {
    totalPatients: number;
    activePatients: number;
    totalDoctors: number;
    totalConsultations: number;
    consultationsThisMonth: number;
    monthlyRevenue: string;
    patientsByMonth: Record<string, number>;
    revenueByMonth: Record<string, number>;
    expiredSoon: number;
  };
}) {
  if (!metrics) return <div className="text-porcelain/40 text-sm">Cargando métricas…</div>;
  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-lg font-bold">Panel de Control</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Pacientes totales" value={metrics.totalPatients} />
        <MetricCard label="Pacientes activos" value={metrics.activePatients} color="text-success" />
        <MetricCard label="Médicos" value={metrics.totalDoctors} />
        <MetricCard label="Consultas este mes" value={metrics.consultationsThisMonth} />
        <MetricCard label="Ingresos del mes" value={`${Number(metrics.monthlyRevenue).toFixed(4)} SYS`} />
        <MetricCard
          label="Vencen próximos 7d"
          value={metrics.expiredSoon}
          color={metrics.expiredSoon > 0 ? "text-soft-fawn" : undefined}
        />
        <MetricCard label="Consultas totales" value={metrics.totalConsultations} />
      </div>
      <div className="bg-graphite rounded-xl p-4 border border-mist">
        <div className="text-[10px] uppercase tracking-widest text-porcelain/40 mb-3 font-mono">
          Pacientes nuevos (últimos 6 meses)
        </div>
        <div className="flex items-end gap-2 h-24">
          {Object.entries(metrics.patientsByMonth).map(([month, count]) => {
            const max = Math.max(...Object.values(metrics.patientsByMonth), 1);
            const pct = (count / max) * 100;
            return (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-royal-azure rounded-t"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
                <span className="text-[9px] text-porcelain/40 font-mono">{month.slice(5)}</span>
                <span className="text-[9px] text-porcelain/60 font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-graphite rounded-xl p-4 border border-mist">
      <div className="text-[10px] uppercase tracking-widest text-porcelain/40 mb-1 font-mono">{label}</div>
      <div className={`text-2xl font-bold ${color ?? "text-porcelain"}`}>{value}</div>
    </div>
  );
}

function DoctoresTab({
  doctors,
}: {
  doctors?: {
    _id: Id<"doctors">;
    specialty: string;
    licenseNumber: string;
    bio?: string;
    maxPatients: number;
    profile: { name: string; email: string; phone?: string; avatarUrl?: string; isActive: boolean };
    patientCount: number;
  }[];
}) {
  if (!doctors) return <div className="text-porcelain/40 text-sm">Cargando médicos…</div>;
  return (
    <div className="max-w-4xl space-y-4">
      <h2 className="text-lg font-bold">Gestión de Médicos</h2>
      <div className="space-y-2">
        {doctors.length === 0 && (
          <div className="text-porcelain/40 text-sm py-8 text-center">No hay médicos registrados</div>
        )}
        {doctors.map((d) => (
          <div key={d._id} className="bg-graphite rounded-xl p-4 border border-mist flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-royal-azure to-ship-cove flex items-center justify-center text-sm font-bold shrink-0">
              {d.profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{d.profile.name}</div>
              <div className="text-xs text-porcelain/60 truncate">{d.specialty} · {d.profile.email}</div>
            </div>
            <div className="text-right text-xs shrink-0">
              <div className="text-porcelain/60">{d.patientCount} pacientes</div>
              <div className="text-porcelain/40">{d.licenseNumber}</div>
            </div>
            <div className={`text-[10px] px-2 py-0.5 rounded font-mono ${d.profile.isActive ? "bg-success/15 text-success" : "bg-soft-fawn/15 text-soft-fawn"}`}>
              {d.profile.isActive ? "Activo" : "Inactivo"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuscripcionesTab({
  subscriptions,
}: {
  subscriptions?: {
    patientId: Id<"patients">;
    profileName: string | null;
    profileEmail: string | null;
    profilePhone: string | null;
    subscriptionStatus: string;
    subscriptionExpiresAt?: number;
    doctorName: string | null;
    onboardingComplete: boolean;
  }[];
}) {
  if (!subscriptions) return <div className="text-porcelain/40 text-sm">Cargando suscripciones…</div>;
  return (
    <div className="max-w-4xl space-y-4">
      <h2 className="text-lg font-bold">Suscripciones</h2>
      <div className="space-y-2">
        {subscriptions.length === 0 && (
          <div className="text-porcelain/40 text-sm py-8 text-center">No hay pacientes registrados</div>
        )}
        
          {subscriptions.map((s) => {
            // eslint-disable-next-line react-hooks/purity
            const now = Date.now();
            const expired = s.subscriptionExpiresAt && s.subscriptionExpiresAt < now;
            const soon = s.subscriptionExpiresAt && !expired && s.subscriptionExpiresAt < now + 7 * 24 * 60 * 60 * 1000;
          return (
            <div key={s.patientId} className="bg-graphite rounded-xl p-4 border border-mist flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.profileName ?? "Sin nombre"}</div>
                <div className="text-xs text-porcelain/60 truncate">{s.profileEmail ?? "—"} · {s.doctorName ?? "Sin médico"}</div>
              </div>
              <div className="text-right text-xs shrink-0">
                <StatusPill status={s.subscriptionStatus} />
                {s.subscriptionExpiresAt && (
                  <div className={`mt-1 ${expired ? "text-soft-fawn" : soon ? "text-amber-400" : "text-porcelain/40"}`}>
                    {new Date(s.subscriptionExpiresAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-success/15 text-success",
    expired: "bg-soft-fawn/15 text-soft-fawn",
    suspended: "bg-amber-500/15 text-amber-400",
    pending_payment: "bg-royal-azure/15 text-royal-azure",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${colors[status] ?? "bg-porcelain/10 text-porcelain/60"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function FacturacionTab({
  invoices,
}: {
  invoices?: {
    _id: Id<"paymentInvoices">;
    invoiceCode: string;
    amountExpected: string;
    currency: string;
    status: string;
    expiresAt: number;
    subscriptionMonths: number;
    patientName: string | null;
    patientEmail: string | null;
    paymentsCount: number;
    confirmedPayments: number;
    totalReceived: string;
  }[];
}) {
  if (!invoices) return <div className="text-porcelain/40 text-sm">Cargando facturas…</div>;
  return (
    <div className="max-w-4xl space-y-4">
      <h2 className="text-lg font-bold">Facturación On-Chain</h2>
      <div className="space-y-2">
        {invoices.length === 0 && (
          <div className="text-porcelain/40 text-sm py-8 text-center">No hay facturas</div>
        )}
        {invoices.map((inv) => (
          <div key={inv._id} className="bg-graphite rounded-xl p-4 border border-mist">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{inv.invoiceCode}</div>
                <div className="text-xs text-porcelain/60">
                  {inv.patientName ?? "—"} · {inv.amountExpected} {inv.currency} · {inv.subscriptionMonths}m
                </div>
              </div>
              <div className="text-right text-xs shrink-0">
                <StatusPill status={inv.status} />
                <div className="mt-1 text-porcelain/40">
                  {inv.confirmedPayments}/{inv.paymentsCount} pagos
                </div>
              </div>
            </div>
            {inv.confirmedPayments > 0 && (
              <div className="mt-2 pt-2 border-t border-mist text-xs text-porcelain/40">
                Recibido: {inv.totalReceived} {inv.currency}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditoriaTab({
  auditLogs,
}: {
  auditLogs?: {
    _id: Id<"auditLogs">;
    _creationTime: number;
    actorType: string;
    actorName: string | null;
    action: string;
    targetId?: string;
    targetType?: string;
    channel: string;
    ipAddress?: string;
  }[];
}) {
  if (!auditLogs) return <div className="text-porcelain/40 text-sm">Cargando auditoría…</div>;
  return (
    <div className="max-w-4xl space-y-4">
      <h2 className="text-lg font-bold">Auditoría</h2>
      <div className="bg-graphite rounded-xl border border-mist overflow-hidden">
        {auditLogs.length === 0 ? (
          <div className="text-porcelain/40 text-sm py-8 text-center">Sin registros de auditoría</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-mist text-porcelain/40">
                  <th className="text-left p-3 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Actor</th>
                  <th className="text-left p-3 font-medium">Acción</th>
                  <th className="text-left p-3 font-medium">Canal</th>
                  <th className="text-left p-3 font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((l) => (
                  <tr key={l._id} className="border-b border-mist/50 hover:bg-ink/50">
                    <td className="p-3 text-porcelain/60 whitespace-nowrap">
                      {new Date(l._creationTime).toLocaleString()}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {l.actorName ?? l.actorType}
                    </td>
                    <td className="p-3 text-royal-azure whitespace-nowrap">{l.action}</td>
                    <td className="p-3 text-porcelain/40 whitespace-nowrap">{l.channel}</td>
                    <td className="p-3 text-porcelain/60 max-w-[200px] truncate">
                      {l.targetType ?? "—"}:{l.targetId?.slice(0, 12) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type PRGCheck = {
  _id: Id<"productionReadinessChecks">;
  _creationTime: number;
  checkKey: string;
  status: string;
  evidence?: string;
  approvedAt?: number;
  documentVersion?: string;
  notes?: string;
};

const CHECK_LABELS: Record<string, string> = {
  convex_dpa: "DPA Convex Cloud",
  privy_dpa: "DPA Privy",
  openai_dpa: "DPA OpenAI API",
  twilio_dpa: "DPA Twilio",
  hosting_dpa: "DPA VPS/Hosting",
  auth_spike_validated: "Auth Spike Validated",
  hd_wallet_setup: "HD Wallet Setup",
  vps_hardening: "VPS Hardening",
  hermes_clinical_approval: "Aprobación Clínica Hermes",
  hermes_redteam_complete: "Red-Team Hermes (50 casos)",
  legal_retention_review: "Revisión Legal Retención",
  incident_response_doc: "Procedimiento Incident Response",
  backup_restore_validated: "Backup & Restore Validado",
  wallet_sweep_sop: "SOP Custodia Cripto + Sweep",
};

const DOCUMENTARY_KEYS = new Set([
  "convex_dpa", "privy_dpa", "openai_dpa", "twilio_dpa", "hosting_dpa",
  "hermes_clinical_approval", "hermes_redteam_complete", "legal_retention_review",
  "incident_response_doc",
]);

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-soft-fawn/15 text-soft-fawn border-soft-fawn/30",
  in_progress: "bg-royal-azure/15 text-royal-azure border-royal-azure/30",
  expired: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pending: "bg-porcelain/10 text-porcelain/50 border-porcelain/20",
};

function PRGTab({
  checks,
  status,
}: {
  checks?: PRGCheck[];
  status?: { enabled: boolean; pendingChecks: number; totalChecks: number };
}) {
  const updatePRGCheck = useMutation(api.admin.prg.updatePRGCheck);
  const enableProduction = useMutation(api.admin.prg.enableProduction);
  const disableProduction = useMutation(api.admin.prg.disableProduction);
  const [editCheck, setEditCheck] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("pending");
  const [editEvidence, setEditEvidence] = useState("");
  const [editDocVersion, setEditDocVersion] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [showDisableModal, setShowDisableModal] = useState(false);

  if (!checks || !status) {
    return <div className="text-porcelain/40 text-sm">Cargando PRG…</div>;
  }

  const openEdit = (c: PRGCheck) => {
    setEditCheck(c.checkKey);
    setEditStatus(c.status);
    setEditEvidence(c.evidence ?? "");
    setEditDocVersion(c.documentVersion ?? "");
    setEditNotes(c.notes ?? "");
    setError(null);
  };

  const handleSave = async (checkKey: string) => {
    setSaving(checkKey);
    setError(null);
    try {
      await updatePRGCheck({
        checkKey: checkKey as any,
        status: editStatus as any,
        evidence: editEvidence.trim() || undefined,
        documentVersion: editDocVersion.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      setEditCheck(null);
    } catch (e: any) {
      setError(e.data?.message ?? e.message ?? "Error desconocido");
    } finally {
      setSaving(null);
    }
  };

  const handleEnable = async () => {
    setSaving("enable");
    setError(null);
    try {
      await enableProduction();
    } catch (e: any) {
      setError(e.data?.message ?? e.message ?? "Error al habilitar producción");
    } finally {
      setSaving(null);
    }
  };

  const handleDisable = async () => {
    if (!disableReason.trim()) return;
    setSaving("disable");
    setError(null);
    try {
      await disableProduction({ reason: disableReason.trim() });
      setShowDisableModal(false);
      setDisableReason("");
    } catch (e: any) {
      setError(e.data?.message ?? e.message ?? "Error al deshabilitar producción");
    } finally {
      setSaving(null);
    }
  };

  const approved = checks.filter((c) => c.status === "approved").length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Production Readiness Gate</h2>
        <div className="flex items-center gap-3">
          <div className={`text-xs px-3 py-1.5 rounded-lg font-mono border ${
            status.enabled
              ? "bg-success/15 text-success border-success/30"
              : "bg-amber-500/15 text-amber-400 border-amber-500/30"
          }`}>
            {status.enabled ? "PRODUCCIÓN ACTIVA" : "PRODUCCIÓN INACTIVA"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Checks totales" value={status.totalChecks} />
        <MetricCard label="Aprobados" value={approved} color="text-success" />
        <MetricCard label="Pendientes" value={status.pendingChecks} color={status.pendingChecks > 0 ? "text-soft-fawn" : "text-success"} />
        <MetricCard label="Gate habilitado" value={status.enabled ? "SÍ" : "NO"} color={status.enabled ? "text-success" : "text-soft-fawn"} />
      </div>

      {error && (
        <div className="bg-soft-fawn/10 border border-soft-fawn/30 rounded-xl p-3 text-sm text-soft-fawn">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {!status.enabled && (
          <button
            onClick={() => void handleEnable()}
            disabled={saving === "enable" || status.pendingChecks > 0}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors ${
              status.pendingChecks > 0
                ? "bg-porcelain/10 text-porcelain/30 cursor-not-allowed"
                : "bg-success text-ink hover:bg-success/90"
            }`}
          >
            {saving === "enable" ? "Habilitando…" : "Habilitar Producción"}
          </button>
        )}
        {status.enabled && (
          <button
            onClick={() => setShowDisableModal(true)}
            disabled={saving === "disable"}
            className="px-4 py-2 rounded-lg text-sm font-mono bg-soft-fawn text-ink hover:bg-soft-fawn/90 transition-colors"
          >
            Deshabilitar Producción
          </button>
        )}
      </div>

      <div className="bg-graphite rounded-xl border border-mist overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-mist text-porcelain/40">
                <th className="text-left p-3 font-medium">Check</th>
                <th className="text-left p-3 font-medium">Estado</th>
                <th className="text-left p-3 font-medium">Evidencia</th>
                <th className="text-left p-3 font-medium">Doc. Versión</th>
                <th className="text-left p-3 font-medium">Aprobado</th>
                <th className="text-left p-3 font-medium">Notas</th>
                <th className="text-right p-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c._id} className="border-b border-mist/50 hover:bg-ink/50">
                  {editCheck === c.checkKey ? (
                    <>
                      <td className="p-3 font-medium whitespace-nowrap">{CHECK_LABELS[c.checkKey] ?? c.checkKey}</td>
                      <td className="p-3">
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="bg-ink border border-mist rounded px-2 py-1 text-porcelain text-xs w-full"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <input
                          value={editEvidence}
                          onChange={(e) => setEditEvidence(e.target.value)}
                          placeholder="URL o descripción"
                          className="bg-ink border border-mist rounded px-2 py-1 text-porcelain text-xs w-full"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          value={editDocVersion}
                          onChange={(e) => setEditDocVersion(e.target.value)}
                          placeholder={DOCUMENTARY_KEYS.has(c.checkKey) ? "Requerido" : "Opcional"}
                          className="bg-ink border border-mist rounded px-2 py-1 text-porcelain text-xs w-full"
                        />
                      </td>
                      <td className="p-3 text-porcelain/60">
                        {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3">
                        <input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Notas opcionales"
                          className="bg-ink border border-mist rounded px-2 py-1 text-porcelain text-xs w-full"
                        />
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => void handleSave(c.checkKey)}
                          disabled={saving === c.checkKey}
                          className="text-success hover:text-success/80 mr-2"
                        >
                          {saving === c.checkKey ? "…" : "Guardar"}
                        </button>
                        <button
                          onClick={() => setEditCheck(null)}
                          className="text-porcelain/40 hover:text-porcelain"
                        >
                          Cancelar
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-medium whitespace-nowrap">{CHECK_LABELS[c.checkKey] ?? c.checkKey}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_COLORS[c.status] ?? ""}`}>
                          {c.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3 text-porcelain/60 max-w-[200px] truncate">{c.evidence ?? "—"}</td>
                      <td className="p-3 text-porcelain/60">{c.documentVersion ?? "—"}</td>
                      <td className="p-3 text-porcelain/60">
                        {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-porcelain/40 max-w-[150px] truncate">{c.notes ?? "—"}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => openEdit(c)}
                          className="text-royal-azure hover:text-royal-azure/80 text-[10px]"
                        >
                          Editar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showDisableModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-graphite rounded-xl p-6 border border-mist max-w-md w-full mx-4 space-y-4">
            <h3 className="font-bold">Deshabilitar Producción</h3>
            <p className="text-sm text-porcelain/60">Razón obligatoria para deshabilitar:</p>
            <textarea
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              className="w-full bg-ink border border-mist rounded-lg p-3 text-sm text-porcelain resize-none h-24"
              placeholder="Especifica la razón…"
              maxLength={500}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowDisableModal(false); setDisableReason(""); }}
                className="px-4 py-2 rounded-lg text-sm text-porcelain/60 hover:text-porcelain"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDisable()}
                disabled={!disableReason.trim() || saving === "disable"}
                className="px-4 py-2 rounded-lg text-sm bg-soft-fawn text-ink disabled:opacity-50"
              >
                {saving === "disable" ? "Deshabilitando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
