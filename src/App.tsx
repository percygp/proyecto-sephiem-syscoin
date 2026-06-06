import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Onboarding } from "./Onboarding";
import { DoctorDashboard } from "./DoctorDashboard";
import { AdminDashboard } from "./AdminDashboard";
import { NotificationsBell } from "./NotificationsBell";
import { PaymentsSection } from "./PaymentsSection";
import { MarketplacePage } from "./MarketplacePage";
import { MiSaludSection } from "./MiSaludSection";
import { useSyscoinNetwork, explorerAddress } from "./web3";

type Tab = "salud" | "especialistas" | "configuracion";

export default function App() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { isAuthenticated: convexOk } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<Tab>("salud");
  const [rightOpen, setRightOpen] = useState(false);
  const selectTab = (t: Tab) => { setActiveTab(t); };

  const profile = useQuery(api.auth.profiles.getMyProfile, convexOk ? {} : "skip");
  const patient = useQuery(api.patients.onboarding.getMyPatient, convexOk ? {} : "skip");
  const ensureMyProfile = useMutation(api.auth.profiles.ensureMyProfile);
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  const [skipLanding, setSkipLanding] = useState(false);

  useEffect(() => {
    const address = wallets[0]?.address;
    if (convexOk && profile === null && address) {
      void ensureMyProfile({ walletAddress: address });
    }
  }, [convexOk, profile, wallets, ensureMyProfile]);

  if (!ready) return <FullScreenMsg text="Inicializando Sephiem…" />;

  // Landing como pantalla de entrada — se salta con "Ir a dashboard" o al autenticarse
  if (!authenticated && !skipLanding) {
    return <LandingPage onConnect={login} onEnterDashboard={() => setSkipLanding(true)} />;
  }

  // Routing por rol para admin/doctor (requieren sesión completa)
  if (authenticated) {
    if (!convexOk || profile === undefined) return <FullScreenMsg text="Conectando…" />;
    if (profile === null) return <FullScreenMsg text="Configurando tu cuenta…" />;
    if (profile.role === "admin") return <AdminDashboard />;
    if (profile.role === "doctor") return <DoctorDashboard />;
    if (patient === undefined) return <FullScreenMsg text="Cargando perfil…" />;
    if (patient === null && !skipOnboarding) return <Onboarding onSkip={() => setSkipOnboarding(true)} />;
  }

  // Dashboard principal — accesible sin cuenta (modo exploración)
  const isGuest = !authenticated;

  return (
    <div className="h-screen flex flex-col bg-ink text-porcelain overflow-hidden">
      {/* Banner: modo exploración (solo guest) */}
      {isGuest && (
        <div className="bg-graphite border-b border-mist px-4 py-2 text-xs text-porcelain/55 text-center">
          Modo exploración · Inicia sesión para activar todas las funciones
        </div>
      )}
      <Header
        activeTab={activeTab}
        onTabChange={selectTab}
        onToggleRight={() => setRightOpen((v) => !v)}
        isGuest={isGuest}
        onLogin={login}
      />
      <div className="flex-1 flex overflow-hidden">
        <MainContent tab={activeTab} isGuest={isGuest} onLogin={login} />
        <RightSidebar open={rightOpen} onClose={() => setRightOpen(false)} isGuest={isGuest} />
        <MobileBackdrop show={rightOpen} onClick={() => setRightOpen(false)} />
      </div>
      <Footer />
    </div>
  );
}

