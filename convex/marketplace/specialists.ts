/**
 * B8 (VAL-52) — Backend Marketplace de especialistas
 *
 * SEGURIDAD:
 *  - `walletAddress` NUNCA se expone en queries públicas (getSpecialists/Detail).
 *    Solo se devuelve vía getSpecialistPayoutWallet a admin u owner, y ese
 *    acceso se audita (SPECIALIST_WALLET_ACCESSED).
 *  - Todas las MUTATIONS verifican el feature flag `marketplaceEnabled`.
 *  - El rating se calcularía en tiempo real desde `specialistReviews`, pero esa
 *    tabla se añade en VAL-54 [B10]; hasta entonces `rating` se devuelve null.
 *
 * Nota auditoría: auditLogs no tiene campo metadata, por lo que el log registra
 * actor + targetId(specialistId) + action, no el hash de la wallet.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { paginationOptsValidator } from "convex/server";
import { requireAuth, requireAdmin, getCallerProfile } from "../lib/rbac";
import { requireFeatureFlag } from "../lib/featureFlags";
import { assertStringLength, assertEvmAddress } from "../lib/validation";
import { assertUnique } from "../lib/unique";
import { computeSpecialistRating } from "./reviews";

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * registerAsSpecialist (pública, requiere auth).
 * Crea un marketplaceSpecialist con isVerifiedByAdmin=false. Único por profileId.
 */
export const registerAsSpecialist = mutation({
  args: {
    licenseNumber: v.string(),
    jurisdiction: v.string(),
    walletAddress: v.string(),
    specialty: v.string(),
    consultationFeeSYS: v.string(),
    description: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
  },
  returns: v.id("marketplaceSpecialists"),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "marketplaceEnabled");
    const profile = await requireAuth(ctx);

    assertStringLength(args.licenseNumber, 1, 100, "licenseNumber");
    assertStringLength(args.jurisdiction, 1, 100, "jurisdiction");
    assertStringLength(args.specialty, 1, 100, "specialty");
    assertStringLength(args.consultationFeeSYS, 1, 50, "consultationFeeSYS");
    assertEvmAddress(args.walletAddress, "walletAddress");

    // Único por profile: un especialista por usuario.
    await assertUnique(
      ctx,
      "marketplaceSpecialists",
      "by_profileId",
      (q) => q.eq("profileId", profile._id),
      "Este perfil ya está registrado como especialista",
    );

    const now = Date.now();
    const specialistId = await ctx.db.insert("marketplaceSpecialists", {
      profileId: profile._id,
      licenseNumber: args.licenseNumber.trim(),
      jurisdiction: args.jurisdiction.trim(),
      walletAddress: args.walletAddress,
      isVerifiedByAdmin: false,
      specialty: args.specialty.trim(),
      description: args.description,
      consultationFeeSYS: args.consultationFeeSYS.trim(),
      yearsOfExperience: args.yearsOfExperience,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: profile.role,
      action: "SPECIALIST_REGISTERED",
      targetId: specialistId,
      channel: "web",
    });

    return specialistId;
  },
});

/**
 * approveSpecialist (solo admin). Marca isVerifiedByAdmin=true.
 */
export const approveSpecialist = mutation({
  args: {
    specialistId: v.id("marketplaceSpecialists"),
  },
  returns: v.object({ specialistId: v.id("marketplaceSpecialists"), verified: v.boolean() }),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "marketplaceEnabled");
    const admin = await requireAdmin(ctx);

    const specialist = await ctx.db.get("marketplaceSpecialists", args.specialistId);
    if (!specialist) {
      throw new ConvexError({
        code: "SPECIALIST_NOT_FOUND",
        message: "Especialista no encontrado",
      });
    }

    await ctx.db.patch("marketplaceSpecialists", specialist._id, {
      isVerifiedByAdmin: true,
      updatedAt: Date.now(),
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "SPECIALIST_APPROVED",
      targetId: specialist._id,
      channel: "web",
    });

    return { specialistId: specialist._id, verified: true };
  },
});

/**
 * getSpecialistPayoutWallet (admin u owner). Devuelve la walletAddress completa
 * SOLO a admin o al dueño del perfil. Es mutation (no query) porque audita el
 * acceso, y las queries de Convex no pueden escribir.
 */
