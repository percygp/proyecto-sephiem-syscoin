/**
 * A15 — Sección de Pagos (paciente)
 *
 * Lista los invoices del paciente con su dirección de pago Syscoin, monto,
 * estado y countdown de expiración. Realtime via useQuery.
 *
 * El paciente envía SYS/USDT a la derivedAddress. El monitor de blockchain
 * (VPS futuro) detecta el pago y actualiza el estado automáticamente.
 */
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function PaymentsSection() {
  const invoices = useQuery(api.payments.invoices.getMyInvoices);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1">Pagos y suscripción</h1>
          <p className="text-sm text-porcelain/55">
            Paga en Syscoin testnet para activar tu seguimiento médico.
          </p>
        </div>

        {invoices === undefined && (
          <p className="text-xs text-porcelain/40 text-center py-12">
            Cargando facturas…
          </p>
        )}

        {invoices && invoices.length === 0 && (
          <div className="border border-mist rounded-lg p-8 text-center bg-graphite">
            <div className="w-14 h-14 rounded-2xl bg-ink border border-mist flex items-center justify-center text-soft-fawn text-xl mx-auto mb-3">
              💳
            </div>
            <p className="text-sm text-porcelain/70">
              No tienes facturas pendientes.
            </p>
            <p className="text-[11px] text-porcelain/40 mt-1 font-mono">
              El administrador genera tu factura de suscripción.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {invoices?.map((inv) => (
            <InvoiceCard key={inv._id} invoice={inv} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InvoiceCard({
  invoice,
}: {
  invoice: {
    _id: string;
    invoiceCode: string;
    derivedAddress: string;
    amountExpected: string;
    currency: string;
    expectedChainId: number;
    status: string;
    expiresAt: number;
    subscriptionMonths: number;
  };
}) {
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const expired = invoice.expiresAt < now;
  const hoursLeft = Math.max(
    0,
    Math.round((invoice.expiresAt - now) / (60 * 60 * 1000)),
  );

  return (
    <div className="border border-mist rounded-lg p-4 bg-graphite">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-sm font-semibold font-mono">
            {invoice.invoiceCode}
          </span>
          <p className="text-[11px] text-porcelain/50 mt-0.5">
            {invoice.subscriptionMonths}{" "}
            {invoice.subscriptionMonths === 1 ? "mes" : "meses"} de suscripción
          </p>
        </div>
        <InvoiceStatusPill status={invoice.status} expired={expired} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Monto">
          <span className="text-lg font-mono text-porcelain">
            {invoice.amountExpected}
          </span>{" "}
          <span className="text-soft-fawn font-mono text-sm">
            {invoice.currency}
          </span>
        </Field>
        <Field label="Red">
          <span className="text-xs font-mono text-porcelain/80">
            Syscoin testnet ({invoice.expectedChainId})
          </span>
        </Field>
      </div>

      {invoice.status === "pending" && !expired && (
        <>
          <Field label="Enviar a esta dirección">
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-ink border border-mist rounded px-2 py-1.5 text-xs font-mono text-porcelain/90 break-all">
                {invoice.derivedAddress}
              </code>
              <button
                onClick={() =>
                  void navigator.clipboard.writeText(invoice.derivedAddress)
                }
                className="bg-royal-azure/20 border border-royal-azure/40 text-royal-azure text-xs px-2 py-1.5 rounded hover:bg-royal-azure/30 transition-colors shrink-0"
                title="Copiar"
              >
                Copiar
              </button>
            </div>
          </Field>
          <p className="text-[11px] text-soft-fawn mt-2 font-mono">
            ⏳ Expira en {hoursLeft}h. Envía el monto exacto.
          </p>
        </>
      )}

      {invoice.status === "paid" && (
        <p className="text-xs text-success">
          ✓ Pago confirmado. Suscripción activada.
        </p>
      )}
      {invoice.status === "overpaid" && (
        <p className="text-xs text-success">
          ✓ Pago confirmado (excedente). Suscripción activada.
        </p>
      )}
      {invoice.status === "partial" && (
        <p className="text-xs text-soft-fawn">
          ⚠ Pago parcial recibido. Contacta soporte para resolver.
        </p>
      )}
      {(invoice.status === "expired" || expired) &&
        invoice.status === "pending" && (
          <p className="text-xs text-porcelain/50">
            Esta factura expiró. Solicita una nueva.
          </p>
        )}
    </div>
  );
}

function InvoiceStatusPill({
  status,
  expired,
}: {
  status: string;
  expired: boolean;
}) {
  const effectiveStatus = expired && status === "pending" ? "expired" : status;
  const styles: Record<string, string> = {
    pending: "bg-soft-fawn/15 text-soft-fawn border-soft-fawn/30",
    paid: "bg-success/15 text-success border-success/30",
    overpaid: "bg-success/15 text-success border-success/30",
    partial: "bg-soft-fawn/15 text-soft-fawn border-soft-fawn/30",
    expired: "bg-mist text-porcelain/50 border-mist",
    cancelled: "bg-mist text-porcelain/50 border-mist",
  };
  const labels: Record<string, string> = {
    pending: "Pendiente",
    paid: "Pagado",
    overpaid: "Pagado (excedente)",
    partial: "Parcial",
    expired: "Expirado",
    cancelled: "Cancelado",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
        styles[effectiveStatus] ?? "bg-mist text-porcelain/50 border-mist"
      }`}
    >
      {labels[effectiveStatus] ?? effectiveStatus}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}
