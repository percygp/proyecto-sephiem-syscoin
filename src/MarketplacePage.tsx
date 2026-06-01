/**
 * B9 (VAL-53) + B14 (VAL-58) — Marketplace + Agendamiento (paciente)
 *
 * - Lista/detalle de especialistas verificados (sin walletAddress).
 * - Flujo de reserva: slot → createAppointmentHold → pantalla de pago (dirección,
 *   monto, timer 15 min) → resultado reactivo (confirmada / pago tardío en
 *   revisión / expirada) vía useQuery (Convex realtime, sin polling manual).
 * - "Mis citas": historial con status legibles + botón Completar.
 *
 * Reglas: NUNCA walletAddress; txHash siempre truncado.
 */
import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery, useAction, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type ApptStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "expired"
  | "pending_payment_late"
  | "pending_reschedule"
  | "credit_issued";

const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: "Pendiente de pago",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  expired: "Expirada",
  pending_payment_late: "Pago tardío en revisión",
  pending_reschedule: "Reagendamiento pendiente",
  credit_issued: "Crédito emitido",
};

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("es", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null)
    return <span className="text-xs text-porcelain/40">Sin reseñas aún</span>;
  const full = Math.round(rating);
  return (
    <span className="text-soft-fawn text-sm" title={`${rating.toFixed(1)} / 5`}>
      {"★".repeat(full)}
      <span className="text-mist">{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-royal-azure/15 text-royal-azure border border-royal-azure/30">
      ✓ Verificado
    </span>
  );
}

