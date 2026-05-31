"use node";
/**
 * A21 — On-chain monitor via Convex cron + JSON-RPC
 *
 * Corre como cron cada 5 minutos. Consulta invoices pendientes y usa
 * eth_getLogs (JSON-RPC) para detectar transfers USDT a la derivedAddress.
 * También actualiza confirmaciones de payments en estado confirming.
 *
 * Sin HD_XPUB → no-op asumido (no hay invoices pendientes).
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const NETWORKS: Record<string, { rpcUrl: string; chainId: number }> = {
  syscoin_testnet: { rpcUrl: "https://rpc.tanenbaum.io", chainId: 5700 },
  syscoin_mainnet: { rpcUrl: "https://rpc.syscoin.org", chainId: 57 },
};

const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    console.error("[MONITOR] RPC error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  if (data.error) {
    console.error("[MONITOR] RPC error:", data.error);
    return null;
  }
  return data.result;
}

function padEvmAddress(address: string): string {
  const clean = address.replace("0x", "").toLowerCase();
  return "0x" + "0".repeat(24) + clean;
}

function padHex(hex: string): string {
  const clean = hex.replace("0x", "");
  return "0x" + (clean.length % 2 === 0 ? clean : "0" + clean);
}

export const monitorTransactions = internalAction({
  args: {
    network: v.optional(
      v.union(v.literal("syscoin_testnet"), v.literal("syscoin_mainnet")),
    ),
  },
  handler: async (ctx, args) => {
    const network = args.network ?? "syscoin_testnet";
    const cfg = NETWORKS[network];
    if (!cfg) {
      console.error("[MONITOR] Unknown network:", network);
      return;
    }

    const pendingInvoices = await ctx.runQuery(
      internal.payments.invoices.listPendingInvoices,
      {},
    );
    if (pendingInvoices.length === 0) {
      console.log("[MONITOR] No pending invoices, skipping");
      return;
    }

    const latestBlockRaw = await rpcCall(cfg.rpcUrl, "eth_blockNumber", []);
    if (!latestBlockRaw) return;
    const latestBlock = parseInt(latestBlockRaw as string, 16);
    console.log("[MONITOR] latestBlock:", latestBlock, "pending:", pendingInvoices.length);

    const fromBlock = Math.max(0, latestBlock - 2000);

    for (const invoice of pendingInvoices) {
      const address = invoice.derivedAddress;

      if (invoice.currency === "USDT" && invoice.tokenContractAddress) {
        const logs = (await rpcCall(cfg.rpcUrl, "eth_getLogs", [
          {
            address: invoice.tokenContractAddress,
            fromBlock: padHex(fromBlock.toString(16)),
            toBlock: "latest",
            topics: [
              TRANSFER_EVENT_TOPIC,
              null,
              padEvmAddress(address),
            ],
          },
        ])) as Array<{
          transactionHash: string;
          data: string;
          topics: string[];
          blockNumber: string;
          address: string;
        }> | null;

        if (!logs || logs.length === 0) continue;

        for (const log of logs) {
          const txHash = log.transactionHash;
          const rawAmount = log.data;
          const decimals = invoice.tokenDecimals;
          const divisor = BigInt(10) ** BigInt(decimals);
          const amountBig = BigInt(rawAmount);
          const amountStr =
            decimals > 0
              ? (Number(amountBig) / Number(divisor)).toFixed(decimals)
              : amountBig.toString();

          const fromAddress = "0x" + log.topics[1].slice(26);
          const txBlock = parseInt(log.blockNumber, 16);
          const confirmations = latestBlock - txBlock;

          try {
            const result = await ctx.runMutation(
              internal.payments.onChain.recordPayment,
              {
                invoiceId: invoice._id,
                walletAddress: fromAddress,
                txHash,
                amountReceived: amountStr,
                currency: "USDT",
                network,
                detectedChainId: cfg.chainId,
                currentConfirmations: confirmations,
                blockNumber: txBlock,
              },
            );
            console.log(
              `[MONITOR] Payment recorded: ${txHash} → ${result.status} (dup=${result.duplicate})`,
            );
          } catch (err) {
            console.error("[MONITOR] recordPayment error:", err);
          }
        }
      }
    }

    const confirmingPayments = await ctx.runQuery(
      internal.payments.onChain.listConfirmingPayments,
      {},
    );
    for (const payment of confirmingPayments) {
      if (!/^0x[0-9a-f]{64}$/i.test(payment.txHash)) {
        console.log("[MONITOR] Skipping invalid txHash:", payment.txHash);
        continue;
      }
      try {
        const receipt = (await rpcCall(cfg.rpcUrl, "eth_getTransactionReceipt", [
          payment.txHash,
        ])) as { blockNumber: string } | null;

        if (!receipt) continue;
        const txBlock = parseInt(receipt.blockNumber, 16);
        const confirmations = latestBlock - txBlock;

        if (confirmations !== payment.currentConfirmations || txBlock !== payment.blockNumber) {
          await ctx.runMutation(internal.payments.onChain.updateConfirmations, {
            txHash: payment.txHash,
            currentConfirmations: confirmations,
            blockNumber: txBlock,
          });
        }
      } catch (err) {
        console.error("[MONITOR] updateConfirmations error:", err);
      }
    }
  },
});

// listConfirmingPayments moved to convex/payments/onChain.ts (no "use node" conflict)