export const getSpecialistPayoutWallet = mutation({
  args: {
    specialistId: v.id("marketplaceSpecialists"),
  },
  returns: v.object({ walletAddress: v.string() }),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "marketplaceEnabled");
    const caller = await requireAuth(ctx);

    const specialist = await ctx.db.get("marketplaceSpecialists", args.specialistId);
    if (!specialist) {
      throw new ConvexError({
        code: "SPECIALIST_NOT_FOUND",
        message: "Especialista no encontrado",
      });
    }

    const isOwner = specialist.profileId === caller._id;
    if (caller.role !== "admin" && !isOwner) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Solo admin o el dueño pueden ver la wallet de payout",
      });
    }

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: caller._id,
      actorType: caller.role,
      action: "SPECIALIST_WALLET_ACCESSED",
      targetId: specialist._id,
      channel: "web",
    });

    return { walletAddress: specialist.walletAddress };
  },
});

/**
 * registerSpecialistAsAdmin — admin agrega un especialista directamente,
 * marcándolo como verificado sin necesitar auto-registro previo.
 */
export const registerSpecialistAsAdmin = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    walletAddress: v.string(),
    licenseNumber: v.string(),
    jurisdiction: v.string(),
    specialty: v.string(),
    consultationFeeSYS: v.string(),
    description: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
  },
  returns: v.id("marketplaceSpecialists"),
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "marketplaceEnabled");
    const admin = await requireAdmin(ctx);

    assertStringLength(args.name, 1, 150, "name");
    assertStringLength(args.email, 3, 200, "email");
    assertStringLength(args.licenseNumber, 1, 100, "licenseNumber");
    assertStringLength(args.jurisdiction, 1, 100, "jurisdiction");
    assertStringLength(args.specialty, 1, 100, "specialty");
    assertStringLength(args.consultationFeeSYS, 1, 50, "consultationFeeSYS");
    assertEvmAddress(args.walletAddress, "walletAddress");

    // Crear perfil temporal para el especialista
    const profileId = await ctx.db.insert("profiles", {
      tokenIdentifier: `admin-created:${args.walletAddress.toLowerCase()}`,
      walletAddress: args.walletAddress.toLowerCase(),
      role: "doctor",
      name: args.name.trim(),
      email: args.email.trim(),
      isActive: true,
    });

    // Verificar unicidad por walletAddress en marketplaceSpecialists
    const existing = await ctx.db
      .query("marketplaceSpecialists")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .unique();
    if (existing) throw new ConvexError({ code: "ALREADY_EXISTS", message: "Especialista ya registrado" });

    const now = Date.now();
    const specialistId = await ctx.db.insert("marketplaceSpecialists", {
      profileId,
      licenseNumber: args.licenseNumber.trim(),
      jurisdiction: args.jurisdiction.trim(),
      walletAddress: args.walletAddress.toLowerCase(),
      isVerifiedByAdmin: true,
      isVerifiedOnChain: false,
      specialty: args.specialty.trim(),
      description: args.description,
      consultationFeeSYS: args.consultationFeeSYS.trim(),
      yearsOfExperience: args.yearsOfExperience,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "SPECIALIST_REGISTERED",
      targetId: specialistId,
      channel: "web",
    });

    return specialistId;
  },
});

/**
 * markSpecialistOnChainVerified — admin marca que el especialista fue
 * registrado en DoctorRegistry on-chain (después de firmar la tx en el frontend).
 */
export const markSpecialistOnChainVerified = mutation({
  args: { specialistId: v.id("marketplaceSpecialists") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const specialist = await ctx.db.get("marketplaceSpecialists", args.specialistId);
    if (!specialist) throw new ConvexError({ code: "NOT_FOUND", message: "Especialista no encontrado" });

    await ctx.db.patch(args.specialistId, { isVerifiedOnChain: true, updatedAt: Date.now() });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: admin._id,
      actorType: "admin",
      action: "SPECIALIST_APPROVED",
      targetId: args.specialistId,
      channel: "web",
    });

    return null;
  },
});

/**
 * listSpecialistsForAdmin — lista todos los especialistas (pendientes + verificados)
 * para gestión interna. Devuelve walletAddress solo a admin.
 */
export const listSpecialistsForAdmin = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("marketplaceSpecialists"),
    name: v.string(),
    specialty: v.string(),
    licenseNumber: v.string(),
    walletAddress: v.string(),
    isVerifiedByAdmin: v.boolean(),
    isVerifiedOnChain: v.optional(v.boolean()),
    consultationFeeSYS: v.string(),
    createdAt: v.number(),
  })),
  handler: async (ctx) => {
    const caller = await getCallerProfile(ctx);
    if (!caller || caller.role !== "admin") return [];

    const all = await ctx.db.query("marketplaceSpecialists").order("desc").collect();
    return Promise.all(all.map(async (s) => {
      const profile = await ctx.db.get("profiles", s.profileId);
      return {
        _id: s._id,
        name: profile?.name ?? "",
        specialty: s.specialty,
        licenseNumber: s.licenseNumber,
        walletAddress: s.walletAddress,
        isVerifiedByAdmin: s.isVerifiedByAdmin,
        isVerifiedOnChain: s.isVerifiedOnChain,
        consultationFeeSYS: s.consultationFeeSYS,
        createdAt: s.createdAt,
      };
    }));
  },
});

