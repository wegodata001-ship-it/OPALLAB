import type { WorkType } from "@/lib/types";

/** Legacy work-type chip replaced by the splint catalog chips. */
export const SPLINT_WORK_TYPE: WorkType = "NIGHT_GUARD_WHITENING_MILLED";

export function isSplintWorkType(w: WorkType): boolean {
  return w === SPLINT_WORK_TYPE;
}

/** Work types shown as checkboxes (excludes the old combined splint chip). */
export function selectableWorkTypes(all: WorkType[]): WorkType[] {
  return all.filter((w) => !isSplintWorkType(w));
}

/** Normalize multi + legacy single into a unique id list. */
export function normalizeSplintTypeIds(
  ids?: string[] | null,
  legacyId?: string | null,
): string[] {
  if (ids?.length) {
    return [...new Set(ids.filter(Boolean))];
  }
  if (legacyId) return [legacyId];
  return [];
}

export function primarySplintTypeId(ids: string[]): string | null {
  return ids[0] ?? null;
}

/** Keep workTypes in sync with catalog selection for reports / filters. */
export function syncWorkTypesWithSplint(
  workTypes: WorkType[],
  splintTypeIds: string[] | string | null | undefined,
): WorkType[] {
  const ids = Array.isArray(splintTypeIds)
    ? splintTypeIds
    : splintTypeIds
      ? [splintTypeIds]
      : [];
  const without = workTypes.filter((w) => !isSplintWorkType(w));
  if (ids.length > 0) return [...without, SPLINT_WORK_TYPE];
  return without;
}
