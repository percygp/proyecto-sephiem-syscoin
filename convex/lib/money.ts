/**
 * B12 (VAL-56) — Helpers de payout: split de comisión, hash y mock de tx.
 *
 * Nota de precisión: SYS tiene 18 decimales; aquí se opera con Number para el
 * split de comisión (suficiente para el rango de fees de consulta). Si se
 * requiere precisión exacta en producción, migrar a aritmética de enteros (wei).
 */

export const PLATFORM_FEE_PCT = 0.1; // 10%

/** Calcula comisión de plataforma y neto del especialista (strings SYS). */
export function computePayoutSplit(
  amountSYS: string,
  feePct: number = PLATFORM_FEE_PCT,
): { platformFeeSYS: string; amountToSpecialistSYS: string } {
  const amount = parseFloat(amountSYS);
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const fee = safe * feePct;
  const net = safe - fee;
  return {
    platformFeeSYS: fee.toFixed(8),
    amountToSpecialistSYS: net.toFixed(8),
  };
}

/** SHA-256 hex truncado (16 chars) — para logs/audit sin exponer el valor. */
export async function truncatedSha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

/** Genera un txHash simulado (mock testnet) — NO es una tx on-chain real. */
export function mockTxHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
