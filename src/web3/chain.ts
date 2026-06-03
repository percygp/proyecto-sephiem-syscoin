import { defineChain } from "viem";

// zkSYS Testnet (zkTanenbaum) — red donde están desplegados los contratos
// del proyecto Sephiem-Syscoin. Ver proyecto-sephiem-syscoin/DOCUMENTACION.md.
export const zkTanenbaum = defineChain({
  id: 57057,
  name: "zkSYS Testnet",
  nativeCurrency: { name: "Syscoin", symbol: "SYS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-zk.tanenbaum.io"] },
  },
  blockExplorers: {
    default: {
      name: "zkTanenbaum Explorer",
      url: "https://explorer-zk.tanenbaum.io",
    },
  },
  testnet: true,
});

export const EXPLORER_URL = zkTanenbaum.blockExplorers.default.url;

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}
