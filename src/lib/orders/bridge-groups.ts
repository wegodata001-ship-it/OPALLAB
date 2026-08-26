/**
 * FDI bridge groups — explicit pairs along arch order (not numeric FDI).
 * Arch order follows clinical adjacency (including midline 11↔21 / 41↔31).
 */

export const UPPER_ARCH_ORDER = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
] as const;

export const LOWER_ARCH_ORDER = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
] as const;

const ARCHES: readonly (readonly number[])[] = [UPPER_ARCH_ORDER, LOWER_ARCH_ORDER];

/** Adjacent tooth pairs in arch display order. */
export function listArchAdjacentPairs(): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const arch of ARCHES) {
    for (let i = 0; i < arch.length - 1; i++) {
      pairs.push([arch[i]!, arch[i + 1]!]);
    }
  }
  return pairs;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** True when a and b are neighbors on the same arch. */
export function areArchAdjacent(a: number, b: number): boolean {
  for (const arch of ARCHES) {
    const i = arch.indexOf(a);
    const j = arch.indexOf(b);
    if (i < 0 || j < 0) continue;
    return Math.abs(i - j) === 1;
  }
  return false;
}

export function isBridgePairActive(groups: number[][], a: number, b: number): boolean {
  const key = pairKey(a, b);
  return groups.some((g) => g.length === 2 && pairKey(g[0]!, g[1]!) === key);
}

/** Toggle a single adjacent bridge pair. Returns new groups array. */
export function toggleBridgePair(groups: number[][], a: number, b: number): number[][] {
  if (!areArchAdjacent(a, b)) return groups;
  const key = pairKey(a, b);
  const exists = groups.some((g) => g.length === 2 && pairKey(g[0]!, g[1]!) === key);
  if (exists) {
    return groups.filter((g) => !(g.length === 2 && pairKey(g[0]!, g[1]!) === key));
  }
  for (const arch of ARCHES) {
    const i = arch.indexOf(a);
    const j = arch.indexOf(b);
    if (i < 0 || j < 0) continue;
    const ordered: [number, number] = i < j ? [a, b] : [b, a];
    return [...groups, ordered];
  }
  return groups;
}

/** Drop bridges that reference teeth no longer selected. */
export function pruneBridgeGroups(groups: number[][], selectedTeeth: number[]): number[][] {
  const selected = new Set(selectedTeeth);
  return groups.filter((g) => g.length >= 2 && g.every((t) => selected.has(t)));
}

/**
 * Legacy auto contiguous runs — not used by the chart UI anymore.
 * Kept for any old call sites.
 */
export function computeBridgeGroups(selectedTeeth: number[]): number[][] {
  if (!selectedTeeth.length) return [];
  const selected = new Set(selectedTeeth);
  const groups: number[][] = [];

  for (const arch of ARCHES) {
    let run: number[] = [];
    for (const tooth of arch) {
      if (selected.has(tooth)) {
        run.push(tooth);
      } else if (run.length) {
        if (run.length >= 2) groups.push(run);
        run = [];
      }
    }
    if (run.length >= 2) groups.push(run);
  }

  return groups;
}

/** Normalize Prisma/JSON payload into number[][]. */
export function parseBridgeGroups(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const groups: number[][] = [];
  for (const item of value) {
    if (!Array.isArray(item)) continue;
    const teeth = item
      .map((n) => (typeof n === "number" ? n : Number(n)))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (teeth.length >= 2) groups.push(teeth);
  }
  return groups;
}

/** Display label e.g. "14–15". */
export function formatBridgeLabel(group: number[]): string {
  if (group.length === 0) return "";
  if (group.length === 1) return String(group[0]);
  const a = group[0]!;
  const b = group[group.length - 1]!;
  return `${a}–${b}`;
}

/**
 * Prefer explicit stored groups. Do not auto-derive from adjacency.
 */
export function resolveBridgeGroups(
  _selectedTeeth: number[],
  stored?: number[][] | null,
): number[][] {
  if (stored == null) return [];
  return parseBridgeGroups(stored);
}
