/**
 * A15 — Sección de Pagos (paciente)
 *
 * Lista los invoices del paciente con su dirección de pago Syscoin, monto,
 * estado y countdown de expiración. Realtime via useQuery.
 *
 * El paciente envía SYS/USDT a la derivedAddress. El monitor de blockchain
 * (VPS futuro) detecta el pago y actualiza el estado automáticamente.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useWallets } from "@privy-io/react-auth";
import { api } from "../convex/_generated/api";
import { useSyscoin } from "./web3";
import { isPatient, getRecordsByPaciente, verifyIntegrity } from "./web3/client";
import { explorerTx } from "./web3/chain";
import type { Address, Hex } from "viem";

export function PaymentsSection() {
  const { wallets } = useWallets();
  const walletAddress = wallets[0]?.address;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1">Configuración</h1>
          <p className="text-sm text-porcelain/55">
            Gestiona tu cuenta e integraciones.
          </p>
        </div>

        <DiscordLinkCard />

        {walletAddress && (
          <div className="mt-8">
            <Web3IdentitySection walletAddress={walletAddress as Address} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Web3IdentitySection — identidad on-chain del paciente (zkSYS Testnet)
// ─────────────────────────────────────────────────────────────────────────────

function Web3IdentitySection({ walletAddress }: { walletAddress: Address }) {
  const syscoin = useSyscoin();

  const [registered, setRegistered] = useState<boolean | null>(null);
  const [records, setRecords] = useState<readonly Hex[] | null>(null);
  const [loadingIdentity, setLoadingIdentity] = useState(true);

  const [grantInput, setGrantInput] = useState("");
  const [revokeInput, setRevokeInput] = useState("");

  const [txState, setTxState] = useState<{
    action: string;
    status: "pending" | "ok" | "err";
    txHash?: Hex;
    error?: string;
  } | null>(null);

  const [verifyResults, setVerifyResults] = useState<Record<string, boolean | null>>({});

  // Load on-chain identity on mount and after txs
  const loadIdentity = useCallback(async () => {
    setLoadingIdentity(true);
    try {
      const [reg, recs] = await Promise.all([
        isPatient(walletAddress) as Promise<boolean>,
        getRecordsByPaciente(walletAddress) as Promise<readonly Hex[]>,
      ]);
      setRegistered(reg);
      setRecords(recs);
    } catch {
      setRegistered(null);
      setRecords(null);
    } finally {
      setLoadingIdentity(false);
    }
  }, [walletAddress]);

  useEffect(() => { void loadIdentity(); }, [loadIdentity]);

  async function doRegister() {
    setTxState({ action: "Registrando paciente…", status: "pending" });
    try {
      const txHash = await syscoin.registerPatient();
      setTxState({ action: "Registro completado", status: "ok", txHash });
      await loadIdentity();
    } catch (e) {
      setTxState({ action: "registerPatient", status: "err", error: (e as Error).message });
    }
  }

  async function doGrant() {
    if (!grantInput.trim()) return;
    setTxState({ action: "Concediendo acceso…", status: "pending" });
    try {
      const txHash = await syscoin.grantAccess(grantInput.trim() as Address);
      setTxState({ action: "Acceso concedido", status: "ok", txHash });
      setGrantInput("");
    } catch (e) {
      setTxState({ action: "grantAccess", status: "err", error: (e as Error).message });
    }
  }

  async function doRevoke() {
    if (!revokeInput.trim()) return;
    setTxState({ action: "Revocando acceso…", status: "pending" });
    try {
      const txHash = await syscoin.revokeAccess(revokeInput.trim() as Address);
      setTxState({ action: "Acceso revocado", status: "ok", txHash });
      setRevokeInput("");
    } catch (e) {
      setTxState({ action: "revokeAccess", status: "err", error: (e as Error).message });
    }
  }

  async function doVerify(recordId: Hex) {
    setVerifyResults((p) => ({ ...p, [recordId]: null }));
    try {
      const ok = await verifyIntegrity(recordId, recordId) as boolean;
      setVerifyResults((p) => ({ ...p, [recordId]: ok }));
    } catch {
      setVerifyResults((p) => ({ ...p, [recordId]: false }));
    }
  }

  return (
    <div className="border border-mist rounded-lg bg-graphite overflow-hidden">
      <div className="px-4 py-3 border-b border-mist flex items-center gap-2">
        <span className="text-sm font-semibold">Identidad Blockchain</span>
        <span className="text-[10px] font-mono text-porcelain/45 bg-ink px-1.5 py-0.5 rounded">zkSYS Testnet</span>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {/* Estado de registro */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-0.5">Estado on-chain</div>
            {loadingIdentity ? (
              <span className="text-xs text-porcelain/40 font-mono">Consultando…</span>
            ) : registered === null ? (
              <span className="text-xs text-soft-fawn font-mono">Error al leer contrato</span>
            ) : registered ? (
              <span className="text-xs text-success font-mono">✓ Registrado en PatientRegistry</span>
            ) : (
              <span className="text-xs text-porcelain/50 font-mono">No registrado on-chain</span>
            )}
          </div>
          {!loadingIdentity && !registered && (
            <button
              onClick={() => void doRegister()}
              disabled={txState?.status === "pending"}
              className="bg-royal-azure hover:bg-royal-azure/80 disabled:opacity-50 text-porcelain text-xs px-3 py-1.5 rounded transition-colors"
            >
              Registrar wallet
            </button>
          )}
        </div>

        {/* Grant access */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-1.5">
            Conceder acceso a médico
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={grantInput}
              onChange={(e) => setGrantInput(e.target.value)}
              placeholder="0x... wallet del médico"
              className="flex-1 bg-ink border border-mist rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-royal-azure/60"
            />
            <button
              onClick={() => void doGrant()}
              disabled={!grantInput.trim() || txState?.status === "pending"}
              className="bg-royal-azure/20 border border-royal-azure/40 text-royal-azure text-xs px-3 py-1.5 rounded hover:bg-royal-azure/30 disabled:opacity-40 transition-colors shrink-0"
            >
              Conceder
            </button>
          </div>
        </div>

        {/* Revoke access */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-1.5">
            Revocar acceso a médico
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={revokeInput}
              onChange={(e) => setRevokeInput(e.target.value)}
              placeholder="0x... wallet del médico"
              className="flex-1 bg-ink border border-mist rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-royal-azure/60"
            />
            <button
              onClick={() => void doRevoke()}
              disabled={!revokeInput.trim() || txState?.status === "pending"}
              className="bg-soft-fawn/10 border border-soft-fawn/30 text-soft-fawn text-xs px-3 py-1.5 rounded hover:bg-soft-fawn/20 disabled:opacity-40 transition-colors shrink-0"
            >
              Revocar
            </button>
          </div>
        </div>

        {/* TX feedback */}
        {txState && (
          <div className={`text-xs font-mono p-2 rounded border ${
            txState.status === "pending" ? "bg-royal-azure/10 border-royal-azure/30 text-royal-azure" :
            txState.status === "ok" ? "bg-success/10 border-success/30 text-success" :
            "bg-soft-fawn/10 border-soft-fawn/30 text-soft-fawn"
          }`}>
            {txState.status === "pending" && "⏳ "}
            {txState.status === "ok" && "✓ "}
            {txState.status === "err" && "✗ "}
            {txState.action}
            {txState.txHash && (
              <a
                href={explorerTx(txState.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 underline"
              >
                Ver tx →
              </a>
            )}
            {txState.error && <span className="block mt-0.5 text-[10px] break-all">{txState.error}</span>}
          </div>
        )}

        {/* Records on-chain */}
        {records !== null && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-porcelain/45 font-mono mb-1.5">
              Registros anclados ({records.length})
            </div>
            {records.length === 0 ? (
              <p className="text-xs text-porcelain/40 font-mono">Sin registros anclados aún.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {records.map((recordId) => (
                  <div key={recordId} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-ink border border-mist rounded px-2 py-2">
                    <code className="flex-1 text-[10px] font-mono text-porcelain/70 truncate min-w-0">{recordId}</code>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void doVerify(recordId)}
                        className="text-[10px] font-mono text-royal-azure hover:underline"
                      >
                        Verificar
                      </button>
                      {verifyResults[recordId] !== undefined && verifyResults[recordId] !== null && (
                        <span className={`text-[10px] font-mono ${verifyResults[recordId] ? "text-success" : "text-soft-fawn"}`}>
                          {verifyResults[recordId] ? "✓ íntegro" : "✗ alterado"}
                        </span>
                      )}
                      {verifyResults[recordId] === null && (
                        <span className="text-[10px] font-mono text-porcelain/40">…</span>
                      )}
                      <a
                        href={explorerTx(recordId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-porcelain/40 hover:text-porcelain"
                      >
                        Explorer →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DiscordLinkCard — vincula el Discord ID del paciente a su perfil SEPHIEM
// ─────────────────────────────────────────────────────────────────────────────


function DiscordLinkCard() {
  const profile = useQuery(api.auth.profiles.getMyProfile, {});
  const linkDiscord = useMutation(api.auth.profiles.linkDiscordAccount);
  const [discordId, setDiscordId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isLinked = !!profile?.discordId;

  async function handleLink(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = discordId.trim();
    if (!id || !/^\d{17,20}$/.test(id)) {
      setErrorMsg("El Discord ID debe ser un número de 17-20 dígitos. Usa !vincular en Discord para obtenerlo.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      await linkDiscord({ discordId: id });
      setStatus("ok");
      setDiscordId("");
    } catch (err) {
      setErrorMsg((err as Error).message ?? "Error al vincular la cuenta.");
      setStatus("error");
    }
  }

  return (
    <div className="bg-graphite border border-mist rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🎮</span>
        <div>
          <h2 className="text-sm font-semibold">Discord</h2>
          <p className="text-xs text-porcelain/55">
            Vincula tu cuenta para usar el bot SEPHIEM en Discord
          </p>
        </div>
        {isLinked && (
          <span className="ml-auto text-[10px] font-mono bg-success/10 border border-success/30 text-success px-2 py-0.5 rounded">
            ✓ Vinculado
          </span>
        )}
      </div>

      {isLinked ? (
        <div className="text-xs text-porcelain/60">
          <span className="font-mono bg-ink border border-mist rounded px-2 py-1">
            ID: {profile.discordId}
          </span>
        </div>
      ) : (
        <form onSubmit={(e) => void handleLink(e)} className="flex flex-col gap-3">
          <div className="text-xs text-porcelain/60 bg-ink border border-mist/50 rounded-lg p-3">
            <p className="font-medium text-porcelain/80 mb-1">¿Cómo obtener tu Discord ID?</p>
            <p>Ingresa al servidor de SEPHIEM y escribe <code className="bg-graphite px-1 rounded">!estado</code>. El bot te enviará tu ID por DM.{" "}<a href="https://discord.gg/hg5fmpEm" target="_blank" rel="noopener noreferrer" className="text-royal-azure underline hover:text-royal-azure/80">Unirse al servidor →</a></p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={discordId}
              onChange={(e) => { setDiscordId(e.target.value); setStatus("idle"); }}
              placeholder="Pega tu Discord ID aquí (ej: 717626543475654687)"
              className="flex-1 bg-ink border border-mist rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-royal-azure/60 placeholder:text-porcelain/30"
            />
            <button
              type="submit"
              disabled={status === "loading" || !discordId.trim()}
              className="bg-royal-azure hover:bg-royal-azure/90 disabled:opacity-40 text-porcelain text-xs font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              {status === "loading" ? "Vinculando…" : "Vincular"}
            </button>
          </div>
          {status === "ok" && (
            <p className="text-xs text-success">✓ Cuenta de Discord vinculada correctamente.</p>
          )}
          {status === "error" && (
            <p className="text-xs text-soft-fawn">✗ {errorMsg}</p>
          )}
        </form>
      )}
    </div>
  );
}
