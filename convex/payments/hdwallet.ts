"use node";
/**
 * A14 — HD wallet BIP44 derivation (Syscoin NEVM testnet/mainnet)
 *
 * deriveSyscoinAddress es una action que corre en Node runtime (necesario
 * para @scure/bip32 + viem). NO se ejecuta en runtime V8 por dependencias
 * crypto que no están en V8 estándar.
 *
 * Variables de entorno Convex (configurar con `npx convex env set`):
 *   - HD_XPUB_TESTNET  → xpub para Syscoin Tanenbaum (chainId 5700)
 *   - HD_XPUB_MAINNET  → xpub para Syscoin mainnet (chainId 57)
 *
 * Estos xpub se generan OFFLINE desde una seed BIP39 con paths:
 *   - Testnet: m/44'/57'/1'/0
 *   - Mainnet: m/44'/57'/0'/0
 *
 * Luego se exporta el xpub (clave pública extendida) y se carga en Convex env.
 * El seed/xprv NUNCA sale de la máquina offline.
 *
 * Si HD_XPUB_TESTNET no está configurado, la action lanza HD_WALLET_NOT_CONFIGURED.
 *
 * NOTA importante: Syscoin NEVM usa direcciones EVM (0x...), no las direcciones
 * legacy Syscoin (sys1...). La derivación retorna address EVM compatible.
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { ConvexError } from "convex/values";
import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3";

// ─────────────────────────────────────────────────────────────────────────────
// Helper puro: deriva address EVM desde xpub + index
// ─────────────────────────────────────────────────────────────────────────────

function deriveEvmAddressFromXpub(xpub: string, index: number): string {
  // 1. Parse xpub → HDKey
  const root = HDKey.fromExtendedKey(xpub);

  // 2. Path: relative al xpub que ya está derivado hasta m/44'/57'/N'/0
  //    Solo derivamos el índice del receptor: /index
  const child = root.deriveChild(index);
  if (!child.publicKey) {
    throw new ConvexError({
      code: "DERIVE_FAILED",
      message: "Derivación BIP32 sin publicKey",
    });
  }

  // 3. Compute EVM address from uncompressed pubkey (64 bytes sin el 0x04 prefix)
  //    HDKey.publicKey es compressed (33 bytes). Necesitamos uncompressed.
  //    @scure/bip32 expone publicKeyRaw como la versión compressed.
  //    Para EVM: keccak256(uncompressed_pubkey[1:]).slice(-20)
  //    Para evitar dependencias, usamos secp256k1 de @noble:
  return computeEvmAddress(child.publicKey);
}

/**
 * Compressed pubkey (33 bytes) → EVM address (0x + 40 hex chars).
 * Necesitamos uncompressed pubkey para la fórmula EVM estándar.
 * Hacemos descompresión usando @noble/curves implícitamente vía @scure/bip32
 * que ya lo incluye.
 */
function computeEvmAddress(compressedPubKey: Uint8Array): string {
  // @scure/bip32 publicKey es compressed (33 bytes). Para EVM necesitamos
  // descomprimir. Usamos point recovery via @noble/curves.
  // @scure/bip32 lo incluye como dep. Lo importamos dinámicamente para evitar
  // problemas si el peer no está presente.
  const { secp256k1 } = require("@noble/curves/secp256k1");
  const point = secp256k1.ProjectivePoint.fromHex(compressedPubKey);
  const uncompressed = point.toRawBytes(false); // 65 bytes con 0x04 prefix
  const xy = uncompressed.slice(1); // 64 bytes
  const hash = keccak_256(xy);
  const addr20 = hash.slice(-20);
  return "0x" + Buffer.from(addr20).toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: deriveSyscoinAddress
// ─────────────────────────────────────────────────────────────────────────────

export const deriveSyscoinAddress = internalAction({
  args: {
    network: v.union(v.literal("syscoin_testnet"), v.literal("syscoin_mainnet")),
    derivationIndex: v.number(),
  },
  returns: v.object({
    address: v.string(),
    network: v.string(),
    derivationIndex: v.number(),
  }),
  handler: async (_ctx, args) => {
    const envVar =
      args.network === "syscoin_testnet"
        ? process.env.HD_XPUB_TESTNET
        : process.env.HD_XPUB_MAINNET;

    if (!envVar) {
      throw new ConvexError({
        code: "HD_WALLET_NOT_CONFIGURED",
        message: `Variable de entorno ${
          args.network === "syscoin_testnet"
            ? "HD_XPUB_TESTNET"
            : "HD_XPUB_MAINNET"
        } no configurada. Ejecuta: npx convex env set HD_XPUB_TESTNET <xpub>`,
      });
    }

    if (args.derivationIndex < 0 || args.derivationIndex > 2_000_000_000) {
      throw new ConvexError({
        code: "INVALID_DERIVATION_INDEX",
        message:
          "derivationIndex debe estar en [0, 2_000_000_000] (BIP32 non-hardened)",
      });
    }

    let address: string;
    try {
      address = deriveEvmAddressFromXpub(envVar, args.derivationIndex);
    } catch (err) {
      throw new ConvexError({
        code: "DERIVE_FAILED",
        message: `Error derivando: ${(err as Error).message}`,
      });
    }

    return {
      address,
      network: args.network,
      derivationIndex: args.derivationIndex,
    };
  },
});
