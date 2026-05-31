/**
 * A7 — Unicidad transaccional
 *
 * Convex NO tiene UNIQUE constraints nativas. ctx.db.insert siempre tiene
 * éxito. Para garantizar unicidad, se debe verificar dentro de la misma
 * mutation ANTES de insertar: como las mutations son transacciones atómicas,
 * el check + insert ocurren juntos sin condición de carrera.
 *
 * Estos helpers centralizan ese patrón para evitar copy-paste y garantizar
 * que el error siempre tenga la misma forma (ConvexError DUPLICATE).
 *
 * Patrón de uso típico antes de insertar:
 *
 *   await assertUnique(ctx, "profiles", "by_tokenIdentifier",
 *     q => q.eq("tokenIdentifier", id));
 *   const profileId = await ctx.db.insert("profiles", { tokenIdentifier: id, ... });
 *
 * Si ya existe un registro, assertUnique lanza ConvexError DUPLICATE y la
 * mutation hace rollback automático (no se inserta nada).
 */
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { TableNames } from "../_generated/dataModel";

// El callback que define el rango del índice. Usamos `any` aquí porque la
// firma exacta depende del índice (que es dinámico). Convex valida en runtime.
type IndexRangeFn = (q: any) => any;

/**
 * Verifica que NO existe ya un documento en `table` que coincida con el index
 * range dado. Si existe, lanza ConvexError DUPLICATE.
 *
 * @param ctx        MutationCtx (no funciona en QueryCtx — la verificación
 *                   debe ocurrir en la misma transacción que el insert)
 * @param table      Nombre de la tabla (tipado contra TableNames del schema)
 * @param indexName  Nombre del índice a usar (debe existir en el schema)
 * @param rangeFn    Callback que define el rango (mismo que .withIndex)
 * @param errorHint  Texto opcional adicional para el mensaje de error
 *
 * @throws ConvexError code="DUPLICATE" si ya existe un registro
 */
export async function assertUnique<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  indexName: string,
  rangeFn: IndexRangeFn,
  errorHint?: string,
): Promise<void> {
  // Cast a any: TypeScript no infiere bien queries dinámicas con índices
  // arbitrarios. Convex valida la existencia del índice en runtime.
  const existing = await (ctx.db.query(table) as any)
    .withIndex(indexName, rangeFn)
    .unique();

  if (existing !== null) {
    throw new ConvexError({
      code: "DUPLICATE",
      message:
        errorHint ??
        `Ya existe un registro en '${table}' con esos valores únicos`,
      table,
      indexName,
    });
  }
}

/**
 * Variante "consultar antes de actuar": retorna el documento existente si está,
 * o null. Útil para hacer mutations idempotentes (devolver lo ya existente en
 * vez de crear duplicado).
 *
 *   const existing = await findExistingOrNull(ctx, "walletNonces",
 *     "by_tokenIdentifier", q => q.eq("tokenIdentifier", id));
 *   if (existing && existing.expiresAt > now) return existing; // reutilizar
 *   // ... crear nuevo si no
 */
export async function findExistingOrNull<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  indexName: string,
  rangeFn: IndexRangeFn,
): Promise<any | null> {
  return await (ctx.db.query(table) as any)
    .withIndex(indexName, rangeFn)
    .unique();
}
