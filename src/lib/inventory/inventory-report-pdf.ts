import type { InventoryCountStatus } from "@prisma/client";
import { buildEmbeddedFontCss, loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";
import { STORAGE_BUCKETS } from "@/lib/supabase/admin";
import { downloadStorageFile } from "@/lib/supabase/storage";
import { barcodeMarkup } from "@/lib/inventory/barcode-svg";
import { listReportCounts, listReportMovements, listReportProducts, type ReportCount, type ReportMovement, type ReportProduct } from "@/lib/inventory/inventory-report-data";
import {
  MODULE_LABELS,
  REPORT_LABELS,
  countProgress,
  readCountLine,
  treatmentLabel,
  type InventoryReportKind,
  type ReportModule,
} from "@/lib/inventory/inventory-reports";

const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="10" fill="#0f172a"/><text x="32" y="38" text-anchor="middle" fill="#c4a35a" font-family="Arial" font-size="13" font-weight="700">OPAL</text></svg>')}`;
const IMAGE_BUDGET = 25 * 1024 * 1024;

export type ReportRequest = {
  kind: InventoryReportKind;
  scope: "all" | "filtered";
  categories: string[];
  models: string[];
  materials: string[];
  from?: Date;
  to?: Date;
  countId?: string;
  countStatus?: InventoryCountStatus;
  userId?: string;
  differencesOnly: boolean;
  uncountedOnly: boolean;
  numbers?: string[];
  zeroOnly: boolean;
  images: boolean;
  barcodes: boolean;
  producedBy: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function qty(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : String(value);
}

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("he-IL") : "—";
}

function inRange(value: string, from?: Date, to?: Date) {
  const time = new Date(value).getTime();
  if (from && time < from.getTime()) return false;
  if (to && time > to.getTime()) return false;
  return true;
}

function matchesReportCategory(category: string, request: ReportRequest) {
  if (request.scope === "all" || request.categories.length === 0) return true;
  if (request.categories.includes(category)) return true;
  const label = MODULE_LABELS[category as ReportModule];
  return request.categories.some((item) => MODULE_LABELS[item as ReportModule] === category || item === label);
}

function applyProductFilters(rows: ReportProduct[], request: ReportRequest) {
  if (request.scope === "all") return rows;
  return rows.filter((row) => {
    if (request.categories.length > 0 && !request.categories.includes(row.module) && !request.categories.includes(row.category)) return false;
    if (request.models.length > 0 && !request.models.includes(row.model)) return false;
    if (request.materials.length > 0 && !request.materials.includes(row.material)) return false;
    if ((request.numbers?.length ?? 0) > 0 && !request.numbers?.includes(row.size)) return false;
    if (request.zeroOnly && row.quantity !== 0) return false;
    return true;
  });
}

function selectCounts(counts: ReportCount[], request: ReportRequest) {
  return counts.filter((count) => {
    if (request.countId && count.id !== request.countId) return false;
    if (!request.countId && !inRange(count.createdAt, request.from, request.to)) return false;
    if (request.scope === "filtered") {
      if (request.categories.length > 0 && !request.categories.includes(count.module) && !request.categories.includes(count.category)) return false;
      if (request.countStatus && count.status !== request.countStatus) return false;
      if (request.userId && count.createdById !== request.userId) return false;
    }
    return true;
  });
}

async function imageMap(products: ReportProduct[], enabled: boolean) {
  const images = new Map<string, string>();
  if (!enabled) return { images, omitted: 0 };
  let used = 0;
  let omitted = 0;
  const queue = products.filter((product) => product.imagePath);
  for (let index = 0; index < queue.length; index += 4) {
    const batch = queue.slice(index, index + 4);
    await Promise.all(batch.map(async (product) => {
      if (!product.imagePath || used >= IMAGE_BUDGET) {
        omitted += 1;
        return;
      }
      try {
        const file = await downloadStorageFile(STORAGE_BUCKETS.INVENTORY_IMAGES, product.imagePath);
        if (file.buffer.length > 1_500_000 || used + file.buffer.length > IMAGE_BUDGET) {
          omitted += 1;
          return;
        }
        used += file.buffer.length;
        const mime = file.contentType && file.contentType.startsWith("image/") ? file.contentType : "image/jpeg";
        images.set(product.id, `data:${mime};base64,${file.buffer.toString("base64")}`);
      } catch {
        omitted += 1;
      }
    }));
  }
  return { images, omitted };
}

function picture(product: ReportProduct | undefined, images: Map<string, string>, enabled: boolean) {
  if (!enabled) return "";
  const src = product && images.get(product.id) ? images.get(product.id) : PLACEHOLDER;
  const caption = product?.imagePath && !images.get(product.id) ? "תמונה קיימת" : product?.imagePath ? "" : "אין תמונה";
  return `<div class="photo"><img src="${src}" alt="" /><span>${caption}</span></div>`;
}

function codeCell(barcode: string, enabled: boolean) {
  if (!barcode.trim()) return "אין ברקוד";
  if (!enabled) return escapeHtml(barcode);
  const graphic = barcodeMarkup(barcode);
  if (!graphic.svg) return `${escapeHtml(barcode)}<div class="muted">הפורמט לא ניתן לציור גרפי</div>`;
  return `${graphic.svg}<div class="muted">${escapeHtml(graphic.format)}</div>`;
}

function productTable(rows: ReportProduct[], images: Map<string, string>, request: ReportRequest) {
  const body = rows.map((row) => `<tr>
    <td>${picture(row, images, request.images)}</td>
    <td>${escapeHtml(row.name)}</td>
    <td>${escapeHtml(row.category)}</td>
    <td>${escapeHtml(row.subcategory)}</td>
    <td>${escapeHtml(row.model)}</td>
    <td>${escapeHtml(row.material)}</td>
    <td>${escapeHtml(row.color)}</td>
    <td>${escapeHtml(row.size)}</td>
    <td>${codeCell(row.barcode, request.barcodes)}</td>
    <td class="num">${qty(row.quantity)}</td>
    <td>${escapeHtml(row.unit)}</td>
    <td>${when(row.updatedAt)}</td>
  </tr>`).join("");
  return `<table>
    <thead><tr><th>תמונה</th><th>שם מוצר</th><th>קטגוריה</th><th>תת־קטגוריה</th><th>דגם</th><th>סוג חומר</th><th>צבע</th><th>גובה / מידה</th><th>ברקוד</th><th>כמות</th><th>יחידה</th><th>עודכן</th></tr></thead>
    <tbody>${body || `<tr><td colspan="12">אין מוצרים התואמים לדוח</td></tr>`}</tbody>
  </table>`;
}

function grouped(rows: ReportProduct[], key: (row: ReportProduct) => string, images: Map<string, string>, request: ReportRequest) {
  const groups = new Map<string, ReportProduct[]>();
  for (const row of rows) {
    const name = key(row) || "ללא שיוך";
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()].map(([name, items]) => `<section><h2>${escapeHtml(name)} · ${items.length} פריטים · כמות ${items.reduce((sum, item) => sum + (item.quantity ?? 0), 0)}</h2>${productTable(items, images, request)}</section>`).join("");
}

function countSections(counts: ReportCount[], products: Map<string, ReportProduct>, images: Map<string, string>, request: ReportRequest, mode: "full" | "differences" | "uncounted") {
  if (counts.length === 0) return `<p>אין ספירה שמורה בטווח שנבחר. לא הומצאו נתוני ספירה.</p>`;
  return counts.map((count) => {
    const lines = count.lines.filter((line) => {
      const reading = readCountLine(line);
      if (request.scope === "filtered" && request.differencesOnly && reading.state !== "shortage" && reading.state !== "surplus") return false;
      if (request.scope === "filtered" && request.uncountedOnly && reading.state !== "uncounted") return false;
      if (mode === "differences" && reading.state !== "shortage" && reading.state !== "surplus") return false;
      if (mode === "uncounted" && reading.state !== "uncounted") return false;
      return true;
    });
    const progress = countProgress(count.status, count.lines);
    const rows = lines.map((line) => {
      const product = products.get(line.itemId);
      const reading = readCountLine(line);
      const current = product?.quantity;
      return `<tr>
        <td>${picture(product, images, request.images)}</td>
        <td>${escapeHtml(line.name || product?.name || "")}<div class="muted">${escapeHtml([line.modelName, line.kindName, line.colorName, line.sizeName].filter(Boolean).join(" / "))}</div></td>
        <td>${escapeHtml(count.category)}</td>
        <td>${codeCell(line.barcode || product?.barcode || "", request.barcodes)}</td>
        <td class="num">${qty(line.quantityAtStart)}</td>
        <td class="num">${reading.state === "uncounted" ? "לא נספר" : qty(line.countedQuantity)}</td>
        <td class="num">${reading.difference === null ? "—" : reading.difference}</td>
        <td>${reading.label}</td>
        <td class="num">${line.quantityAfter === null ? "טרם אושר" : qty(line.quantityAfter)}</td>
        <td class="num">${qty(current)}</td>
        <td>${escapeHtml(line.notes)}</td>
        <td>${treatmentLabel(count.status)}</td>
      </tr>`;
    }).join("");
    const differenceTotal = lines.reduce((sum, line) => sum + (readCountLine(line).difference ?? 0), 0);
    return `<section>
      <h2>ספירה #${count.serial} · ${escapeHtml(count.category)} · ${progress.status}</h2>
      <ul class="facts">
        <li>התחלה: ${when(count.createdAt)}</li>
        <li>סיום: ${when(count.approvedAt ?? count.cancelledAt)}</li>
        <li>עובד: ${escapeHtml(count.counterName || count.createdByName)}</li>
        <li>אישר: ${escapeHtml(count.approvedByName || "—")}</li>
        <li>צפויים: ${progress.expected}</li>
        <li>נספרו: ${progress.counted}</li>
        <li>טרם נספרו: ${progress.remaining}</li>
        <li>הפרש מצטבר בשורות המוצגות: ${differenceTotal}</li>
      </ul>
      <p class="muted">מלאי בפתיחה וכמות שנספרה הם נתוני הספירה המקוריים. מלאי נוכחי מוצג בנפרד ואינו מחליף אותם.</p>
      <table>
        <thead><tr><th>תמונה</th><th>מוצר</th><th>קטגוריה</th><th>ברקוד</th><th>מלאי בפתיחה</th><th>נספר בפועל</th><th>הפרש</th><th>מצב</th><th>אחרי אישור</th><th>מלאי נוכחי</th><th>הערה</th><th>טיפול</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="12">אין שורות להצגה</td></tr>`}</tbody>
      </table>
    </section>`;
  }).join("");
}

function statusReport(counts: ReportCount[]) {
  const modules = Object.entries(MODULE_LABELS).filter(([key]) => key !== "CLASSIC") as [ReportModule, string][];
  const cards = modules.map(([module, label]) => {
    const latest = counts.find((count) => count.module === module && count.status !== "CANCELLED");
    const progress = countProgress(latest?.status ?? null, latest?.lines ?? []);
    return `<tr><td>${escapeHtml(label)}</td><td>${latest ? `#${latest.serial}` : "אין ספירה"}</td><td>${progress.status}</td><td class="num">${progress.percent}%</td><td class="num">${progress.counted}</td><td class="num">${progress.remaining}</td><td class="num">${progress.shortage}</td><td class="num">${progress.surplus}</td><td class="num">${progress.matched}</td><td class="num">${progress.review}</td></tr>`;
  }).join("");
  const chosen = counts.filter((count) => count.status !== "CANCELLED");
  const overallStatus = chosen.some((count) => count.status === "DRAFT") ? "DRAFT" : chosen.some((count) => count.status === "APPROVED") ? "APPROVED" : null;
  const progress = countProgress(overallStatus, chosen.flatMap((count) => count.lines));
  return `<ul class="facts">
    <li>התקדמות כוללת: ${progress.percent}%</li>
    <li>צפויים: ${progress.expected}</li>
    <li>נספרו: ${progress.counted}</li>
    <li>נותרו: ${progress.remaining}</li>
    <li>חוסר: ${progress.shortage}</li>
    <li>עודף: ${progress.surplus}</li>
    <li>תואמים: ${progress.matched}</li>
    <li>דורשים בדיקה: ${progress.review}</li>
  </ul>
  <table><thead><tr><th>קטגוריה</th><th>ספירה</th><th>מצב</th><th>התקדמות</th><th>נספרו</th><th>נותרו</th><th>חוסר</th><th>עודף</th><th>תקין</th><th>לבדיקה</th></tr></thead><tbody>${cards}</tbody></table>
  <p class="muted">האחוזים מחושבים ממספר השורות שמולאה בהן כמות שנספרה, מתוך שורות הספירה האחרונה שלא בוטלה בכל קטגוריה.</p>`;
}

function drillReport(products: ReportProduct[], counts: ReportCount[], images: Map<string, string>, request: ReportRequest) {
  const latest = new Map<string, ReportCount["lines"][number]>();
  for (const count of counts.filter((item) => item.module === "DRILLS" && item.status !== "CANCELLED")) {
    for (const line of count.lines) if (!latest.has(line.itemId)) latest.set(line.itemId, line);
  }
  const drills = products.filter((product) => product.module === "DRILLS");
  const machines = [...new Set(drills.map((product) => product.model))];
  if (machines.length === 0) return `<p>אין מקדחים שמורים. דגמים וסוגים חדשים יופיעו כאן אחרי שיוזנו במלאי.</p>`;
  return machines.map((machine) => {
    const rows = drills.filter((product) => product.model === machine);
    const body = rows.map((product) => {
      const line = latest.get(product.id);
      const reading = line ? readCountLine(line) : null;
      return `<tr>
        <td>${picture(product, images, request.images)}</td>
        <td>${escapeHtml(product.material)}</td>
        <td>${escapeHtml(product.size)}</td>
        <td>${codeCell(product.barcode, request.barcodes)}</td>
        <td class="num">${qty(product.quantity)}</td>
        <td class="num">${reading ? (reading.state === "uncounted" ? "לא נספר" : qty(line?.countedQuantity)) : "אין ספירה"}</td>
        <td class="num">${reading?.difference ?? "—"}</td>
        <td>${reading?.label ?? (product.quantity === null ? "לא הוגדרה כמות" : product.quantity === 0 ? "אפס" : "קיים")}</td>
      </tr>`;
    }).join("");
    return `<section><h2>${escapeHtml(machine || "ללא דגם")}</h2><table><thead><tr><th>תמונה</th><th>סוג חומר</th><th>מספר</th><th>ברקוד</th><th>כמות</th><th>נספר</th><th>הפרש</th><th>מצב</th></tr></thead><tbody>${body}</tbody></table></section>`;
  }).join("");
}

function movementTable(rows: ReportMovement[]) {
  const body = rows.map((row) => `<tr><td>${when(row.createdAt)}</td><td>${escapeHtml(row.userName)}</td><td>${escapeHtml(row.itemName)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.action)}</td><td class="num">${row.quantityBefore}</td><td class="num">${row.quantityChange}</td><td class="num">${row.quantityAfter}</td><td>${escapeHtml(row.source)}</td></tr>`).join("");
  return `<table><thead><tr><th>תאריך</th><th>משתמש</th><th>פריט</th><th>קטגוריה</th><th>פעולה</th><th>לפני</th><th>שינוי</th><th>אחרי</th><th>מקור</th></tr></thead><tbody>${body || `<tr><td colspan="9">אין תנועות בטווח</td></tr>`}</tbody></table>`;
}

function historyTable(counts: ReportCount[]) {
  const body = counts.map((count) => {
    const progress = countProgress(count.status, count.lines);
    const difference = count.lines.reduce((sum, line) => sum + (readCountLine(line).difference ?? 0), 0);
    return `<tr><td>#${count.serial}</td><td>${escapeHtml(count.category)}</td><td>${when(count.createdAt)}</td><td>${when(count.approvedAt)}</td><td>${escapeHtml(count.createdByName)}</td><td>${escapeHtml(count.approvedByName || "—")}</td><td>${progress.status}</td><td class="num">${progress.expected}</td><td class="num">${progress.counted}</td><td class="num">${difference}</td><td>${escapeHtml(count.notes)}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>מספר</th><th>קטגוריה</th><th>נוצרה</th><th>אושרה</th><th>יוצר</th><th>מאשר</th><th>מצב</th><th>צפויים</th><th>נספרו</th><th>הפרשים</th><th>הערות</th></tr></thead><tbody>${body || `<tr><td colspan="11">אין ספירות שמורות</td></tr>`}</tbody></table>`;
}

function lowStock(rows: ReportProduct[], images: Map<string, string>, request: ReportRequest) {
  const low = rows.filter((row) => row.quantity !== null && (row.quantity <= 0 || (row.minQuantity !== null && row.quantity <= row.minQuantity)));
  const unset = rows.filter((row) => row.quantity === null);
  return `<h2>כמות אפס, שלילית או מתחת למינימום</h2>${productTable(low, images, request)}<h2>כמות שלא הוגדרה</h2><p class="muted">${unset.length} פריטים בלי כמות שמורה. הם לא מוצגים כאפס.</p>${productTable(unset, images, request)}`;
}

export async function renderInventoryReport(request: ReportRequest) {
  const [products, counts] = await Promise.all([
    listReportProducts(),
    listReportCounts(),
  ]);
  const visibleProducts = applyProductFilters(products, request);
  const visibleCounts = selectCounts(counts, request);
  const { images, omitted } = await imageMap(request.images ? visibleProducts : [], request.images);
  const byId = new Map(products.map((product) => [product.id, product]));
  let body = "";
  if (request.kind === "all-products" || request.kind === "current-stock") body = productTable(visibleProducts, images, request);
  else if (request.kind === "by-category") body = grouped(visibleProducts, (row) => row.category, images, request);
  else if (request.kind === "by-model") body = grouped(visibleProducts, (row) => [row.category, row.model, row.material].filter(Boolean).join(" / "), images, request);
  else if (request.kind === "drills") body = drillReport(visibleProducts, visibleCounts, images, request);
  else if (request.kind === "count-full") body = countSections(visibleCounts, byId, images, request, "full");
  else if (request.kind === "differences") body = countSections(visibleCounts, byId, images, request, "differences");
  else if (request.kind === "uncounted") body = countSections(visibleCounts, byId, images, request, "uncounted");
  else if (request.kind === "count-status") body = statusReport(visibleCounts);
  else if (request.kind === "count-history") body = historyTable(visibleCounts);
  else if (request.kind === "movements") {
    const narrowed = (request.models.length > 0 || request.materials.length > 0 || (request.numbers?.length ?? 0) > 0)
      ? new Set(visibleProducts.map((product) => product.id))
      : null;
    body = movementTable((await listReportMovements(request.from, request.to)).filter((row) => matchesReportCategory(row.category, request) && (!narrowed || narrowed.has(row.itemId))));
  }
  else if (request.kind === "low-zero") body = lowStock(visibleProducts, images, request);
  else if (request.kind === "with-media") body = productTable(visibleProducts.filter((row) => row.imagePath && row.barcode.trim()), images, request);
  else body = productTable(visibleProducts.filter((row) => !row.imagePath || !row.barcode.trim()), images, request);

  const filters = [
    request.models.length > 0 ? `דגמים: ${request.models.join(", ")}` : "",
    request.materials.length > 0 ? `חומרים: ${request.materials.join(", ")}` : "",
    (request.numbers?.length ?? 0) > 0 ? `מספרים: ${request.numbers?.join(", ")}` : "",
    request.zeroOnly ? "כמות אפס" : "",
    request.from ? `מתאריך ${request.from.toLocaleDateString("he-IL")}` : "",
    request.to ? `עד ${request.to.toLocaleDateString("he-IL")}` : "",
  ].filter(Boolean).join(" · ");
  const units = visibleProducts.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const title = REPORT_LABELS[request.kind];
  const logo = loadLogoDataUrl();
  const landscape = request.kind !== "count-status";
  const summary = request.kind.startsWith("count") || request.kind === "movements"
    ? `${visibleCounts.length} ספירות בדוח${request.categories.length === 1 && request.categories[0] === "DRILLS" ? ` · סה״כ יחידות במלאי ${units}` : ""}`
    : `${visibleProducts.length} מוצרים בדוח${request.categories.length === 1 && request.categories[0] === "DRILLS" ? ` · סה״כ יחידות ${units}` : ""}`;
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
${buildEmbeddedFontCss()}
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm 8mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #0f172a; font-family: "Noto Sans Hebrew", "Noto Sans Arabic", Arial, sans-serif; font-size: 11px; }
header { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-bottom: 3px solid #c4a35a; padding-bottom: 8px; margin-bottom: 12px; }
.brand { display: flex; gap: 8px; align-items: center; }
.brand img { width: 42px; height: 42px; object-fit: contain; }
.logo { background: #0f172a; color: white; border: 2px solid #c4a35a; border-radius: 8px; padding: 6px 8px; font-weight: 700; }
h1 { margin: 0; font-size: 18px; }
h2 { margin: 16px 0 6px; font-size: 14px; }
.meta, .muted { color: #475569; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 0; margin: 8px 0; list-style: none; }
.facts li { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 8px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
thead { display: table-header-group; }
th { background: #0f172a; color: white; text-align: right; padding: 5px; font-weight: 700; }
td { border-bottom: 1px solid #e2e8f0; padding: 4px; vertical-align: middle; }
tr, td, th { break-inside: avoid; page-break-inside: avoid; }
.num { font-weight: 700; white-space: nowrap; }
.photo { width: 46px; text-align: center; }
.photo img { width: 36px; height: 36px; object-fit: contain; background: white; }
.photo span, .muted { display: block; font-size: 8px; }
svg { max-width: 110px; height: auto; }
</style>
</head>
<body>
<header>
  <div class="brand">${logo ? `<img src="${logo}" alt="OPAL LAB" />` : `<div class="logo">OPAL LAB</div>`}
    <div><strong>OPAL LAB</strong><div class="meta">מעבדת שיניים</div></div>
  </div>
  <div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">הופק: ${escapeHtml(new Date().toLocaleString("he-IL"))} · ${escapeHtml(request.producedBy)}</div>
    ${filters ? `<div class="meta">סינון: ${escapeHtml(filters)}</div>` : ""}
    <div class="meta">${escapeHtml(summary)}${omitted > 0 ? ` · ${omitted} תמונות קיימות לא הוטמעו בגלל גודל הקובץ` : ""}</div>
  </div>
</header>
${body}
<p class="muted">הפקת הדוח לא שינתה מלאי, ספירה או הזמנה. ${escapeHtml(summary)}.</p>
</body>
</html>`;
  const buffer = await htmlToPdfBuffer(html, { landscape, footerLabel: title });
  const filename = `opal-inventory-${request.kind}.pdf`;
  return { buffer, filename, html, productCount: visibleProducts.length, countCount: visibleCounts.length };
}
