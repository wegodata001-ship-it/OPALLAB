export type TitaniumQuantitySize = {
  quantity: number | null;
  archivedAt: string | null;
};

export function toggleTitaniumId(open: readonly string[], id: string): string[] {
  return open.includes(id) ? open.filter((item) => item !== id) : [...open, id];
}

export function titaniumQuantityTotal(sizes: readonly TitaniumQuantitySize[]): number | null {
  const known = sizes.filter((size) => !size.archivedAt && size.quantity !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, size) => sum + (size.quantity ?? 0), 0);
}
