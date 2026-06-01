/**
 * B9 (VAL-53) — Frontend Marketplace de especialistas
 *
 * Lista paginada de especialistas verificados + filtros + detalle.
 * NUNCA muestra walletAddress (solo badge "Wallet verificada"). El rating se
 * obtiene del backend (null hasta que existan reviews — VAL-54/follow-up).
 * Reserva de cita → flujo de booking (VAL-58 / B14).
 */
import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="text-xs text-porcelain/40">Sin reseñas aún</span>;
  }
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
  const [specialty, setSpecialty] = useState("");
  const [maxFee, setMaxFee] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"marketplaceSpecialists"> | null>(
    null,
  );

  const args: {
    specialty?: string;
    maxFee?: number;
  } = {};
  if (specialty.trim()) args.specialty = specialty.trim();
  const feeNum = parseFloat(maxFee);
  if (maxFee.trim() && Number.isFinite(feeNum)) args.maxFee = feeNum;

  const { results, status, loadMore } = usePaginatedQuery(
    api.marketplace.specialists.getSpecialists,
    args,
    { initialNumItems: 12 },
  );

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
        <h1 className="text-xl font-semibold mb-1">Marketplace de especialistas</h1>
        <p className="text-sm text-porcelain/50 mb-5">
          Especialistas verificados. Reserva una consulta con pago on-chain.
        </p>

        {/* Filtros */}
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

        {/* Grid */}
        {results.length === 0 && status !== "LoadingFirstPage" ? (
          <div className="text-center text-porcelain/40 py-16 text-sm">
            No hay especialistas que coincidan con los filtros.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((s) => (
              <button
                key={s._id}
                onClick={() => setSelectedId(s._id)}
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
      </div>
    </div>
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
          <div className="text-porcelain/40 text-sm py-16 text-center">
            Cargando detalle…
          </div>
        )}
        {detail === null && (
          <div className="text-porcelain/40 text-sm py-16 text-center">
            Especialista no disponible.
          </div>
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
                value={
                  detail.yearsOfExperience !== undefined
                    ? `${detail.yearsOfExperience} años`
                    : "—"
                }
              />
              <Field label="Fee" value={`${detail.consultationFeeSYS} SYS`} />
              <Field
                label="Wallet"
                value={detail.walletVerified ? "Verificada ✓" : "No verificada"}
              />
            </dl>

            {detail.description && (
              <p className="mt-5 text-sm text-porcelain/70 leading-relaxed">
                {detail.description}
              </p>
            )}

            <button
              disabled
              title="Reserva disponible próximamente (VAL-58)"
              className="mt-6 w-full bg-royal-azure/40 text-porcelain/70 font-medium px-6 py-3 rounded-lg cursor-not-allowed"
            >
              Reservar cita (próximamente)
            </button>
          </div>
        )}
      </div>
    </div>
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
