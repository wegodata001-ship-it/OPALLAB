import { LOWER_ARCH_ORDER, UPPER_ARCH_ORDER } from "@/lib/orders/bridge-groups";

const ARCHES: readonly (readonly number[])[] = [UPPER_ARCH_ORDER, LOWER_ARCH_ORDER];

/** Teeth between `from` and `to` inclusive along the same FDI arch (incl. midline). */
export function getArchRange(from: number, to: number): number[] | null {
  if (from === to) return [from];
  for (const arch of ARCHES) {
    const i = arch.indexOf(from);
    const j = arch.indexOf(to);
    if (i < 0 || j < 0) continue;
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    return Array.from(arch.slice(lo, hi + 1));
  }
  return null;
}

export function sameArch(a: number, b: number): boolean {
  return getArchRange(a, b) !== null;
}