// Backdrop semitransparente para drawers móviles (<lg). No cubre el header.
function MobileBackdrop({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  return (
    <div
      onClick={onClick}
      className="fixed inset-x-0 top-14 bottom-0 z-30 bg-black/50 lg:hidden"
      aria-hidden="true"
    />
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Landing page principal
// ─────────────────────────────────────────────────────────────────────────────

function LandingPage({
  onConnect,
  onEnterDashboard,
}: {
  onConnect: () => void;
  onEnterDashboard: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ink text-porcelain px-6 relative overflow-hidden">
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
          Plataforma de consulta y bienestar con identidad Web3. SEPH-AI te
          acompaña cada día.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onConnect}
            className="w-full sm:w-auto bg-royal-azure hover:bg-royal-azure/90 text-porcelain font-medium px-8 py-3 rounded-lg transition-all shadow-lg shadow-royal-azure/20 hover:shadow-royal-azure/40"
          >
            Iniciar sesión
          </button>
          <button
            onClick={onEnterDashboard}
            className="w-full sm:w-auto bg-graphite border border-mist hover:border-royal-azure/50 text-porcelain/80 hover:text-porcelain font-medium px-8 py-3 rounded-lg transition-all"
          >
            Ir al dashboard →
          </button>
        </div>

        <p className="text-xs text-porcelain/40 mt-4">
          Email, Google o wallet externa
        </p>
      </div>
    </div>
  );
}

// Pantalla de gate para tabs que requieren sesión activa
function GuestGate({
  label,
  description,
  onLogin,
}: {
  label: string;
  description: string;
  onLogin: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-graphite border border-mist flex items-center justify-center text-2xl text-porcelain/30">
        ⚙
      </div>
      <h2 className="text-base font-semibold text-porcelain">{label}</h2>
      <p className="text-sm text-porcelain/55 max-w-xs">{description}</p>
      <button
        onClick={onLogin}
        className="bg-royal-azure hover:bg-royal-azure/90 text-porcelain font-medium px-6 py-2.5 rounded-lg transition-colors"
      >
        Conectar para acceder
      </button>
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
  onToggleRight,
  isGuest,
  onLogin,
}: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  onToggleRight: () => void;
  isGuest: boolean;
  onLogin: () => void;
}) {
  return (
    <header className="h-14 border-b border-mist bg-ink/80 backdrop-blur flex items-center px-4 gap-3 sm:gap-4 shrink-0">
      <Logo size="sm" />

      <nav className="flex-1 flex justify-center min-w-0 overflow-x-auto">
        <div className="flex items-center gap-0.5 bg-graphite border border-mist rounded-full p-1 shrink-0">
          <TabButton label="Mi salud" icon="◉" active={activeTab === "salud"} onClick={() => onTabChange("salud")} />
          <TabButton label="Especialistas" icon="◫" active={activeTab === "especialistas"} onClick={() => onTabChange("especialistas")} />
          <TabButton label="Configuración" icon="⚙" active={activeTab === "configuracion"} onClick={() => onTabChange("configuracion")} />
        </div>
      </nav>

      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 bg-graphite border border-mist rounded-full px-3 py-1.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          <span className="text-porcelain/80">Cifrado AES-256</span>
        </div>
        {isGuest ? (
          <button
            onClick={onLogin}
            className="bg-royal-azure hover:bg-royal-azure/90 text-porcelain text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
          >
            Iniciar sesión
          </button>
        ) : (
          <>
            <NotificationsBell />
            <button
              onClick={onToggleRight}
              aria-label="Abrir credenciales web3"
              className="shrink-0 w-9 h-9 flex items-center justify-center text-sm text-porcelain/70 hover:text-porcelain border border-mist rounded-full bg-graphite"
            >
              ⊞
            </button>
          </>
        )}
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
      className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm whitespace-nowrap shrink-0 transition-all ${
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
// Main Content
// ─────────────────────────────────────────────────────────────────────────────

function MainContent({ tab, isGuest, onLogin }: { tab: Tab; isGuest: boolean; onLogin: () => void }) {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-ink">
      {tab === "salud" && <MiSaludSection isGuest={isGuest} onLogin={onLogin} />}
      {tab === "especialistas" && <MarketplacePage />}
      {tab === "configuracion" && (
        isGuest
          ? <GuestGate label="Configuración" description="Gestiona tu wallet, consentimientos y perfil clínico." onLogin={onLogin} />
          : <PaymentsSection />
      )}
    </main>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Right Sidebar — Credenciales Web3
// ─────────────────────────────────────────────────────────────────────────────

function RightSidebar({
  open,
  onClose,
  isGuest,
}: {
  open: boolean;
  onClose: () => void;
  isGuest: boolean;
}) {
  const { user, logout } = usePrivy();
  const { wallets } = useWallets();
  const { isAuthenticated: convexOk } = useConvexAuth();
  const wallet = wallets[0];
  const address = wallet?.address;
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "—";

  // Datos en vivo de zkSYS Testnet (contratos Sephiem-Syscoin).
  const net = useSyscoinNetwork(address);

  return (
    <aside
      className={`fixed top-14 bottom-0 right-0 z-40 w-72 max-w-[85%] border-l border-mist bg-graphite flex flex-col overflow-hidden transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:bg-graphite/40 lg:visible ${
        open ? "translate-x-0" : "translate-x-full invisible"
      }`}
    >
      <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono">
          Credenciales Web3
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
        {isGuest ? (
          /* Guest: explicación de qué hay aquí */
          <div className="flex flex-col gap-3">
            <div className="border border-mist rounded-lg p-4 bg-graphite flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono">Wallet Web3</div>
              <div className="h-7 bg-mist/20 rounded animate-pulse" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-12 bg-mist/20 rounded animate-pulse" />
                <div className="h-12 bg-mist/20 rounded animate-pulse" />
              </div>
              <p className="text-[10px] text-porcelain/40 mt-1">Conecta para ver balance SYS y dirección</p>
            </div>
            <div className="border border-mist rounded-lg p-4 bg-graphite flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono">Red Blockchain</div>
              <div className="h-4 bg-mist/20 rounded animate-pulse" />
              <div className="h-4 bg-mist/20 rounded animate-pulse" />
              <p className="text-[10px] text-porcelain/40 mt-1">Syscoin zkSYS Testnet en tiempo real</p>
            </div>
            <div className="border border-mist rounded-lg p-4 bg-graphite flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono">Alertas de Salud</div>
              <p className="text-[10px] text-porcelain/40">Notificaciones generadas por SEPH-AI cuando detecta señales de alerta</p>
            </div>
          </div>
        ) : (
          <>
            {/* Wallet card */}
            <div className="border border-mist rounded-lg p-3 bg-graphite">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-porcelain/90 font-medium">Wallet Conectada</span>
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
              <div className="grid grid-cols-2 gap-2 mt-3">
                <BalanceCard label="Saldo SYS" value={net.balanceSys ?? "—"} symbol="SYS" />
                <BalanceCard label="Bloque" value={net.blockNumber !== null ? `#${net.blockNumber}` : "—"} symbol="" />
              </div>
              {address && (
                <a href={explorerAddress(address)} target="_blank" rel="noopener noreferrer"
                  className="block mt-2 text-[10px] text-royal-azure hover:underline font-mono truncate">
                  Ver en explorer ↗
                </a>
              )}
            </div>

            {/* Red activa */}
            <div className="border border-mist rounded-lg p-3 bg-graphite">
              <DataRow label="Red Activa:" value={net.online ? net.chainName : "Sin conexión RPC"} success={net.online} />
              <DataRow label="ID Cadena:" value={`${net.chainId} (zkSYS)`} mono />
              <DataRow label="Bloque Actual:" value={net.blockNumber !== null ? `#${net.blockNumber}` : "…"} mono />
              <DataRow label="Seguridad:" value="Privy ES256" mono last />
            </div>

            {/* Alertas de salud */}
            <div className="border border-mist rounded-lg p-3 bg-graphite flex-1 flex flex-col min-h-[160px]">
              <h3 className="text-[10px] uppercase tracking-widest text-porcelain/45 font-mono mb-3">Alertas de Salud (0)</h3>
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-2xl text-porcelain/25 mb-2">🔔</div>
                <p className="text-xs text-porcelain/50">Sin alertas activas</p>
                <p className="text-[10px] text-porcelain/35 mt-1 leading-snug max-w-[200px]">Generadas autónomamente por la bitácora médica</p>
              </div>
            </div>

            {/* Convex status */}
            <div className="border border-mist rounded-lg p-3 bg-graphite">
              <DataRow label="Privy UID:" value={user?.id ? `${user.id.slice(0, 12)}...` : "—"} mono />
              <DataRow label="Convex JWT:" value={convexOk ? "válido" : "conectando…"} success={convexOk} last />
            </div>
          </>
        )}
      </div>
    </aside>
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
