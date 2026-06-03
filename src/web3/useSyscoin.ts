import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  getAddress,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { zkTanenbaum } from "./chain";
import { CONTRACTS, RECORD_TYPE, type RecordType } from "./contracts";
import { publicClient } from "./client";
import { generateDocumentHash } from "./hash";

// ─────────────────────────────────────────────────────────────────────────────
// useSyscoinNetwork — datos de red en vivo (bloque + saldo SYS) para el panel
// "Credenciales Web3". Lecturas vía RPC público; no requiere firma.
// ─────────────────────────────────────────────────────────────────────────────

export interface SyscoinNetwork {
  chainId: number;
  chainName: string;
  blockNumber: bigint | null;
  balanceSys: string | null; // formateado, p.ej. "0.0000"
  online: boolean;
  loading: boolean;
}

export function useSyscoinNetwork(address?: string): SyscoinNetwork {
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [balanceSys, setBalanceSys] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const bn = await publicClient.getBlockNumber();
        if (cancelled) return;
        setBlockNumber(bn);
        setOnline(true);
        if (address) {
          const bal = await publicClient.getBalance({
            address: getAddress(address),
          });
          if (!cancelled) setBalanceSys(Number(formatEther(bal)).toFixed(4));
        } else {
          setBalanceSys(null);
        }
      } catch {
        if (!cancelled) setOnline(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void tick();
    const id = setInterval(() => void tick(), 12_000); // ~1 bloque
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  return {
    chainId: zkTanenbaum.id,
    chainName: zkTanenbaum.name,
    blockNumber,
    balanceSys,
    online,
    loading,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useSyscoin — escrituras on-chain firmadas con la wallet Privy/MetaMask activa.
// Reutiliza el mismo EIP-1193 provider que la verificación de wallet (App.tsx).
// ─────────────────────────────────────────────────────────────────────────────

export interface AnchorRecordParams {
  paciente: Address;
  tipo: RecordType;
  contenido: string;
  version?: string;
}

export interface AnchorRecordResult {
  recordId: Hex;
  hash: Hex;
  txHash: Hex;
  // Necesario para reproducir/verificar el hash a partir del documento persistido.
  timestamp: number;
}

export function useSyscoin() {
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const address = wallet?.address as Address | undefined;

  // Construye un walletClient viem desde el provider EIP-1193 de Privy,
  // garantizando que la wallet esté en zkSYS Testnet (switch/add si hace falta).
  const getWalletClient = useCallback(async (): Promise<{
    client: WalletClient;
    account: Address;
  }> => {
    if (!wallet || !address) throw new Error("Wallet no conectada");
    const provider = await wallet.getEthereumProvider();
    const client = createWalletClient({
      account: getAddress(address),
      chain: zkTanenbaum,
      transport: custom(provider),
    });
    try {
      await client.switchChain({ id: zkTanenbaum.id });
    } catch (error) {
      // Solo añadir la red cuando la wallet no la conoce (EIP-3326: code 4902).
      // El resto (4001 rechazo del usuario, errores transitorios) se propaga.
      const code = (error as { code?: number }).code;
      if (code !== 4902) throw error;
      await client.addChain({ chain: zkTanenbaum });
      await client.switchChain({ id: zkTanenbaum.id });
    }
    return { client, account: getAddress(address) };
  }, [wallet, address]);

  // Paciente se registra on-chain (idempotente: revierte si ya está registrado).
  const registerPatient = useCallback(async (): Promise<Hex> => {
    const { client, account } = await getWalletClient();
    const txHash = await client.writeContract({
      ...CONTRACTS.PatientRegistry,
      functionName: "registerPatient",
      account,
      chain: zkTanenbaum,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }, [getWalletClient]);

  // Paciente concede acceso a un médico.
  const grantAccess = useCallback(
    async (medico: Address): Promise<Hex> => {
      const { client, account } = await getWalletClient();
      const txHash = await client.writeContract({
        ...CONTRACTS.PatientRegistry,
        functionName: "grantAccess",
        args: [getAddress(medico)],
        account,
        chain: zkTanenbaum,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    },
    [getWalletClient],
  );

  // Paciente revoca acceso a un médico.
  const revokeAccess = useCallback(
    async (medico: Address): Promise<Hex> => {
      const { client, account } = await getWalletClient();
      const txHash = await client.writeContract({
        ...CONTRACTS.PatientRegistry,
        functionName: "revokeAccess",
        args: [getAddress(medico)],
        account,
        chain: zkTanenbaum,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    },
    [getWalletClient],
  );

  // Médico ancla (notariza) un documento clínico on-chain. El contenido NUNCA
  // se sube: solo su hash. Devuelve recordId extraído del evento.
  const anchorRecord = useCallback(
    async (params: AnchorRecordParams): Promise<AnchorRecordResult> => {
      const { client, account } = await getWalletClient();
      // Capturar el timestamp para devolverlo y permitir reconstruir el hash.
      const timestamp = Date.now();
      const hash = generateDocumentHash({
        tipo: params.tipo,
        paciente: params.paciente,
        medico: account,
        contenido: params.contenido,
        timestamp,
      });
      const txHash = await client.writeContract({
        ...CONTRACTS.MedicalRecordRegistry,
        functionName: "registerRecord",
        args: [hash, getAddress(params.paciente), params.tipo, params.version ?? "1.0"],
        account,
        chain: zkTanenbaum,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      // Extraer recordId del evento RecordRegistered.
      let recordId: Hex = hash;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: CONTRACTS.MedicalRecordRegistry.abi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "RecordRegistered") {
            recordId = (decoded.args as { recordId: Hex }).recordId;
            break;
          }
        } catch {
          // log de otro contrato/evento — ignorar
        }
      }
      return { recordId, hash, txHash, timestamp };
    },
    [getWalletClient],
  );

  return useMemo(
    () => ({
      address,
      ready: !!wallet,
      RECORD_TYPE,
      registerPatient,
      grantAccess,
      revokeAccess,
      anchorRecord,
    }),
    [address, wallet, registerPatient, grantAccess, revokeAccess, anchorRecord],
  );
}
