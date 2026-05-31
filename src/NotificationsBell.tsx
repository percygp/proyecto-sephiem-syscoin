/**
 * A13 — NotificationsBell
 *
 * Campana con badge contador + panel desplegable de últimas notificaciones.
 * Click en notificación = marca como leída.
 * Botón "Marcar todas" en el footer.
 *
 * Reutilizable: se usa en el header del paciente y del doctor.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = useQuery(
    api.notifications.notifications.countUnreadNotifications,
  );

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const badgeText =
    unreadCount === undefined
      ? null
      : unreadCount === 0
        ? null
        : unreadCount >= 100
          ? "99+"
          : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-md hover:bg-slate flex items-center justify-center transition-colors"
        title="Notificaciones"
      >
        <span className="text-lg">🔔</span>
        {badgeText && (
          <span className="absolute -top-1 -right-1 bg-royal-azure text-porcelain text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {badgeText}
          </span>
        )}
      </button>

      {open && <NotificationsPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel desplegable
// ─────────────────────────────────────────────────────────────────────────────

function NotificationsPanel({ onClose: _onClose }: { onClose: () => void }) {
  const { results: notifications, status, loadMore } = usePaginatedQuery(
    api.notifications.notifications.listMyNotifications,
    {},
    { initialNumItems: 15 },
  );
  const markRead = useMutation(
    api.notifications.notifications.markNotificationRead,
  );
  const markAllRead = useMutation(
    api.notifications.notifications.markAllNotificationsRead,
  );

  async function handleClick(notifId: Id<"notifications">, isRead: boolean) {
    if (!isRead) {
      try {
        await markRead({ notificationId: notifId });
      } catch {
        // silencioso
      }
    }
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-80 max-h-96 bg-graphite border border-mist rounded-lg shadow-2xl shadow-black/40 overflow-hidden z-50 flex flex-col">
      <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notificaciones</h3>
        <button
          onClick={() => void markAllRead({})}
          className="text-[11px] text-royal-azure hover:text-royal-azure/80"
        >
          Marcar todas leídas
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {status === "LoadingFirstPage" && (
          <p className="text-xs text-porcelain/40 text-center py-8">Cargando…</p>
        )}

        {notifications.length === 0 && status !== "LoadingFirstPage" && (
          <p className="text-xs text-porcelain/45 text-center py-8 px-4">
            No tienes notificaciones todavía.
          </p>
        )}

        {notifications.map((n) => (
          <button
            key={n._id}
            onClick={() => void handleClick(n._id, n.isRead)}
            className={`w-full text-left px-4 py-3 border-b border-mist/60 hover:bg-slate/50 transition-colors ${
              n.isRead ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              {!n.isRead && (
                <span className="w-1.5 h-1.5 rounded-full bg-royal-azure mt-1.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-porcelain truncate">
                  {n.title}
                </p>
                <p className="text-[11px] text-porcelain/60 mt-0.5 leading-snug">
                  {n.body}
                </p>
                <p className="text-[9px] text-porcelain/40 mt-1 font-mono">
                  {new Date(n._creationTime).toLocaleString()}
                </p>
              </div>
            </div>
          </button>
        ))}

        {status === "CanLoadMore" && (
          <button
            onClick={() => loadMore(15)}
            className="w-full text-[11px] text-royal-azure hover:text-royal-azure/80 py-2 border-t border-mist"
          >
            Cargar más
          </button>
        )}
      </div>
    </div>
  );
}
