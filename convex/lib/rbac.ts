/**
 * A5 — RBAC server-side
 *
 * Helpers de autorización que TODA función Convex que acceda a datos debe usar.
 * NUNCA aceptar profileId/patientId/doctorId como argumento de autorización:
 * la identidad se deriva server-side desde ctx.auth.getUserIdentity().
 *
 * Patrón estándar al inicio de una función:
 *   const profile = await requireAuth(ctx);          // cualquier rol activo
 *   const profile = await requireRole(ctx, "doctor"); // exige rol específico
 *   const profile = await requireAdmin(ctx);          // exige admin
 *
 * Para datos clínicos:
 *   const patient = await assertPatientAccess(ctx, patientId);
 *
 * Códigos de error consistentes:
 *   - UNAUTHENTICATED      → no hay JWT válido
 *   - PROFILE_NOT_FOUND    → JWT válido pero no hay registro en profiles
 *   - ACCOUNT_DISABLED     → profile.isActive === false
 *   - FORBIDDEN            → role insuficiente u ownership inválida
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

// Acepta tanto QueryCtx como MutationCtx — ambos tienen db.query y auth.
type AnyCtx = QueryCtx | MutationCtx;

type Role = "patient" | "doctor" | "admin";

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que haya un usuario autenticado con profile activo en la DB.
 * Retorna el documento profile completo.
 *
 * Lanza:
 *  - UNAUTHENTICATED si Convex no acepta el JWT (no hay identity)
 *  - PROFILE_NOT_FOUND si el JWT es válido pero el profile no existe aún
 *    (caso típico: el usuario hizo login con Privy pero todavía no completó
 *     la verificación de wallet que crea el profile — ver A4)
 *  - ACCOUNT_DISABLED si profile.isActive === false
 */
export async function requireAuth(ctx: AnyCtx): Promise<Doc<"profiles">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sesión requerida. Conecta tu wallet.",
    });
  }

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!profile) {
    throw new ConvexError({
      code: "PROFILE_NOT_FOUND",
      message:
        "No existe perfil para este usuario. Verifica tu wallet primero.",
    });
  }

  if (!profile.isActive) {
    throw new ConvexError({
      code: "ACCOUNT_DISABLED",
      message: "Cuenta deshabilitada. Contacta soporte.",
    });
  }

  return profile;
}

// ─────────────────────────────────────────────────────────────────────────────
// requireRole / requireAdmin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Como requireAuth + verifica que profile.role === roleExpected.
 * Lanza FORBIDDEN si el rol no coincide.
 */
export async function requireRole(
  ctx: AnyCtx,
  roleExpected: Role,
): Promise<Doc<"profiles">> {
  const profile = await requireAuth(ctx);
  if (profile.role !== roleExpected) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Esta acción requiere rol '${roleExpected}'. Tu rol: '${profile.role}'.`,
    });
  }
  return profile;
}

/** Atajo: requireRole(ctx, "admin"). */
export async function requireAdmin(ctx: AnyCtx): Promise<Doc<"profiles">> {
  return await requireRole(ctx, "admin");
}

/** Atajo: requireRole(ctx, "doctor"). */
export async function requireDoctor(ctx: AnyCtx): Promise<Doc<"profiles">> {
  return await requireRole(ctx, "doctor");
}

/** Atajo: requireRole(ctx, "patient"). */
export async function requirePatient(ctx: AnyCtx): Promise<Doc<"profiles">> {
  return await requireRole(ctx, "patient");
}

// ─────────────────────────────────────────────────────────────────────────────
// Ownership: acceso a recursos de paciente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que el caller tenga derecho a leer/modificar datos del paciente
 * indicado. Reglas:
 *  - admin: acceso a todo
 *  - patient: solo si patient.profileId === caller._id
 *  - doctor: solo si patient.assignedDoctorId apunta a un doctor cuyo
 *            profileId === caller._id
 *
 * Retorna { caller, patient, doctor? } para que la función llamadora reutilice
 * los documentos sin volver a leerlos.
 */
export async function assertPatientAccess(
  ctx: AnyCtx,
  patientId: Id<"patients">,
): Promise<{
  caller: Doc<"profiles">;
  patient: Doc<"patients">;
}> {
  const caller = await requireAuth(ctx);
  const patient = await ctx.db.get("patients", patientId);
  if (!patient) {
    throw new ConvexError({
      code: "PATIENT_NOT_FOUND",
      message: "Paciente no encontrado",
    });
  }

  // admin: todo
  if (caller.role === "admin") {
    return { caller, patient };
  }

  // patient: solo el suyo propio
  if (caller.role === "patient") {
    if (patient.profileId !== caller._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Solo puedes acceder a tus propios datos clínicos",
      });
    }
    return { caller, patient };
  }

  // doctor: solo si está asignado al paciente
  if (caller.role === "doctor") {
    if (!patient.assignedDoctorId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "El paciente no tiene médico asignado",
      });
    }
    const doctor = await ctx.db.get("doctors", patient.assignedDoctorId);
    if (!doctor || doctor.profileId !== caller._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "No estás asignado a este paciente",
      });
    }
    return { caller, patient };
  }

  // Cualquier otro rol imposible (typescript ya cubre el caso)
  throw new ConvexError({
    code: "FORBIDDEN",
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    message: `Rol '${caller.role}' no autorizado`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: getProfileFromIdentity (sin lanzar)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Versión "silenciosa" de requireAuth: retorna null en lugar de lanzar.
 * Útil para queries de UI que necesitan saber si hay sesión sin disparar
 * errores (ej: getMyProfile que muestra "no autenticado" en lugar de crashear).
 */
export async function getCallerProfile(
  ctx: AnyCtx,
): Promise<Doc<"profiles"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!profile || !profile.isActive) return null;
  return profile;
}
