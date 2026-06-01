/**
 * B6 (VAL-50) — Feature flags centralizados
 *
 * Lee flags booleanos desde la tabla `systemSettings` (discriminated union
 * tipada por key, índice `by_key`). Punto único de verificación de flags para
 * gatear módulos de Fase 1 (marketplace, appointments, payments).
 *
 * Patrón de uso al inicio de una mutation/query que un flag protege:
 *   await requireFeatureFlag(ctx, "marketplaceEnabled");
 *
 * Para UI condicional sin lanzar:
 *   const on = await isFeatureEnabled(ctx, "marketplaceEnabled");
 *
 * Para AÑADIR un flag nuevo:
 *   1. Agregar la variante `v.object({ key: v.literal("<flag>"), value: v.boolean(), ... })`
 *      a la union `systemSettings` en convex/schema.ts.
 *   2. Agregar `"<flag>"` a FEATURE_FLAG_KEYS aquí abajo.
 *   3. Sembrar su valor por defecto en convex/seed.ts (FEATURE_FLAGS_SEED).
 */
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";

type AnyCtx = QueryCtx | MutationCtx;

/** Claves de feature flag válidas (deben existir como variante boolean en el schema). */
export const FEATURE_FLAG_KEYS = [
  "marketplaceEnabled",
  "appointmentsEnabled",
  "paymentsEnabled",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/**
 * Lee el valor booleano de un feature flag sin lanzar.
 * Retorna `false` si el flag no existe o está deshabilitado.
 */
export async function isFeatureEnabled(
  ctx: AnyCtx,
  flagKey: FeatureFlagKey,
): Promise<boolean> {
  const setting = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", flagKey))
    .unique();

  if (!setting || typeof setting.value !== "boolean") return false;
  return setting.value;
}

/**
 * Exige que un feature flag esté presente, sea booleano y esté habilitado.
 * Lanza ConvexError descriptivo en caso contrario.
 *
 *  - FEATURE_FLAG_NOT_FOUND → el flag no existe en systemSettings (falta seed)
 *  - FEATURE_FLAG_TYPE_MISMATCH → el valor no es booleano (corrupción de datos)
 *  - FEATURE_FLAG_DISABLED → el flag existe pero está en false
 */
export async function requireFeatureFlag(
  ctx: AnyCtx,
  flagKey: FeatureFlagKey,
): Promise<true> {
  const setting = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", flagKey))
    .unique();

  if (!setting) {
    throw new ConvexError({
      code: "FEATURE_FLAG_NOT_FOUND",
      message: `Feature flag "${flagKey}" no existe. Ejecuta seed:seedAll.`,
    });
  }

  if (typeof setting.value !== "boolean") {
    throw new ConvexError({
      code: "FEATURE_FLAG_TYPE_MISMATCH",
      message: `Feature flag "${flagKey}" esperaba boolean pero es ${typeof setting.value}.`,
    });
  }

  if (!setting.value) {
    throw new ConvexError({
      code: "FEATURE_FLAG_DISABLED",
      message: `Feature flag "${flagKey}" está deshabilitado.`,
    });
  }

  return true;
}