/**
 * getSpecialistWalletForBooking — devuelve walletAddress al paciente autenticado
 * ÚNICAMENTE para firmar bookAppointment en AppointmentRegistry. No mostrar en UI.
 */
export const getSpecialistWalletForBooking = query({
  args: { specialistId: v.id("marketplaceSpecialists") },
  returns: v.union(v.object({ walletAddress: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const caller = await getCallerProfile(ctx);
    if (!caller || caller.role !== "patient") return null;

    const specialist = await ctx.db.get("marketplaceSpecialists", args.specialistId);
    if (!specialist || !specialist.isVerifiedByAdmin) return null;

    return { walletAddress: specialist.walletAddress };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries públicas (NUNCA exponen walletAddress)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getSpecialists (pública, paginada). Solo especialistas verificados.
 * Filtros opcionales (specialty exacto, maxFee) se aplican dentro de la página.
 * `rating` es null hasta VAL-54 (specialistReviews).
 */
export const getSpecialists = query({
  args: {
    paginationOpts: paginationOptsValidator,
    specialty: v.optional(v.string()),
    maxFee: v.optional(v.number()),
    minRating: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("marketplaceSpecialists"),
        _creationTime: v.number(),
        name: v.string(),
        specialty: v.string(),
        isVerifiedByAdmin: v.boolean(),
        isVerifiedOnChain: v.optional(v.boolean()),
        consultationFeeSYS: v.string(),
        yearsOfExperience: v.optional(v.number()),
        rating: v.union(v.number(), v.null()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("marketplaceSpecialists")
      .withIndex("by_isVerifiedByAdmin", (q) => q.eq("isVerifiedByAdmin", true))
      .order("desc")
      .paginate(args.paginationOpts);

    const enriched = await Promise.all(
      result.page.map(async (s) => {
        const [{ rating }, profile] = await Promise.all([
          computeSpecialistRating(ctx, s._id),
          ctx.db.get("profiles", s.profileId),
        ]);
        return {
          _id: s._id,
          _creationTime: s._creationTime,
          name: profile?.name ?? "",
          specialty: s.specialty,
          isVerifiedByAdmin: s.isVerifiedByAdmin,
          isVerifiedOnChain: s.isVerifiedOnChain,
          consultationFeeSYS: s.consultationFeeSYS,
          yearsOfExperience: s.yearsOfExperience,
          rating,
        };
      }),
    );
    const page = enriched.filter((s) => {
      if (args.specialty && s.specialty !== args.specialty) return false;
      if (args.maxFee !== undefined) {
        const fee = parseFloat(s.consultationFeeSYS);
        if (!Number.isNaN(fee) && fee > args.maxFee) return false;
      }
      if (args.minRating !== undefined) {
        if (s.rating === null || s.rating < args.minRating) return false;
      }
      return true;
    });

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      splitCursor: result.splitCursor,
      pageStatus: result.pageStatus,
    };
  },
});

/**
 * getSpecialistDetail (pública). Detalle de un especialista verificado.
 * NUNCA devuelve walletAddress; solo `walletVerified: boolean`.
 */
export const getSpecialistDetail = query({
  args: {
    specialistId: v.id("marketplaceSpecialists"),
  },
  returns: v.union(
    v.object({
      _id: v.id("marketplaceSpecialists"),
      name: v.string(),
      specialty: v.string(),
      licenseNumber: v.string(),
      jurisdiction: v.string(),
      yearsOfExperience: v.optional(v.number()),
      consultationFeeSYS: v.string(),
      description: v.optional(v.string()),
      rating: v.union(v.number(), v.null()),
      isVerifiedOnChain: v.optional(v.boolean()),
      walletVerified: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const specialist = await ctx.db.get("marketplaceSpecialists", args.specialistId);
    // Solo visible si existe y está verificado.
    if (!specialist || !specialist.isVerifiedByAdmin) return null;

    const profile = await ctx.db.get("profiles", specialist.profileId);
    const { rating } = await computeSpecialistRating(ctx, specialist._id);

    return {
      _id: specialist._id,
      name: profile?.name ?? "",
      specialty: specialist.specialty,
      licenseNumber: specialist.licenseNumber,
      jurisdiction: specialist.jurisdiction,
      yearsOfExperience: specialist.yearsOfExperience,
      consultationFeeSYS: specialist.consultationFeeSYS,
      description: specialist.description,
      rating,
      isVerifiedOnChain: specialist.isVerifiedOnChain,
      walletVerified: specialist.walletAddress.length > 0,
    };
  },
});
