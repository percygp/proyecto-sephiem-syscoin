/**
 * A4 — verifyWalletSignature (action) + consumeNonceAndSaveWallet (atomic)
 *
 * Flujo completo:
 *  1. Action recibe { walletAddress, message, signature }
 *  2. Action requireAuth → identity.tokenIdentifier
 *  3. Action llama viem.verifyMessage externamente
 *  4. Action delega a internalMutation atómica:
 *     - Verifica nonce existe + no expiró + coincide con el mensaje
 *     - Borra nonce (single-use)
 *     - Crea/obtiene profile
 *     - Patch profile.walletAddress
 *     - Inserta auditLogs WALLET_VERIFIED
 *
 * Toda la mutación de estado ocurre en UNA SOLA transacción Convex.
 */
import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { verifyMessage, isAddress } from "viem";
import { findExistingOrNull } from "../lib/unique";

// ─────────────────────────────────────────────────────────────────────────────
// Action: verifyWalletSignature
// ─────────────────────────────────────────────────────────────────────────────

export const verifyWalletSignature = action({
  args: {
    walletAddress: v.string(),
    message: v.string(),
    signature: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    profileId: v.id("profiles"),
    walletAddress: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    profileId: import("../_generated/dataModel").Id<"profiles">;
    walletAddress: string;
  }> => {
    // 1. Auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Privy JWT requerido",
      });
    }

    // 2. Validar formato de address
    if (!isAddress(args.walletAddress)) {
      throw new ConvexError({
        code: "INVALID_ADDRESS",
        message: "walletAddress no tiene formato 0x...",
      });
    }

    // 3. Extraer nonce del mensaje (formato esperado:
    //    "Sephiem wallet verification nonce:${nonce}")
    const nonceMatch = args.message.match(/nonce:([a-f0-9-]+)/i);
    if (!nonceMatch) {
      throw new ConvexError({
        code: "INVALID_MESSAGE_FORMAT",
        message: "El mensaje no contiene 'nonce:...'",
      });
    }
    const nonceFromMessage = nonceMatch[1];

    // 4. Verificar firma criptográficamente con viem (externo)
    let isValid = false;
    try {
      isValid = await verifyMessage({
        address: args.walletAddress as `0x${string}`,
        message: args.message,
        signature: args.signature as `0x${string}`,
      });
    } catch (err) {
      throw new ConvexError({
        code: "SIGNATURE_VERIFICATION_FAILED",
        message: `viem error: ${(err as Error).message}`,
      });
    }
    if (!isValid) {
      throw new ConvexError({
        code: "SIGNATURE_MISMATCH",
        message: "La firma no corresponde a la wallet declarada",
      });
    }

    // 5. Transacción atómica: consumir nonce + crear/patch profile + audit
    const result: { profileId: import("../_generated/dataModel").Id<"profiles"> } =
      await ctx.runMutation(internal.auth.walletVerify.consumeNonceAndSaveWallet, {
        tokenIdentifier: identity.tokenIdentifier,
        walletAddress: args.walletAddress,
        nonceFromMessage,
        email: identity.email,
        name: identity.name,
      });

    return {
      success: true,
      profileId: result.profileId,
      walletAddress: args.walletAddress,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// InternalMutation: consumeNonceAndSaveWallet (TRANSACCIÓN ÚNICA)
// ─────────────────────────────────────────────────────────────────────────────

export const consumeNonceAndSaveWallet = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    walletAddress: v.string(),
    nonceFromMessage: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  returns: v.object({
    profileId: v.id("profiles"),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    // a. Buscar nonce válido bound al tokenIdentifier (helper A7).
    // by_tokenIdentifier garantiza máximo 1 registro por usuario.
    const nonceRecord = await findExistingOrNull(
      ctx,
      "walletNonces",
      "by_tokenIdentifier",
      (q) => q.eq("tokenIdentifier", args.tokenIdentifier),
    );

    if (!nonceRecord) {
      throw new ConvexError({
        code: "NONCE_NOT_FOUND",
        message: "Solicita un nonce primero con requestWalletNonce",
      });
    }
    if (nonceRecord.expiresAt < now) {
      // Limpiar el nonce expirado antes de lanzar
      await ctx.db.delete(nonceRecord._id);
      throw new ConvexError({
        code: "NONCE_EXPIRED",
        message: "Nonce expiró. Solicita uno nuevo.",
      });
    }
    if (nonceRecord.nonce !== args.nonceFromMessage) {
      throw new ConvexError({
        code: "NONCE_MISMATCH",
        message: "El nonce del mensaje no coincide con el almacenado",
      });
    }

    // b. Single-use: borrar nonce inmediatamente
    await ctx.db.delete(nonceRecord._id);

    // c. Crear/obtener profile (helper A7 — by_tokenIdentifier es único)
    const profile = await findExistingOrNull(
      ctx,
      "profiles",
      "by_tokenIdentifier",
      (q) => q.eq("tokenIdentifier", args.tokenIdentifier),
    );

    let profileId: import("../_generated/dataModel").Id<"profiles">;
    if (!profile) {
      // Crear profile mínimo (versión completa de onboarding en A9)
      profileId = await ctx.db.insert("profiles", {
        tokenIdentifier: args.tokenIdentifier,
        walletAddress: args.walletAddress,
        role: "patient",
        name: args.name ?? "",
        email: args.email ?? "",
        isActive: true,
      });
    } else {
      profileId = profile._id;
      // d. Patch walletAddress verificada
      await ctx.db.patch(profile._id, { walletAddress: args.walletAddress });
    }

    // e. AuditLog WALLET_VERIFIED — vía módulo único (A6)
    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profileId,
      actorType: "patient",
      action: "WALLET_VERIFIED",
      targetId: profileId,
      targetType: "profile",
      channel: "web",
    });

    return { profileId };
  },
});
