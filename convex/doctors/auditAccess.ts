/**
 * A12 — auditLogs de lectura de expediente clínico
 *
 * Convex queries NO pueden invocar mutations (son funciones puras). Por eso
 * la query getPatientDetail (A10) no puede registrar audit por sí misma.
 *
 * Patrón: el frontend dispara una mutation explícita logPatientRecordAccess
 * cuando un doctor/admin abre el expediente completo de un paciente. La UI
 * llama esta mutation desde un useEffect al cambiar de patientId.
 *
 * Idempotencia: la mutation NO deduplica — cada apertura genera un audit.
 * Esto es deliberado: queremos saber cuántas veces se accede al expediente.
 *
 * NO se audita la lectura ligera (lista de pacientes, header del paciente).
 * SOLO la apertura del expediente completo con historial clínico visible.
 */
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertPatientAccess } from "../lib/rbac";

export const logPatientRecordAccess = mutation({
  args: {
    patientId: v.id("patients"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    // RBAC: solo doctor asignado o admin pueden registrar (y por ende, leer)
    const { caller } = await assertPatientAccess(ctx, args.patientId);

    await ctx.runMutation(internal.audit.log, {
      actorProfileId: caller._id,
      actorType: caller.role === "admin" ? "admin" : "doctor",
      action: "PATIENT_RECORD_READ_FULL",
      targetId: args.patientId,
      targetType: "patient",
      channel: "web",
    });

    return { success: true };
  },
});
