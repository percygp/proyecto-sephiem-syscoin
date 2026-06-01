/**
 * B15 (VAL-59) — Reseñas de especialistas
 *
 * createSpecialistReview: una reseña por cita completada (unicidad transaccional
 * vía índice by_appointmentId + .unique()). Sin `comment` libre (riesgo PHI).
 * El rating promedio se calcula en tiempo real (computeSpecialistRating); no se
 * almacena.
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAuth } from "../lib/rbac";
import { assertUnique } from "../lib/unique";

/** Rating promedio (1-5) y count, en tiempo real desde specialistReviews. */
export async function computeSpecialistRating(
  ctx: QueryCtx,
  specialistId: Id<"marketplaceSpecialists">,
): Promise<{ rating: number | null; count: number }> {
  const reviews = await ctx.db
    .query("specialistReviews")
    .withIndex("by_specialistId", (q) => q.eq("specialistId", specialistId))
    .collect();
  if (reviews.length === 0) return { rating: null, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { rating: sum / reviews.length, count: reviews.length };
}

export const createSpecialistReview = mutation({
  args: {
    appointmentId: v.id("appointments"),
    rating: v.number(),
  },
  returns: v.id("specialistReviews"),
  handler: async (ctx, args) => {
    const profile = await requireAuth(ctx);

    if (
      !Number.isInteger(args.rating) ||
      args.rating < 1 ||
      args.rating > 5
    ) {
      throw new ConvexError({
        code: "INVALID_RATING",
        message: "El rating debe ser un entero entre 1 y 5",
      });
    }

    const appointment = await ctx.db.get("appointments", args.appointmentId);
    if (!appointment || appointment.status !== "completed") {
      throw new ConvexError({
        code: "APPOINTMENT_NOT_COMPLETED",
        message: "Solo se pueden reseñar citas completadas",
      });
    }

    // Solo el paciente dueño de la cita puede reseñar.
    const patient = await ctx.db.get("patients", appointment.patientId);
    if (!patient || patient.profileId !== profile._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Solo el paciente de la cita puede dejar una reseña",
      });
    }

    // Unicidad transaccional: una reseña por cita.
    await assertUnique(
      ctx,
      "specialistReviews",
      "by_appointmentId",
      (q) => q.eq("appointmentId", args.appointmentId),
      "Ya existe una reseña para esta cita",
    );

    const reviewId = await ctx.db.insert("specialistReviews", {
      appointmentId: args.appointmentId,
      specialistId: appointment.specialistId,
      patientProfileId: profile._id,
      rating: args.rating,
      createdAt: Date.now(),
    });

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: profile._id,
      actorType: profile.role,
      action: "REVIEW_CREATED",
      targetId: reviewId,
      channel: "web",
    });

    return reviewId;
  },
});
