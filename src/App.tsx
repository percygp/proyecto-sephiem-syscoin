import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useConvexAuth, useMutation, useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Onboarding } from "./Onboarding";
import { DoctorDashboard } from "./DoctorDashboard";
import { AdminDashboard } from "./AdminDashboard";
import { ChatPanel } from "./ChatPanel";
import { NotificationsBell } from "./NotificationsBell";
import { PaymentsSection } from "./PaymentsSection";
import { MarketplacePage } from "./MarketplacePage";
import type { Id } from "../convex/_generated/dataModel";

type Tab = "perfil" | "bitacora" | "marketplace" | "chat";

export default function App() {
  const { ready, authenticated, login } = usePrivy();
  const { isAuthenticated: convexOk } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<Tab>("bitacora");

  // Gating onboarding: si Convex está autenticado, consultar el patient.
  // Si no hay patient (después de verificar wallet), mostrar onboarding.
  const profile = useQuery(
    api.auth.profiles.getMyProfile,
    convexOk ? {} : "skip",
  );
  const patient = useQuery(
    api.patients.onboarding.getMyPatient,
    convexOk ? {} : "skip",
  );

  if (!ready) return <FullScreenMsg text="Inicializando Sephiem…" />;
  if (!authenticated) return <LandingUnauthenticated onConnect={login} />;

  // Convex aún conectando o profile no cargado
  if (!convexOk || profile === undefined) {
    return <FullScreenMsg text="Conectando con Convex…" />;
  }

  // Profile null = no existe profile aún (wallet sin verificar)
  // Mostramos el dashboard parcial para que use el botón "Verificar wallet"
  if (profile === null) {
    return (
      <div className="h-screen flex flex-col bg-ink text-porcelain overflow-hidden">
        <Header activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1 flex overflow-hidden">
          <LeftSidebar tab={activeTab} />
          <NeedsWalletVerification />
          <RightSidebar />
        </div>
        <Footer />
      </div>
    );
  }

  // Routing por rol (A10): admin → AdminDashboard, doctor → DoctorDashboard
  if (profile.role === "admin") {
    return <AdminDashboard />;
  }
  if (profile.role === "doctor") {
    return <DoctorDashboard />;
  }

  // Wallet verificada (profile existe, rol patient) pero onboarding no completado
  if (patient === undefined) return <FullScreenMsg text="Cargando perfil…" />;
  if (patient === null) return <Onboarding />;

  // Todo OK: dashboard completo
  return (
    <div className="h-screen flex flex-col bg-ink text-porcelain overflow-hidden">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar tab={activeTab} />
        <MainContent tab={activeTab} profileId={profile._id} />
        <RightSidebar />
      </div>
      <Footer />
    </div>
  );
}

function NeedsWalletVerification() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-ink">
      <div className="w-16 h-16 rounded-2xl bg-graphite border border-soft-fawn/40 flex items-center justify-center text-soft-fawn text-2xl mb-4">
        🔐
      </div>
      <h2 className="text-xl font-semibold mb-2">Verifica tu wallet primero</h2>
      <p className="text-sm text-porcelain/60 max-w-md leading-relaxed">
        Antes de continuar al onboarding, prueba que controlas tu wallet
        firmando un mensaje. Usa el botón <strong>Verificar wallet</strong> en el
        panel derecho.
      </p>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing
// ─────────────────────────────────────────────────────────────────────────────

