/**
 * A4 — requestWalletNonce
 *
 * Genera un nonce server-side bound al tokenIdentifier del usuario autenticado
 * con Privy. Single-use, TTL 5 minutos. Previene replay attack.
 *
 * Flujo:
 *  1. Frontend (autenticado con Privy) llama requestWalletNonce()
 *  2. Frontend construye mensaje: "Sephiem wallet verification nonce:${nonce}"
 *  3. Frontend pide a MetaMask firmar el mensaje
 *  4. Frontend envía { walletAddress, message, signature } a verifyWalletSignature
 *
 * Idempotencia (A7): si ya hay un nonce vigente para el mismo tokenIdentifier
 * lo retorna en vez de crear uno nuevo. Garantiza unicidad transaccional.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import { findExistingOrNull } from "../lib/unique";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export const requestWalletNonce = mutation({
  args: {},
  returns: v.object({
    nonce: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Privy JWT requerido para solicitar nonce",
      });
    }

    const now = Date.now();

    // Idempotencia + unicidad transaccional (A7):
    // by_tokenIdentifier garantiza máximo 1 registro por usuario.
    const existing = await findExistingOrNull(
      ctx,
      "walletNonces",
      "by_tokenIdentifier",
      (q) => q.eq("tokenIdentifier", identity.tokenIdentifier),
    );

    if (existing && existing.expiresAt > now) {
      return {
        nonce: existing.nonce,
        expiresAt: existing.expiresAt,
      };
    }

    // Si el existente expiró, borrarlo antes de insertar el nuevo.
    if (existing && existing.expiresAt <= now) {
      await ctx.db.delete("walletNonces", existing._id);
    }

    const nonce = crypto.randomUUID();
    const expiresAt = now + NONCE_TTL_MS;

    await ctx.db.insert("walletNonces", {
      tokenIdentifier: identity.tokenIdentifier,
      nonce,
      expiresAt,
    });

    return { nonce, expiresAt };
  },
});
