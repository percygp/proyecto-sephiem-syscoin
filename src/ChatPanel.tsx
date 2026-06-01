/**
 * A11 — ChatPanel reutilizable
 *
 * Componente de chat usado por:
 *  - PatientDashboard / Bitácora IA (con Hermes — sin GPT aún, placeholder)
 *  - PatientDashboard / Chat Médico (con doctor asignado)
 *  - DoctorDashboard / PatientDetail (con su paciente)
 *
 * Realtime via Convex useQuery. Paginación incremental con paginationOptsValidator.
 * Auto-scroll a último mensaje. Marca como leído al abrir.
 */
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type ChatPanelProps = {
  conversationId: Id<"conversations">;
  title: string;
  subtitle?: string;
  avatarChar?: string;
  // El _id del profile del usuario actual, para alinear "mis mensajes" a la derecha
  myProfileId: Id<"profiles">;
  // Si true, deshabilita el input (ej: hilo con Hermes mientras A18 no esté)
  inputDisabled?: boolean;
  inputDisabledHint?: string;
};

export function ChatPanel(p: ChatPanelProps) {
  const sendMessage = useMutation(api.messages.messages.sendMessage);
  const markRead = useMutation(api.messages.messages.markConversationRead);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Paginación: cargamos por lotes de 30
  const {
    results: messages,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.messages.messages.listMessages,
    { conversationId: p.conversationId },
    { initialNumItems: 30 },
  );

  // Marcar conversación como leída al abrir
  useEffect(() => {
    void markRead({ conversationId: p.conversationId });
    // Re-marcar cuando llegan nuevos mensajes ajenos
  }, [p.conversationId, markRead, messages.length]);

  // Auto-scroll cuando llegan mensajes nuevos
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage({
        conversationId: p.conversationId,
        content: trimmed,
      });
      setDraft("");
    } catch (err) {
      const data = (err as { data?: { message?: string } }).data;
      setError(data?.message ?? (err as Error).message);
    } finally {
      setSending(false);
    }
  }

  // Orden de mensajes: el query los da DESC; los invertimos para mostrar
  // oldest first (arriba) → newest (abajo).
  const orderedMessages = [...messages].reverse();

  return (
    <div className="flex flex-col h-full bg-ink">
      {/* Header */}
      <div className="px-4 py-3 border-b border-mist flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-graphite border border-mist flex items-center justify-center text-royal-azure font-bold">
            {p.avatarChar ?? "S"}
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">{p.title}</div>
            {p.subtitle && (
              <div className="text-[11px] text-porcelain/50">{p.subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-graphite border border-mist rounded-full px-2.5 py-1 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-porcelain/80">En línea</span>
        </div>
      </div>

      {/* Hilo */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3"
      >
        {/* Botón "cargar más antiguos" arriba */}
        {status === "CanLoadMore" && (
          <button
            onClick={() => loadMore(30)}
            className="self-center text-[11px] text-royal-azure hover:text-royal-azure/80 underline mb-2"
          >
            Cargar mensajes anteriores
          </button>
        )}
        {status === "LoadingMore" && (
          <span className="self-center text-[11px] text-porcelain/40 mb-2">
            Cargando…
          </span>
        )}

        {orderedMessages.length === 0 && status !== "LoadingFirstPage" && (
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-xs text-porcelain/45 max-w-xs leading-relaxed">
              Aún no hay mensajes en este hilo. Sé el primero en saludar.
            </p>
          </div>
        )}

        {orderedMessages.map((m) => (
          <MessageBubble
            key={m._id}
            content={m.content}
            sentAt={m.sentAt}
            senderType={m.senderType}
            isMine={m.senderProfileId === p.myProfileId}
          />
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { void handleSend(e); }}
        className="border-t border-mist px-6 py-3 bg-graphite/30"
      >
        {error && (
          <p className="text-[10px] text-soft-fawn font-mono mb-2">{error}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={
              p.inputDisabled
                ? p.inputDisabledHint ?? "Input deshabilitado"
                : "Escribe un mensaje…"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={p.inputDisabled || sending}
            className="flex-1 bg-graphite border border-mist rounded-lg px-4 py-2.5 text-sm text-porcelain placeholder:text-porcelain/40 focus:outline-none focus:border-royal-azure/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={p.inputDisabled || sending || draft.trim().length === 0}
            className="bg-royal-azure hover:bg-royal-azure/90 disabled:bg-royal-azure/40 text-porcelain rounded-lg p-2.5 transition-colors"
          >
            {sending ? "…" : "➤"}
          </button>
        </div>
        {p.inputDisabledHint && p.inputDisabled && (
          <p className="text-[10px] text-porcelain/40 mt-2 font-mono">
            {p.inputDisabledHint}
          </p>
        )}
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MessageBubble
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({
  content,
  sentAt,
  senderType,
  isMine,
}: {
  content: string;
  sentAt: number;
  senderType: string;
  isMine: boolean;
}) {
  const time = new Date(sentAt).toTimeString().slice(0, 5);

  if (isMine) {
    return (
      <div className="flex flex-col items-end max-w-[80%] self-end">
        <div className="bg-royal-azure/20 border border-royal-azure/40 rounded-lg rounded-br-sm px-4 py-2.5 text-sm text-porcelain">
          {content}
        </div>
        <div className="text-[10px] text-porcelain/40 mt-1 font-mono">
          {time}
        </div>
      </div>
    );
  }

  // Mensaje de otro participante (hermes / doctor / patient)
  const avatarChar =
    senderType === "hermes" ? "S" : senderType === "doctor" ? "M" : "P";
  return (
    <div className="flex gap-2 max-w-[80%] self-start">
      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-royal-azure to-ship-cove flex items-center justify-center text-porcelain text-[11px] font-bold shrink-0 mt-0.5">
        {avatarChar}
      </div>
      <div>
        <div className="bg-graphite border border-mist rounded-lg rounded-bl-sm px-4 py-2.5 text-sm text-porcelain/90 leading-relaxed">
          {content}
        </div>
        <div className="text-[10px] text-porcelain/40 mt-1 font-mono">
          {time}
        </div>
      </div>
    </div>
  );
}
