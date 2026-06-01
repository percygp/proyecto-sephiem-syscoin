# Feature Flags (B6 / VAL-50)

Gate centralizado de módulos vía la tabla `systemSettings` (union tipada por
key, índice `by_key`). Cada flag es una variante booleana del schema.

## Flags actuales

| Flag                 | Gatea                          | Default seed |
|----------------------|--------------------------------|--------------|
| `marketplaceEnabled` | Marketplace de especialistas   | `true`       |
| `appointmentsEnabled`| Agendamiento de citas          | `true`       |
| `paymentsEnabled`    | Flujos de pago                 | `true`       |

> Defaults `true` pensados para staging. Revisar para producción: gatean
> módulos de Fase 1 aún en construcción.

## Uso

Gatear una función (lanza si el flag está off):

```ts
import { requireFeatureFlag } from "../lib/featureFlags";

export const someMarketplaceMutation = mutation({
  // ...
  handler: async (ctx, args) => {
    await requireFeatureFlag(ctx, "marketplaceEnabled");
    // ... lógica protegida
  },
});
```

Lectura sin lanzar (UI condicional / lógica tolerante):

```ts
import { isFeatureEnabled } from "../lib/featureFlags";
const on = await isFeatureEnabled(ctx, "appointmentsEnabled");
```

Errores de `requireFeatureFlag`:

- `FEATURE_FLAG_NOT_FOUND` — no existe en `systemSettings` (falta `seed:seedAll`).
- `FEATURE_FLAG_TYPE_MISMATCH` — el valor no es booleano (corrupción).
- `FEATURE_FLAG_DISABLED` — existe pero está en `false`.

## Administración

- `admin/featureFlags.ts:toggleFeatureFlag({ flagKey, enabled })` — solo admin.
  Idempotente (upsert). Audita `FEATURE_FLAG_TOGGLED` (actor + flag).
- `admin/featureFlags.ts:getFeatureFlags()` — solo admin. Estado de todos los flags.

> Limitación: `auditLogs` no tiene campo metadata, por lo que el log registra
> quién y qué flag, no el valor anterior→nuevo. El valor vigente y su autor
> quedan en `systemSettings.value` / `updatedByProfileId` / `updatedAt`.

## Cómo agregar un flag nuevo

1. `convex/schema.ts` → añadir variante `v.object({ key: v.literal("<flag>"), value: v.boolean(), updatedAt: v.number(), updatedByProfileId: v.optional(v.id("profiles")) })` a la union `systemSettings`.
2. `convex/lib/featureFlags.ts` → añadir `"<flag>"` a `FEATURE_FLAG_KEYS`.
3. `convex/admin/featureFlags.ts` → añadir la literal a `flagKeyValidator` y al validador de `getFeatureFlags`.
4. `convex/seed.ts` → sembrar su default en `SYSTEM_SETTINGS_SEED`.
