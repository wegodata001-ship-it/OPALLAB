/** Work groups that consume doctor parts. Uses the live order catalog codes. */
export function orderNeedsDoctorParts(input: {
  materials?: string[] | null;
  workTypes?: string[] | null;
  allInXType?: string | null;
  pricingMode?: string | null;
}): boolean {
  if (input.pricingMode === "ALL_IN_X") {
    return (input.allInXType ?? "").includes("SCREWED");
  }
  const materials = input.materials ?? [];
  const workTypes = input.workTypes ?? [];
  if (materials.includes("MODEL")) return true;
  if (workTypes.includes("ABUTMENTS")) return true;
  if (workTypes.includes("SCREWED")) return true;
  return false;
}

export type DoctorPartSelection = { partId: string; quantity: number };

export function mergeDoctorPartSelections(lines: DoctorPartSelection[]): DoctorPartSelection[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    const partId = line.partId?.trim();
    if (!partId) continue;
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("כמות החלק אינה תקינה");
    }
    merged.set(partId, (merged.get(partId) ?? 0) + line.quantity);
  }
  return [...merged.entries()].map(([partId, quantity]) => ({ partId, quantity }));
}
