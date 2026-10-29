export type ImplantTreeHeight = {
  id: string;
  label: string;
  quantity: number;
  minQuantity: number;
  archivedAt: string | null;
};

export type ImplantTreeType = {
  id: string;
  name: string;
  archivedAt: string | null;
  heights: ImplantTreeHeight[];
};

export type ImplantTreeModel = {
  id: string;
  name: string;
  archivedAt: string | null;
  types: ImplantTreeType[];
};

export type ImplantTreeBrand = {
  id: string;
  name: string;
  archivedAt: string | null;
  models: ImplantTreeModel[];
};

export type ImplantStockFilter = "all" | "ok" | "low" | "out";

export function implantStockState(height: Pick<ImplantTreeHeight, "quantity" | "minQuantity">): Exclude<ImplantStockFilter, "all"> {
  if (height.quantity === 0) return "out";
  if (height.minQuantity > 0 && height.quantity <= height.minQuantity) return "low";
  return "ok";
}

export function toggleImplantId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function includes(value: string, term: string) {
  return value.toLocaleLowerCase("he").includes(term);
}

export function filterImplantTree(brands: ImplantTreeBrand[], query: string, stock: ImplantStockFilter, barcodeHeightIds?: ReadonlySet<string>): ImplantTreeBrand[] {
  const term = query.trim().toLocaleLowerCase("he");
  const visible: ImplantTreeBrand[] = [];
  for (const brand of brands) {
    if (brand.archivedAt) continue;
    const models: ImplantTreeModel[] = [];
    for (const model of brand.models) {
      if (model.archivedAt) continue;
      const types: ImplantTreeType[] = [];
      for (const type of model.types) {
        if (type.archivedAt) continue;
        const names = [brand.name, model.name, type.name];
        const named = !term || names.some((name) => includes(name, term));
        const heights = type.heights.filter((height) => {
          if (height.archivedAt) return false;
          if (stock !== "all" && implantStockState(height) !== stock) return false;
          if (!term) return true;
          return named || includes(height.label, term) || Boolean(barcodeHeightIds?.has(height.id));
        });
        if (heights.length === 0 && (stock !== "all" || !named)) continue;
        types.push({ ...type, heights });
      }
      const modelNamed = !term || includes(brand.name, term) || includes(model.name, term);
      if (types.length === 0 && (stock !== "all" || !modelNamed)) continue;
      models.push({ ...model, types });
    }
    const brandNamed = !term || includes(brand.name, term);
    if (models.length === 0 && (stock !== "all" || !brandNamed)) continue;
    visible.push({ ...brand, models });
  }
  return visible;
}

export function expandImplantMatches(brands: ImplantTreeBrand[], query: string, stock: ImplantStockFilter, barcodeHeightIds?: ReadonlySet<string>) {
  const term = query.trim().toLocaleLowerCase("he");
  if (!term && stock === "all") return { brands: [] as string[], models: [] as string[], types: [] as string[] };
  const filtered = filterImplantTree(brands, query, stock, barcodeHeightIds);
  const openBrands: string[] = [];
  const openModels: string[] = [];
  const openTypes: string[] = [];
  for (const brand of filtered) {
    openBrands.push(brand.id);
    for (const model of brand.models) {
      const modelHit = Boolean(term && includes(model.name, term));
      const deeper = model.types.some((type) => {
        const typeHit = Boolean(term && includes(type.name, term));
        const heightHit = type.heights.some((height) => Boolean(term && (includes(height.label, term) || barcodeHeightIds?.has(height.id))));
        return typeHit || heightHit || stock !== "all";
      });
      if (modelHit || deeper || stock !== "all") openModels.push(model.id);
      for (const type of model.types) {
        const typeHit = Boolean(term && includes(type.name, term));
        const heightHit = type.heights.some((height) => Boolean(term && (includes(height.label, term) || barcodeHeightIds?.has(height.id))));
        if (typeHit || heightHit || stock !== "all") openTypes.push(type.id);
      }
    }
  }
  return { brands: openBrands, models: openModels, types: openTypes };
}
