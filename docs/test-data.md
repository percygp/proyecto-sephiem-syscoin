# Datos sintéticos de staging (B5 / VAL-49)

Genera datos **sintéticos** (sin PHI real) para probar Marketplace/Agendamiento
en staging.

## Ejecutar

```bash
npx convex run maintenance/seedTestData:seedTestData
```

Idempotente: si ya existe el perfil sentinel `test|spec-1`, no inserta nada
(`{ skipped: true }`).

## Qué crea

- **3 especialistas verificados** (perfil doctor + `marketplaceSpecialists`):
  Cardiología / Dermatología / Pediatría, `licenseNumber` `TEST-LIC-00X`,
  `jurisdiction` "Testland", wallet testnet `0x…`.
- **Disponibilidad** Lun-Vie 09:00-12:00 por especialista.
- **Slots disponibles** (mañana 09:00/09:30/10:00) para reservar de inmediato.
- **5 pacientes** ficticios (`isFictional=true`, emails `@test.sephiem.com`).
- **2 reseñas** sobre el especialista 1 (rating 5 y 4 → promedio 4.5) para
  validar el cálculo de rating en tiempo real.

## Regenerar desde cero

Borrar los registros de prueba (todos identificables: `tokenIdentifier`
`test|*`, emails `@test.sephiem.com`, `licenseNumber` `TEST-LIC-*`,
`patients.isFictional=true`) desde el dashboard de Convex y volver a ejecutar.

> Nota: implementado como `internalMutation` (no script `tsx`) para ser
> ejecutable/verificable vía `npx convex run` sin manejar admin key, y para
> insertar dentro de una transacción Convex.
