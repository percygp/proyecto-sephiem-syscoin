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
import { useSyscoin } from "./web3/useSyscoin";
import { explorerTx } from "./web3/chain";
import type { Address } from "viem";

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

function fmtDay(ts: number): string {
  return new Date(ts).toLocaleDateString("es", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
}

function fmtHour(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

type SlotOption = {
  startTime: number;
  endTime: number;
  slotId?: Id<"appointmentSlots">;
};

function generateDefaultSlots(): SlotOption[] {
  const slots: SlotOption[] = [];
  const day = new Date();
  day.setDate(day.getDate() + 1);
  day.setHours(0, 0, 0, 0);
  let businessDays = 0;
  while (businessDays < 5) {
    const dow = day.getDay();
    if (dow >= 1 && dow <= 5) {
      for (let h = 9; h < 17; h++) {
        if (h === 13) continue;
        const d = new Date(day);
        d.setHours(h, 0, 0, 0);
        slots.push({ startTime: d.getTime(), endTime: d.getTime() + 3_600_000 });
      }
      businessDays++;
    }
    day.setDate(day.getDate() + 1);
  }
  return slots;
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
      <div className="mb-5">
        <h1 className="text-base font-semibold mb-0.5">Especialistas verificados</h1>
        <p className="text-xs text-porcelain/55">
          Selecciona un especialista para ver su perfil y agendar una cita. La cita queda registrada en la blockchain de Syscoin zkEVM con tu firma.
        </p>
      </div>
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
          placeholder="Precio máx (S/.)"
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
                  S/. {s.consultationFeeSYS}
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
  const detail      = useQuery(api.marketplace.specialists.getSpecialistDetail, { specialistId });
  const realSlots   = useQuery(api.appointments.queries.getAvailableSlots, { specialistId });
  const doctorWallet = useQuery(api.marketplace.specialists.getSpecialistWalletForBooking, { specialistId });
  const createHold  = useAction(api.appointments.booking.createAppointmentHold);
  const saveOnChain = useMutation(api.appointments.booking.saveOnChainData);
  const { bookAppointmentOnChain, ready: walletReady } = useSyscoin();

  const [showModal, setShowModal] = useState(false);
  const [booking, setBooking] = useState<{
    appointmentId: Id<"appointments">;
    derivedAddress: string;
    amountExpected: string;
    startedAt: number;
    onChainTxHash: string;
  } | null>(null);

  if (booking) {
    return (
      <PaymentScreen
        appointmentId={booking.appointmentId}
        derivedAddress={booking.derivedAddress}
        amountExpected={booking.amountExpected}
        startedAt={booking.startedAt}
        onChainTxHash={booking.onChainTxHash}
        onDone={onBack}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="text-sm text-porcelain/60 hover:text-porcelain mb-4">
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
            <div className="mt-3">
              <Stars rating={detail.rating} />
            </div>
            <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <Field label="Licencia" value={detail.licenseNumber} />
              <Field label="Jurisdicción" value={detail.jurisdiction} />
              <Field
                label="Experiencia"
                value={detail.yearsOfExperience !== undefined ? `${detail.yearsOfExperience} años` : "—"}
              />
              <Field label="Tarifa" value={`S/. ${detail.consultationFeeSYS}`} />
            </dl>
            {detail.description && (
              <p className="mt-4 text-sm text-porcelain/70 leading-relaxed">{detail.description}</p>
            )}

            <div className="mt-6 pt-5 border-t border-mist">
              <button
                onClick={() => setShowModal(true)}
                className="w-full py-3 rounded-xl bg-royal-azure text-white text-sm font-semibold hover:bg-royal-azure/90 transition-colors flex items-center justify-center gap-2"
              >
                <span>📅</span> Agendar Cita
              </button>
              <p className="text-[11px] text-porcelain/35 mt-2 text-center font-mono">
                ⛓ Se registrará en Syscoin zkEVM · Requiere firma con MetaMask
              </p>
            </div>
          </div>
        )}
      </div>

      {showModal && detail && (
        <BookingModal
          detail={detail}
          doctorWalletAddress={doctorWallet?.walletAddress ?? null}
          walletReady={walletReady}
          realSlots={realSlots}
          bookAppointmentOnChain={bookAppointmentOnChain}
          createHold={createHold}
          saveOnChain={saveOnChain}
          onClose={() => setShowModal(false)}
          onHoldCreated={(data) => { setShowModal(false); setBooking(data); }}
        />
      )}
    </div>
  );
}

function BookingModal({
  detail,
  doctorWalletAddress,
  walletReady,
  realSlots,
  bookAppointmentOnChain,
  createHold,
  saveOnChain,
  onClose,
  onHoldCreated,
}: {
  detail: { name: string; specialty: string; consultationFeeSYS: string };
  doctorWalletAddress: string | null;
  walletReady: boolean;
  realSlots: Array<{ _id: Id<"appointmentSlots">; startTime: number; endTime: number }> | undefined;
  bookAppointmentOnChain: (addr: Address, ts: number) => Promise<{ appointmentId: string; txHash: string }>;
  createHold: (args: { slotId: Id<"appointmentSlots"> }) => Promise<{ appointmentId: Id<"appointments">; derivedAddress: string; amountExpected: string }>;
  saveOnChain: (args: { appointmentId: Id<"appointments">; onChainTxHash: string; onChainAppointmentId: string }) => Promise<null>;
  onClose: () => void;
  onHoldCreated: (data: { appointmentId: Id<"appointments">; derivedAddress: string; amountExpected: string; startedAt: number; onChainTxHash: string }) => void;
}) {
  const [selected, setSelected] = useState<SlotOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const displaySlots: SlotOption[] =
    realSlots && realSlots.length > 0
      ? realSlots.map((s) => ({ startTime: s.startTime, endTime: s.endTime, slotId: s._id }))
      : generateDefaultSlots();

  const byDay = new Map<string, SlotOption[]>();
  for (const s of displaySlots) {
    const key = fmtDay(s.startTime);
    const arr = byDay.get(key) ?? [];
    arr.push(s);
    byDay.set(key, arr);
  }

  async function confirmar() {
    if (!selected) return;
    if (!walletReady) { setError("Conecta tu wallet MetaMask para continuar."); return; }
    if (!doctorWalletAddress) { setError("El especialista no tiene wallet registrada."); return; }
    setError(null);
    setBusy(true);
    try {
      const result = await bookAppointmentOnChain(doctorWalletAddress as Address, selected.startTime);
      if (selected.slotId) {
        const r = await createHold({ slotId: selected.slotId });
        await saveOnChain({
          appointmentId: r.appointmentId,
          onChainTxHash: result.txHash,
          onChainAppointmentId: result.appointmentId,
        });
        onHoldCreated({
          appointmentId: r.appointmentId,
          derivedAddress: r.derivedAddress,
          amountExpected: r.amountExpected,
          startedAt: Date.now(),
          onChainTxHash: result.txHash,
        });
      } else {
        setTxHash(result.txHash);
      }
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/70 backdrop-blur-sm">
      <div className="bg-graphite border border-mist rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mist shrink-0">
          <div>
            <h2 className="font-semibold text-base">Agendar Cita</h2>
            <p className="text-xs text-porcelain/50">{detail.name} · {detail.specialty}</p>
          </div>
          <button onClick={onClose} className="text-porcelain/40 hover:text-porcelain text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-mist/30">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {txHash ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="font-semibold text-base mb-1">¡Cita registrada en blockchain!</h3>
              <p className="text-xs text-porcelain/55 mb-5">
                {selected && <span className="block mb-1 text-porcelain/80">{fmtDay(selected.startTime)} — {fmtHour(selected.startTime)}</span>}
                Tu cita quedó registrada en Syscoin zkEVM.
              </p>
              <a
                href={explorerTx(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-royal-azure border border-royal-azure/40 px-4 py-2 rounded-lg hover:bg-royal-azure/10 transition-colors"
              >
                <span>⛓</span> Ver en blockchain ↗
              </a>
              <p className="text-[10px] font-mono text-porcelain/30 mt-4 break-all px-4">{txHash}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-royal-azure/10 text-royal-azure border border-royal-azure/30">
                  ⛓ On-chain · Syscoin zkEVM
                </span>
                <span className="text-xs text-porcelain/50">S/. {detail.consultationFeeSYS} / consulta</span>
              </div>

              {!walletReady && (
                <div className="mb-3 text-sm text-soft-fawn bg-soft-fawn/10 border border-soft-fawn/30 rounded-lg px-3 py-2">
                  Conecta tu wallet MetaMask para agendar.
                </div>
              )}
              {error && (
                <div className="mb-3 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {realSlots === undefined ? (
                <p className="text-sm text-porcelain/40 py-6 text-center">Cargando horarios…</p>
              ) : (
                <div className="space-y-5">
                  {Array.from(byDay.entries()).map(([day, daySlots]) => (
                    <div key={day}>
                      <p className="text-[11px] uppercase tracking-wider text-porcelain/40 font-mono mb-2 capitalize">{day}</p>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((s) => (
                          <button
                            key={s.startTime}
                            disabled={busy}
                            onClick={() => setSelected(s)}
                            className={
                              "text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 " +
                              (selected?.startTime === s.startTime
                                ? "border-royal-azure bg-royal-azure/15 text-royal-azure font-semibold"
                                : "border-mist hover:border-royal-azure/50 text-porcelain/70")
                            }
                          >
                            {fmtHour(s.startTime)}
                            {s.slotId && <span className="ml-1 text-[9px] text-success">●</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-mist shrink-0">
          {txHash ? (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-mist text-porcelain/70 text-sm hover:border-royal-azure/50 transition-colors"
            >
              Cerrar
            </button>
          ) : (
            <>
              {selected && (
                <p className="text-xs text-porcelain/55 text-center mb-2">
                  Seleccionado: <span className="text-porcelain font-medium">{fmtDay(selected.startTime)} — {fmtHour(selected.startTime)}</span>
                </p>
              )}
              <button
                disabled={busy || !selected}
                onClick={() => void confirmar()}
                className="w-full py-2.5 rounded-xl bg-royal-azure text-white text-sm font-semibold hover:bg-royal-azure/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {busy
                  ? <><span className="animate-spin inline-block">⟳</span> Registrando en blockchain…</>
                  : <><span>⛓</span> {selected ? "Confirmar Cita" : "Selecciona un horario"}</>
                }
              </button>
              {realSlots && realSlots.length === 0 && (
                <p className="text-[10px] text-porcelain/30 text-center mt-2">● horario confirmado en sistema · Sin ● es estimado</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentScreen({
  appointmentId,
  derivedAddress,
  amountExpected,
  startedAt,
  onChainTxHash,
  onDone,
}: {
  appointmentId: Id<"appointments">;
  derivedAddress: string;
  amountExpected: string;
  startedAt: number;
  onChainTxHash?: string;
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
            <Field label="Monto" value={`S/. ${amountExpected}`} />
            <div className="mt-3">
              <dt className="text-porcelain/40 text-xs uppercase tracking-wide">Dirección de pago</dt>
              <dd className="text-porcelain/90 mt-0.5 font-mono text-xs break-all bg-slate rounded-lg px-2 py-2 border border-mist">
                {derivedAddress}
              </dd>
            </div>
            {onChainTxHash && (
              <div className="mt-4 pt-4 border-t border-mist/40">
                <dt className="text-porcelain/40 text-xs uppercase tracking-wide mb-1">Registro blockchain</dt>
                <a
                  href={explorerTx(onChainTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-royal-azure hover:underline break-all"
                >
                  {onChainTxHash.slice(0, 20)}…{onChainTxHash.slice(-8)} ↗
                </a>
              </div>
            )}
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
            <div className="flex flex-col gap-1">
              <span>
                {a.amountPaidSYS ? `S/. ${a.amountPaidSYS}` : "—"}
                {a.txHashTruncated ? ` · tx ${a.txHashTruncated}` : ""}
              </span>
              {a.onChainTxHash && (
                <a
                  href={explorerTx(a.onChainTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-royal-azure hover:underline flex items-center gap-1"
                >
                  <span>⛓</span> Ver en blockchain ↗
                </a>
              )}
            </div>
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