function LandingUnauthenticated({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ink text-porcelain px-6 relative overflow-hidden">
      {/* Acento sutil en el fondo */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-royal-azure/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-ship-cove/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <Logo size="lg" />
        <h1 className="text-4xl md:text-5xl font-bold mt-10 text-center max-w-xl">
          Tu seguimiento médico,{" "}
          <span className="bg-gradient-to-r from-royal-azure to-ship-cove bg-clip-text text-transparent">
            on-chain
          </span>
          .
        </h1>
        <p className="text-porcelain/60 mt-4 max-w-md text-center text-base">
          Plataforma de consulta y bienestar con identidad Web3. Hermes te
          acompaña cada día.
        </p>
        <button
          onClick={onConnect}
          className="mt-10 bg-royal-azure hover:bg-royal-azure/90 text-porcelain font-medium px-8 py-3 rounded-lg transition-all shadow-lg shadow-royal-azure/20 hover:shadow-royal-azure/40"
        >
          Conectar wallet
        </button>
        <p className="text-xs text-porcelain/40 mt-4">
          Compatible con MetaMask y wallets externas
        </p>
      </div>
    </div>
  );
}

function FullScreenMsg({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink text-porcelain/60 text-sm">
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function Header({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
}) {
  return (
    <header className="h-14 border-b border-mist bg-ink/80 backdrop-blur flex items-center px-4 gap-4 shrink-0">
      <Logo size="sm" />

      <nav className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-0.5 bg-graphite border border-mist rounded-full p-1">
          <TabButton
            label="Perfil Clínico"
            icon="◉"
            active={activeTab === "perfil"}
            onClick={() => onTabChange("perfil")}
          />
          <TabButton
            label="Bitácora IA"
            icon="✦"
            active={activeTab === "bitacora"}
            onClick={() => onTabChange("bitacora")}
          />
          <TabButton
            label="Marketplace"
            icon="◫"
            active={activeTab === "marketplace"}
            onClick={() => onTabChange("marketplace")}
          />
          <TabButton
            label="Chat Médico"
            icon="◐"
            active={activeTab === "chat"}
            onClick={() => onTabChange("chat")}
          />
        </div>
      </nav>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-graphite border border-mist rounded-full px-3 py-1.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-porcelain/80">Cifrado AES-256</span>
        </div>
        <NotificationsBell />
        <input
          type="text"
          placeholder="Buscar doctor…"
          className="bg-graphite border border-mist rounded-full px-3 py-1.5 text-xs text-porcelain placeholder:text-porcelain/40 focus:outline-none focus:border-royal-azure/60 w-44 transition-colors"
        />
      </div>
    </header>
  );
}

function Logo({ size }: { size: "sm" | "lg" }) {
  const iconSize = size === "sm" ? "w-9 h-9" : "w-16 h-16";
  const textSize = size === "sm" ? "text-base" : "text-2xl";
  const subSize = size === "sm" ? "text-[9px]" : "text-xs";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${iconSize} rounded-xl bg-gradient-to-br from-royal-azure to-ship-cove flex items-center justify-center shadow-lg shadow-royal-azure/20`}
      >
        <span className="text-porcelain font-bold">S</span>
      </div>
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-1.5">
          <span className={`font-bold tracking-wide ${textSize}`}>SEPHIEM</span>
          <span className="bg-soft-fawn/15 border border-soft-fawn/40 text-soft-fawn text-[9px] px-1.5 py-0.5 rounded font-mono">
            WEB3 MD
          </span>
        </div>
        <span
          className={`text-porcelain/40 uppercase tracking-wider font-mono ${subSize}`}
        >
          Protocolo Clínico Seguro
        </span>
      </div>
    </div>
  );
}

function TabButton({
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
      className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition-all ${
        active
          ? "bg-slate text-porcelain shadow-inner"
          : "text-porcelain/55 hover:text-porcelain hover:bg-slate/50"
      }`}
    >
      <span className={active ? "text-royal-azure" : "text-porcelain/40"}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Left Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function LeftSidebar({ tab }: { tab: Tab }) {
  const titles: Record<Tab, string> = {
    perfil: "Secciones del Perfil",
    bitacora: "Conversaciones",
    marketplace: "Directorios Médicos Web3",
    chat: "Consultas Activas",
  };

  return (
    <aside className="w-72 border-r border-mist bg-graphite/40 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-mist">
        <h2 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono">
          {titles[tab]}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarEmpty tab={tab} />
      </div>
    </aside>
  );
}

function SidebarEmpty({ tab }: { tab: Tab }) {
  const msgs: Record<Tab, string> = {
    perfil: "Aún no has completado tu perfil clínico.",
    bitacora: "Inicia una conversación con Hermes en el panel central.",
    marketplace: "El directorio se activa al desbloquear producción.",
    chat: "Sin consultas activas. Agenda una desde el Marketplace.",
  };
  return (
    <div className="text-center py-12 px-4 text-xs text-porcelain/40 leading-relaxed">
      {msgs[tab]}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Content
// ─────────────────────────────────────────────────────────────────────────────

function MainContent({
  tab,
  profileId,
}: {
  tab: Tab;
  profileId: Id<"profiles">;
}) {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-ink">
      {tab === "bitacora" && <HermesChat profileId={profileId} />}
      {tab === "chat" && <DoctorChat profileId={profileId} />}
      {tab === "perfil" && <PaymentsSection />}
      {tab === "marketplace" && <MarketplacePage />}
    </main>
  );
}

// ── HermesChat (Bitácora IA): asegura conversación hermes_patient y renderea
function HermesChat({ profileId }: { profileId: Id<"profiles"> }) {
  const ensure = useMutation(
    api.messages.conversations.ensureHermesConversation,
  );
  const [conversationId, setConversationId] =
    useState<Id<"conversations"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await ensure({});
        if (!cancelled) setConversationId(r.conversationId);
      } catch (err) {
        const data = (err as { data?: { message?: string } }).data;
        if (!cancelled) {
          setError(data?.message ?? (err as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensure]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <p className="text-soft-fawn text-sm">{error}</p>
      </div>
    );
  }
  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-porcelain/40">Iniciando hilo…</span>
      </div>
    );
  }

  return (
    <ChatPanel
      conversationId={conversationId}
      title="Bitácora IA Copiloto"
      subtitle="Hermes responde con IA"
      avatarChar="✦"
      myProfileId={profileId}
      inputDisabled={false}
    />
  );
}

// ── DoctorChat (Chat Médico): asegura conversación doctor_patient si hay
function DoctorChat({ profileId }: { profileId: Id<"profiles"> }) {
  const ensure = useMutation(
    api.messages.conversations.ensureDoctorConversation,
  );
  const [conversationId, setConversationId] =
    useState<Id<"conversations"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await ensure({});
        if (!cancelled) setConversationId(r.conversationId);
      } catch (err) {
        const data = (err as { data?: { code?: string; message?: string } }).data;
        if (!cancelled) {
          setError(data?.message ?? (err as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensure]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-porcelain/40">Conectando…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
        <div className="w-14 h-14 rounded-2xl bg-graphite border border-soft-fawn/40 flex items-center justify-center text-soft-fawn text-xl">
          ⚕
        </div>
        <p className="text-sm text-porcelain/70 max-w-md">
          Aún no tienes médico asignado. El marketplace de médicos se activará
          cuando complete A14+.
        </p>
        <p className="text-[10px] text-porcelain/40 font-mono mt-2">
          Detalle: {error}
        </p>
      </div>
    );
  }
  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-xs text-porcelain/40">Cargando hilo…</span>
      </div>
    );
  }
  return (
    <ChatPanel
      conversationId={conversationId}
      title="Chat con tu médico"
      subtitle="Mensajes cifrados extremo a extremo en Convex"
      avatarChar="M"
      myProfileId={profileId}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right Sidebar — Credenciales Web3
// ─────────────────────────────────────────────────────────────────────────────

function RightSidebar() {
  const { user, logout } = usePrivy();
  const { wallets } = useWallets();
  const { isAuthenticated: convexOk } = useConvexAuth();
  const profile = useQuery(
    api.auth.profiles.getMyProfile,
    convexOk ? {} : "skip",
  );
  const wallet = wallets[0];
  const address = wallet?.address;
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "—";
  const verifiedAddress = profile?.walletAddress;
  const isVerified =
    !!verifiedAddress &&
    !!address &&
    verifiedAddress.toLowerCase() === address.toLowerCase();

  return (
    <aside className="w-72 border-l border-mist bg-graphite/40 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-mist">
        <h2 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono">
          Credenciales Web3
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Wallet card */}
        <div className="border border-mist rounded-lg p-3 bg-graphite">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isVerified ? "bg-success" : "bg-soft-fawn"
                }`}
              />
              <span className="text-porcelain/90 font-medium">
                {isVerified ? "Wallet Verificada" : "Wallet Conectada"}
              </span>
            </div>
            <button
              onClick={() => void logout()}
              className="text-[10px] text-porcelain/45 hover:text-porcelain font-mono transition-colors"
            >
              [DESCONECTAR]
            </button>
          </div>
          <div className="bg-ink border border-mist rounded px-2 py-1.5 text-xs font-mono text-porcelain/85 mb-3 truncate">
            {shortAddress}
          </div>

          {/* Botón de verificación A4 */}
          {convexOk && !isVerified && (
            <VerifyWalletButton walletAddress={address} />
          )}

          <div className="grid grid-cols-2 gap-2 mt-3">
            <BalanceCard label="Saldo SYS" value="—" symbol="SYS" />
            <BalanceCard label="Saldo ETH" value="—" symbol="ETH" />
          </div>
        </div>

        {/* Red activa */}
        <div className="border border-mist rounded-lg p-3 bg-graphite">
          <DataRow label="Red Activa:" value="MetaMask" success />
          <DataRow label="ID Cadena:" value="5700 (SYS Testnet)" mono />
          <DataRow label="Bloque Actual:" value="—" mono />
          <DataRow label="Seguridad:" value="Privy ES256" mono last />
        </div>

        {/* Alertas de salud */}
        <div className="border border-mist rounded-lg p-3 bg-graphite flex-1 flex flex-col min-h-[160px]">
          <h3 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono mb-3">
            Alertas de Salud (0)
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-2xl text-porcelain/25 mb-2">🔔</div>
            <p className="text-xs text-porcelain/50">Sin alertas activas</p>
            <p className="text-[10px] text-porcelain/35 mt-1 leading-snug max-w-[200px]">
              Generadas autónomamente por la bitácora médica
            </p>
          </div>
        </div>

        {/* Convex status */}
        <div className="border border-mist rounded-lg p-3 bg-graphite">
          <DataRow
            label="Privy UID:"
            value={user?.id ? `${user.id.slice(0, 12)}...` : "—"}
            mono
          />
          <DataRow
            label="Convex JWT:"
            value={convexOk ? "válido" : "conectando…"}
            success={convexOk}
            last
          />
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VerifyWalletButton — flujo A4 (nonce → firma → verify)
// ─────────────────────────────────────────────────────────────────────────────

function VerifyWalletButton({ walletAddress }: { walletAddress?: string }) {
  const requestNonce = useMutation(api.auth.walletNonce.requestWalletNonce);
  const verifySignature = useAction(
    api.auth.walletVerify.verifyWalletSignature,
  );
  const { wallets } = useWallets();
  const [state, setState] = useState<
    "idle" | "requesting" | "signing" | "verifying" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleVerify() {
    if (!walletAddress) return;
    setErrorMsg(null);

    try {
      // 1. Pedir nonce al backend (server-side, TTL 5 min, bound a tokenIdentifier)
      setState("requesting");
      const { nonce } = await requestNonce({});

      // 2. Pedir firma a MetaMask (wallet externa vía EIP-1193 provider)
      setState("signing");
      const message = `Sephiem wallet verification nonce:${nonce}`;
      const wallet = wallets.find(
        (w) => w.address.toLowerCase() === walletAddress.toLowerCase(),
      );
      if (!wallet) throw new Error("Wallet conectada no encontrada");
      const provider = await wallet.getEthereumProvider();
      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, wallet.address],
      })) as string;

      // 3. Verificar server-side (viem.verifyMessage + consume nonce + patch profile)
      setState("verifying");
      await verifySignature({
        walletAddress,
        message,
        signature,
      });

      setState("idle"); // success — el useQuery de profile va a re-renderear y ocultar el botón
    } catch (err) {
      const error = err as Error;
      // ConvexError trae .data con { code, message }
      const data = (err as { data?: { code?: string; message?: string } }).data;
      setErrorMsg(data?.message ?? error.message ?? "Error desconocido");
      setState("error");
    }
  }

  const labels = {
    idle: "Verificar wallet",
    requesting: "Solicitando nonce…",
    signing: "Firma en MetaMask…",
    verifying: "Verificando firma…",
    error: "Reintentar",
  };
  const isWorking =
    state === "requesting" || state === "signing" || state === "verifying";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => void handleVerify()}
        disabled={isWorking}
        className="w-full bg-royal-azure hover:bg-royal-azure/90 disabled:bg-royal-azure/40 text-porcelain font-medium text-xs py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
      >
        {isWorking && (
          <span className="w-3 h-3 border-2 border-porcelain/40 border-t-porcelain rounded-full animate-spin" />
        )}
        {labels[state]}
      </button>
      {state === "error" && errorMsg && (
        <p className="text-[10px] text-soft-fawn font-mono leading-snug">
          {errorMsg}
        </p>
      )}
      {state === "idle" && (
        <p className="text-[10px] text-porcelain/40 font-mono leading-snug">
          Firma criptográfica para probar ownership
        </p>
      )}
    </div>
  );
}

function BalanceCard({
  label,
  value,
  symbol,
}: {
  label: string;
  value: string;
  symbol: string;
}) {
  return (
    <div className="border border-mist rounded-md px-2 py-1.5 bg-ink">
      <div className="text-[9px] uppercase tracking-wider text-porcelain/45 font-mono">
        {label}
      </div>
      <div className="text-xs font-mono mt-0.5">
        <span className="text-porcelain">{value}</span>{" "}
        <span className="text-soft-fawn">{symbol}</span>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono,
  success,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  success?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 text-xs ${
        last ? "" : "border-b border-mist/60"
      }`}
    >
      <span className="text-porcelain/50">{label}</span>
      <span
        className={`flex items-center gap-1.5 ${mono ? "font-mono" : ""} ${
          success ? "text-success" : "text-porcelain/85"
        }`}
      >
        {success && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

function Footer() {
  const { isAuthenticated: convexOk } = useConvexAuth();
  return (
    <footer className="h-7 border-t border-mist bg-ink flex items-center justify-between px-4 text-[10px] font-mono text-porcelain/45">
      <span>SEPHIEM v0.4.0</span>
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            convexOk ? "bg-success" : "bg-soft-fawn"
          }`}
        />
        <span>{convexOk ? "Sincronizado" : "Conectando…"}</span>
      </div>
    </footer>
  );
}
