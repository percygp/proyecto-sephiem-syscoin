/**
 * A9 — Validators runtime reutilizables
 *
 * Convex valida tipos (string, number, etc.) pero no formato ni rangos.
 * Estos helpers centralizan validaciones repetidas (E.164, ISO date, longitudes)
 * y lanzan ConvexError con códigos consistentes.
 *
 * Patrón de uso:
 *   assertE164Phone(args.phone, "phone");
 *   assertStringLength(args.name, 2, 100, "name");
 *
 * Lanzan ConvexError con codes INVALID_*.
 */
import { ConvexError } from "convex/values";

// ─────────────────────────────────────────────────────────────────────────────
// Predicados puros (return boolean)
// ─────────────────────────────────────────────────────────────────────────────

/** E.164: +<1-9><hasta 14 dígitos>, longitud total 8-16 caracteres */
export function isValidE164Phone(s: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(s);
}

/** ISO date YYYY-MM-DD; valida que sea fecha real (no 2026-02-31). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

/** Email: regex pragmático (no RFC 5322 completo). */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Dirección EVM (Syscoin NEVM): 0x + 40 hex. */
export function isValidEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Asserters (lanzan ConvexError o pasan silenciosamente)
// ─────────────────────────────────────────────────────────────────────────────

export function assertStringLength(
  value: string,
  min: number,
  max: number,
  field: string,
): void {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ConvexError({
      code: "INVALID_LENGTH",
      message: `'${field}' debe tener entre ${min} y ${max} caracteres (recibido: ${trimmed.length})`,
      field,
    });
  }
}

export function assertE164Phone(value: string, field: string): void {
  if (!isValidE164Phone(value)) {
    throw new ConvexError({
      code: "INVALID_PHONE",
      message: `'${field}' debe estar en formato E.164 (ej: +584141234567)`,
      field,
    });
  }
}

export function assertEmail(value: string, field: string): void {
  if (!isValidEmail(value)) {
    throw new ConvexError({
      code: "INVALID_EMAIL",
      message: `'${field}' no tiene formato de email válido`,
      field,
    });
  }
}

export function assertEvmAddress(value: string, field: string): void {
  if (!isValidEvmAddress(value)) {
    throw new ConvexError({
      code: "INVALID_WALLET_ADDRESS",
      message: `'${field}' debe ser una dirección EVM válida (0x + 40 hex)`,
      field,
    });
  }
}

/**
 * Fecha de nacimiento válida: ISO date, no en el futuro, no más de 130 años atrás.
 */
export function assertDateOfBirth(value: string, field: string): void {
  if (!isValidIsoDate(value)) {
    throw new ConvexError({
      code: "INVALID_DATE",
      message: `'${field}' debe ser una fecha ISO (YYYY-MM-DD)`,
      field,
    });
  }
  const dob = new Date(value + "T00:00:00Z").getTime();
  const now = Date.now();
  const yearsMs = 365.25 * 24 * 60 * 60 * 1000;
  if (dob > now) {
    throw new ConvexError({
      code: "INVALID_DATE_FUTURE",
      message: `'${field}' no puede estar en el futuro`,
      field,
    });
  }
  if (now - dob > 130 * yearsMs) {
    throw new ConvexError({
      code: "INVALID_DATE_TOO_OLD",
      message: `'${field}' no puede ser anterior a hace 130 años`,
      field,
    });
  }
}

/**
 * Lista acotada de allergies (o cualquier string[]): máx N items, cada uno con
 * longitud entre 1 y maxItemLength.
 */
export function assertBoundedStringArray(
  arr: string[],
  field: string,
  maxItems: number,
  maxItemLength: number,
): void {
  if (arr.length > maxItems) {
    throw new ConvexError({
      code: "INVALID_ARRAY_TOO_MANY",
      message: `'${field}' admite máximo ${maxItems} items (recibido: ${arr.length})`,
      field,
    });
  }
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i].trim();
    if (item.length === 0 || item.length > maxItemLength) {
      throw new ConvexError({
        code: "INVALID_ARRAY_ITEM_LENGTH",
        message: `'${field}[${i}]' debe tener 1-${maxItemLength} chars`,
        field,
      });
    }
  }
}
