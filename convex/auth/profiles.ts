/**
 * A4 — Profile bootstrap (versión temporal)
 *
 * Provee una función que obtiene o crea el profile del usuario autenticado
 * con Privy. Necesaria para que verifyWalletSignature pueda hacer patch del
 * walletAddress al profile.
 *
 * El onboarding completo (rol patient/doctor/admin + datos clínicos + consents)
 * se implementa en A9. Por ahora se crea con role="patient" e isActive=true
 * para que el flujo de A4 funcione end-to-end.
 *
 * Cuando llegue A5 (RBAC helper) y A9 (onboarding), esta función se
 * refactoriza para integrarse con el flujo de registro completo.
 */
import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getCallerProfile } from "../lib/rbac";
import { findExistingOrNull } from "../lib/unique";

/**
 * Query pública: obtiene el profile del usuario actual (si existe).
 * No crea — solo lee. Útil para que la UI sepa si ya está onboardeado.
 */
export const getMyProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("profiles"),
      _creationTime: v.number(),
      tokenIdentifier: v.string(),
      walletAddress: v.string(),
      role: v.union(
        v.literal("patient"),
        v.literal("doctor"),
        v.literal("admin"),
      ),
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      isActive: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    // Usa helper RBAC silencioso: retorna null si no hay sesión o profile.
    // Esta query la consume la UI para saber si mostrar onboarding/login.
    return await getCallerProfile(ctx);
  },
});

/**
 * InternalMutation: obtiene el profileId del tokenIdentifier dado, o lo crea
 * con valores mínimos si no existe. Idempotente.
 *
 * Llamada SOLO desde otras funciones server-side (verifyWalletSignature en A4
 * y onboarding en A9). No expuesta al cliente.
 *
 * Garantía de unicidad: by_tokenIdentifier .unique().
 */
export const ensureProfileForCurrentUser = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    walletAddress: v.string(),
    // Datos opcionales que puede pasar la action si los conoce
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({
    profileId: v.id("profiles"),
    created: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ profileId: Id<"profiles">; created: boolean }> => {
    const existing = await findExistingOrNull(
      ctx,
      "profiles",
      "by_tokenIdentifier",
      (q) => q.eq("tokenIdentifier", args.tokenIdentifier),
    );

    if (existing) {
      return { profileId: existing._id, created: false };
    }

    // Crear profile mínimo. El onboarding (nombre, email, role real) va en A9.
    const profileId = await ctx.db.insert("profiles", {
      tokenIdentifier: args.tokenIdentifier,
      walletAddress: args.walletAddress,
      role: "patient",
      name: args.name ?? "",
      email: args.email ?? "",
      isActive: true,
    });

    return { profileId, created: true };
  },
});

/**
 * InternalQuery: obtiene profileId por tokenIdentifier o lanza si no existe.
 * Para uso de mutations/actions que asumen el profile ya existe.
 */
export const getProfileIdByToken = internalMutation({
  args: { tokenIdentifier: v.string() },
  returns: v.id("profiles"),
  handler: async (ctx, args) => {
    const profile = await findExistingOrNull(
      ctx,
      "profiles",
      "by_tokenIdentifier",
      (q) => q.eq("tokenIdentifier", args.tokenIdentifier),
    );
    if (!profile) {
      throw new ConvexError({
        code: "PROFILE_NOT_FOUND",
        message: `No existe profile para tokenIdentifier: ${args.tokenIdentifier}`,
      });
    }
    return profile._id;
  },
});