export function MarketplacePage() {
  const [view, setView] = useState<"especialistas" | "citas">("especialistas");
  const [selectedId, setSelectedId] =
    useState<Id<"marketplaceSpecialists"> | null>(null);

  if (selectedId) {
    return (
      <SpecialistDetail
        specialistId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <TabButton active={view === "especialistas"} onClick={() => setView("especialistas")}>
            Especialistas
          </TabButton>
          <TabButton active={view === "citas"} onClick={() => setView("citas")}>
            Mis citas
          </TabButton>
        </div>
        {view === "especialistas" ? (
          <SpecialistsList onSelect={setSelectedId} />
        ) : (
          <AppointmentsHistory />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-sm px-3 py-1.5 rounded-lg border transition-colors " +
        (active
          ? "bg-royal-azure/15 text-royal-azure border-royal-azure/40"
          : "text-porcelain/60 border-mist hover:border-royal-azure/40")
      }
    >
      {children}
    </button>
  );
}

function SpecialistsList({
  onSelect,
}: {
  onSelect: (id: Id<"marketplaceSpecialists">) => void;
}) {
  const [specialty, setSpecialty] = useState("");
  const [maxFee, setMaxFee] = useState("");

  const args: { specialty?: string; maxFee?: number } = {};
  if (specialty.trim()) args.specialty = specialty.trim();
  const feeNum = parseFloat(maxFee);
  if (maxFee.trim() && Number.isFinite(feeNum)) args.maxFee = feeNum;

  const { results, status, loadMore } = usePaginatedQuery(
    api.marketplace.specialists.getSpecialists,
    args,
    { initialNumItems: 12 },
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          placeholder="Especialidad (ej: Cardiología)"
          className="flex-1 bg-slate border border-mist rounded-lg px-3 py-2 text-sm text-porcelain placeholder:text-porcelain/30 focus:outline-none focus:border-royal-azure"
        />
        <input
          value={maxFee}
          onChange={(e) => setMaxFee(e.target.value)}
          inputMode="decimal"
          placeholder="Fee máx (SYS)"
          className="sm:w-40 bg-slate border border-mist rounded-lg px-3 py-2 text-sm text-porcelain placeholder:text-porcelain/30 focus:outline-none focus:border-royal-azure"
        />
      </div>

      {results.length === 0 && status !== "LoadingFirstPage" ? (
        <div className="text-center text-porcelain/40 py-16 text-sm">
          No hay especialistas que coincidan con los filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((s) => (
            <button
              key={s._id}
              onClick={() => onSelect(s._id)}
              className="text-left bg-graphite border border-mist rounded-xl p-4 hover:border-royal-azure/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{s.specialty}</span>
                <VerifiedBadge />
              </div>
              <Stars rating={s.rating} />
              <div className="mt-3 text-sm text-porcelain/70">
                <span className="text-soft-fawn font-semibold">
                  {s.consultationFeeSYS} SYS
                </span>
                <span className="text-porcelain/40"> / consulta</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {status === "CanLoadMore" && (
        <div className="text-center mt-6">
          <button
            onClick={() => loadMore(12)}
            className="text-sm px-4 py-2 rounded-lg border border-mist text-porcelain/70 hover:border-royal-azure/50"
          >
            Cargar más
          </button>
        </div>
      )}
      {status === "LoadingFirstPage" && (
        <div className="text-center text-porcelain/40 py-16 text-sm">
          Cargando especialistas…
        </div>
      )}
    </>
  );
}

function SpecialistDetail({
  specialistId,
  onBack,
}: {
  specialistId: Id<"marketplaceSpecialists">;
  onBack: () => void;
}) {
  const detail = useQuery(api.marketplace.specialists.getSpecialistDetail, {
    specialistId,
  });
  const slots = useQuery(api.appointments.queries.getAvailableSlots, {
    specialistId,
  });
  const createHold = useAction(api.appointments.booking.createAppointmentHold);

  const [booking, setBooking] = useState<{
    appointmentId: Id<"appointments">;
    derivedAddress: string;
    amountExpected: string;
    startedAt: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (booking) {
    return (
      <PaymentScreen
        appointmentId={booking.appointmentId}
        derivedAddress={booking.derivedAddress}
        amountExpected={booking.amountExpected}
        startedAt={booking.startedAt}
        onDone={onBack}
      />
    );
  }

  async function reserve(slotId: Id<"appointmentSlots">) {
    setError(null);
    setBusy(true);
    try {
      const r = await createHold({ slotId });
      setBooking({
        appointmentId: r.appointmentId,
        derivedAddress: r.derivedAddress,
        amountExpected: r.amountExpected,
        // eslint-disable-next-line react-hooks/purity
        startedAt: Date.now(),
      });
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="text-sm text-porcelain/60 hover:text-porcelain mb-4"
        >
          ← Volver al marketplace
        </button>

        {detail === undefined && (
          <div className="text-porcelain/40 text-sm py-16 text-center">Cargando detalle…</div>
        )}
        {detail === null && (
          <div className="text-porcelain/40 text-sm py-16 text-center">Especialista no disponible.</div>
        )}
        {detail && (
          <div className="bg-graphite border border-mist rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">{detail.name || "Especialista"}</h1>
                <p className="text-porcelain/60">{detail.specialty}</p>
              </div>
              <VerifiedBadge />
            </div>
            <div className="mt-4">
              <Stars rating={detail.rating} />
            </div>
            <dl className="grid grid-cols-2 gap-3 mt-5 text-sm">
              <Field label="Licencia" value={detail.licenseNumber} />
              <Field label="Jurisdicción" value={detail.jurisdiction} />
              <Field
                label="Experiencia"
                value={detail.yearsOfExperience !== undefined ? `${detail.yearsOfExperience} años` : "—"}
              />
              <Field label="Fee" value={`${detail.consultationFeeSYS} SYS`} />
              <Field label="Wallet" value={detail.walletVerified ? "Verificada ✓" : "No verificada"} />
            </dl>
            {detail.description && (
              <p className="mt-5 text-sm text-porcelain/70 leading-relaxed">{detail.description}</p>
            )}

            {/* Disponibilidad */}
            <h2 className="text-sm font-semibold mt-6 mb-2 text-porcelain/80">
              Horarios disponibles
            </h2>
            {error && (
              <div className="mb-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {slots === undefined ? (
              <p className="text-sm text-porcelain/40">Cargando horarios…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-porcelain/40">
                No hay horarios disponibles por ahora.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map((s) => (
                  <button
                    key={s._id}
                    disabled={busy}
                    onClick={() => void reserve(s._id)}
                    className="text-xs px-2 py-2 rounded-lg border border-mist hover:border-royal-azure/60 text-porcelain/80 disabled:opacity-40"
                  >
                    {fmtDateTime(s.startTime)}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-porcelain/40 mt-2">
              Al reservar tienes 15 min para pagar en SYS antes de que el horario se libere.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentScreen({
  appointmentId,
  derivedAddress,
  amountExpected,
  startedAt,
  onDone,
}: {
  appointmentId: Id<"appointments">;
  derivedAddress: string;
  amountExpected: string;
  startedAt: number;
  onDone: () => void;
}) {
  const appt = useQuery(api.appointments.queries.getAppointmentById, {
    appointmentId,
  });
  const [remaining, setRemaining] = useState(15 * 60);

  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, 15 * 60 - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(left);
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const status = appt?.status;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  let banner: { tone: string; text: string } | null = null;
  if (status === "confirmed") banner = { tone: "success", text: "🎉 ¡Cita confirmada!" };
  else if (status === "pending_payment_late")
    banner = { tone: "warning", text: "⏳ Pago recibido, en revisión. Te notificaremos cuando se confirme." };
  else if (status === "expired" || (remaining === 0 && status === "pending"))
    banner = { tone: "danger", text: "❌ Tiempo de reserva agotado. Puedes intentar de nuevo." };

  const toneClass =
    banner?.tone === "success"
      ? "bg-success/10 border-success/40 text-success"
      : banner?.tone === "warning"
        ? "bg-warning/10 border-warning/40 text-warning"
        : "bg-danger/10 border-danger/40 text-danger";

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-1">Pago de la cita</h1>
        <p className="text-sm text-porcelain/50 mb-4">Red: Syscoin (testnet)</p>

        {banner ? (
          <div className={"rounded-xl border px-4 py-4 text-sm " + toneClass}>{banner.text}</div>
        ) : (
          <div className="bg-graphite border border-mist rounded-xl p-5">
            <div className="text-center mb-4">
              <div className="text-3xl font-mono text-soft-fawn">{mm}:{ss}</div>
              <div className="text-xs text-porcelain/40">tiempo restante del hold</div>
            </div>
            <Field label="Monto" value={`${amountExpected} SYS`} />
            <div className="mt-3">
              <dt className="text-porcelain/40 text-xs uppercase tracking-wide">Dirección de pago</dt>
              <dd className="text-porcelain/90 mt-0.5 font-mono text-xs break-all bg-slate rounded-lg px-2 py-2 border border-mist">
                {derivedAddress}
              </dd>
            </div>
            <p className="text-xs text-porcelain/50 mt-4">
              {status === "pending"
                ? "Esperando el pago on-chain… esta pantalla se actualiza sola."
                : "Verificando…"}
            </p>
          </div>
        )}

        <button
          onClick={onDone}
          className="mt-6 w-full border border-mist text-porcelain/70 hover:border-royal-azure/50 font-medium px-6 py-2.5 rounded-lg"
        >
          {banner ? "Volver" : "Pagar más tarde / cerrar"}
        </button>
      </div>
    </div>
  );
}

function AppointmentsHistory() {
  const appts = useQuery(api.appointments.queries.getMyAppointments, {});
  const complete = useMutation(api.appointments.booking.completeAppointment);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onComplete(id: Id<"appointments">) {
    setError(null);
    setBusyId(id);
    try {
      await complete({ appointmentId: id });
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (appts === undefined)
    return <div className="text-porcelain/40 text-sm py-16 text-center">Cargando citas…</div>;
  if (appts.length === 0)
    return <div className="text-porcelain/40 text-sm py-16 text-center">Aún no tienes citas.</div>;

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {appts.map((a) => (
        <div key={a._id} className="bg-graphite border border-mist rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{a.specialty}</div>
              <div className="text-xs text-porcelain/50">{fmtDateTime(a.startTime)}</div>
            </div>
            <StatusPill status={a.status} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-porcelain/60">
            <span>
              {a.amountPaidSYS ? `${a.amountPaidSYS} SYS` : "—"}
              {a.txHashTruncated ? ` · tx ${a.txHashTruncated}` : ""}
            </span>
            {a.status === "confirmed" && (
              <button
                disabled={busyId === a._id}
                onClick={() => void onComplete(a._id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-royal-azure/15 text-royal-azure border border-royal-azure/40 hover:bg-royal-azure/25 disabled:opacity-40"
              >
                {busyId === a._id ? "…" : "Completar cita"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: ApptStatus }) {
  const tone =
    status === "confirmed" || status === "completed"
      ? "bg-success/10 text-success border-success/30"
      : status === "pending_payment_late" || status === "pending_reschedule"
        ? "bg-warning/10 text-warning border-warning/30"
        : status === "cancelled" || status === "expired"
          ? "bg-danger/10 text-danger border-danger/30"
          : "bg-slate text-porcelain/60 border-mist";
  return (
    <span className={"text-xs px-2 py-0.5 rounded-full border " + tone}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-porcelain/40 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-porcelain/90 mt-0.5">{value}</dd>
    </div>
  );
}
