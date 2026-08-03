/**
 * Normalize phone for wa.me (digits only, Israel-friendly).
 * Returns null if unusable.
 */
export function normalizeWhatsAppPhone(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 00xxx → xxx
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Local IL: 05xxxxxxxx → 9725xxxxxxxx
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `972${digits.slice(1)}`;
  }
  // Local without leading 0: 5xxxxxxxx (9 digits)
  if (digits.length === 9 && digits.startsWith("5")) {
    digits = `972${digits}`;
  }

  // Must look like an international mobile (at least country+number)
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}
