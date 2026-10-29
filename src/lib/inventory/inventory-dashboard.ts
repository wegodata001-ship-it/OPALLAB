import type { InventoryAlertAudience, InventoryModuleType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildEmbeddedFontCss, loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";
import { listReportCounts, listReportMovements, listReportProducts, type ReportMovement, type ReportProduct } from "@/lib/inventory/inventory-report-data";
import { MODULE_LABELS, countProgress, readCountLine, type ReportModule } from "@/lib/inventory/inventory-reports";
import { currentDueDate, dateKey, modulePath, taskStatusLabel, type CountTaskState } from "@/lib/inventory/inventory-reminder-rules";
import { STORAGE_BUCKETS } from "@/lib/supabase/admin";
import { getSignedUrl } from "@/lib/supabase/storage";
import { canDeleteOrders } from "@/lib/user-roles";

export type StockStatus = "ok" | "low" | "zero" | "negative" | "unset";

const STATUS_LABEL: Record<StockStatus, string> = {
  ok: "תקין",
  low: "נמוך",
  zero: "אפס",
  negative: "שלילי",
  unset: "כמות לא הוגדרה",
};

const MODULES = (Object.keys(MODULE_LABELS) as ReportModule[]).filter((module) => module !== "CLASSIC");

export type DashboardFilters = {
  from?: Date;
  to?: Date;
  modules: string[];
  model: string;
  stock: string;
  userId: string;
  query: string;
  page: number;
  pageSize: number;
  sort: "name" | "category" | "quantity" | "status";
  direction: "asc" | "desc";
};

export function stockStatus(row: { quantity: number | null; minQuantity: number | null }): StockStatus {
  if (row.quantity === null) return "unset";
  if (row.quantity < 0) return "negative";
  if (row.quantity === 0) return "zero";
  if (row.minQuantity !== null && row.minQuantity > 0 && row.quantity < row.minQuantity) return "low";
  return "ok";
}

function facets(row: ReportProduct, partCode: string) {
  if (row.module === "ZIRCONIA" || row.module === "BMMA") {
    return { model: row.model || null, kind: row.color || null, kindLabel: "צבע", measure: row.size || null, measureLabel: "גובה" };
  }
  if (row.module === "DRILLS") {
    return { model: row.model || null, kind: row.material || null, kindLabel: "חומר", measure: row.size || null, measureLabel: "מספר" };
  }
  if (row.module === "IMPLANTS") {
    const kind = [row.subcategory, row.material].filter(Boolean).join(" / ");
    return { model: row.model || null, kind: kind || null, kindLabel: "דגם וסוג", measure: row.size || null, measureLabel: "גובה" };
  }
  if (row.module === "TITANIUM") {
    return { model: row.model || null, kind: row.subcategory || null, kindLabel: "רדיוס", measure: row.size || null, measureLabel: "גודל" };
  }
  if (row.module === "DOCTOR_PARTS") {
    return { model: row.name || null, kind: partCode || null, kindLabel: "קוד חלק", measure: null, measureLabel: null };
  }
  return { model: row.name || null, kind: null, kindLabel: null, measure: null, measureLabel: null };
}

function movementKind(row: ReportMovement) {
  if (row.action === "ספירת מלאי" || row.source === "ספירה") return "count" as const;
  if (row.quantityChange > 0) return "add" as const;
  if (row.quantityChange < 0) return "sub" as const;
  return "count" as const;
}

function inRange(value: string, from?: Date, to?: Date) {
  const time = new Date(value).getTime();
  if (from && time < from.getTime()) return false;
  if (to && time > to.getTime()) return false;
  return true;
}

function windowOrDefault(from?: Date, to?: Date) {
  if (from || to) return { from, to, assumed: false };
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: start, to: end, assumed: true };
}

function previousWindow(from?: Date, to?: Date) {
  if (!from || !to) return null;
  const span = to.getTime() - from.getTime();
  if (span <= 0) return null;
  return { from: new Date(from.getTime() - span), to: new Date(from.getTime() - 1) };
}

function bucketKey(iso: string, mode: "day" | "week" | "month") {
  const key = dateKey(new Date(iso));
  if (mode === "month") return key.slice(0, 7);
  if (mode === "day") return key;
  const date = new Date(`${key}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function loadInventoryDashboard(user: Pick<User, "role" | "roles">, filters: DashboardFilters) {
  const history = windowOrDefault(filters.from, filters.to);
  const prior = previousWindow(history.from, history.to);
  const audiences: InventoryAlertAudience[] = canDeleteOrders(user) ? ["MANAGER", "SECRETARY", "BOTH"] : ["SECRETARY", "BOTH"];
  const [products, counts, movements, priorMovements, tasks, policies, alerts, partCodes, usageCount] = await Promise.all([
    listReportProducts(),
    listReportCounts(),
    listReportMovements(history.from, history.to),
    prior ? listReportMovements(prior.from, prior.to) : Promise.resolve([] as ReportMovement[]),
    prisma.inventoryCountTask.findMany({
      include: { assignedTo: { select: { name: true } }, count: { select: { createdBy: { select: { name: true } }, createdAt: true, status: true } } },
      orderBy: { dueDate: "desc" },
    }),
    prisma.inventoryCountPolicy.findMany(),
    prisma.inventoryAlert.findMany({ where: { status: "OPEN", audience: { in: audiences } }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.doctorPart.findMany({ where: { archivedAt: null }, select: { id: true, code: true } }),
    prisma.productionMaterialUse.count({ where: { removedAt: null, recordedAt: { ...(history.from ? { gte: history.from } : {}), ...(history.to ? { lte: history.to } : {}) } } }),
  ]);

  const codeByPart = new Map(partCodes.map((row) => [row.id, row.code]));
  const selected = new Set(filters.modules);
  const scoped = products.filter((row) => selected.size === 0 || selected.has(row.module) || selected.has(row.category));
  const modeled = scoped.filter((row) => !filters.model || row.model === filters.model);
  const lastCount = new Map<string, string>();
  for (const count of counts) {
    if (count.status === "CANCELLED") continue;
    for (const line of count.lines) {
      if (line.countedQuantity === null || lastCount.has(line.itemId)) continue;
      lastCount.set(line.itemId, count.approvedAt || count.createdAt);
    }
  }

  const rows = modeled.map((row) => {
    const status = stockStatus(row);
    const face = facets(row, codeByPart.get(row.id) ?? "");
    return {
      id: row.id,
      module: row.module,
      category: row.category,
      href: modulePath(row.module as InventoryModuleType),
      name: row.name,
      ...face,
      barcode: row.barcode,
      quantity: row.quantity,
      minQuantity: row.minQuantity,
      unit: row.unit,
      status,
      statusLabel: STATUS_LABEL[status],
      lastCountAt: lastCount.get(row.id) ?? null,
      hasImage: Boolean(row.imagePath),
      imagePath: row.imagePath,
    };
  });

  const stockFiltered = rows.filter((row) => !filters.stock || row.status === filters.stock || (filters.stock === "missing-image" && !row.hasImage) || (filters.stock === "missing-barcode" && !row.barcode.trim()));
  const needle = filters.query.trim().toLowerCase();
  const searched = stockFiltered.filter((row) => !needle || [row.name, row.model, row.kind, row.measure, row.barcode, row.category].some((value) => (value ?? "").toLowerCase().includes(needle)));
  const sorted = [...searched].sort((left, right) => {
    const dir = filters.direction === "desc" ? -1 : 1;
    if (filters.sort === "quantity") return ((left.quantity ?? -1) - (right.quantity ?? -1)) * dir;
    if (filters.sort === "category") return left.category.localeCompare(right.category, "he") * dir;
    if (filters.sort === "status") return left.statusLabel.localeCompare(right.statusLabel, "he") * dir;
    return left.name.localeCompare(right.name, "he") * dir;
  });
  const page = Math.max(1, filters.page);
  const pageSize = Math.min(50, Math.max(10, filters.pageSize));
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize);
  const thumbs = await Promise.all(slice.map(async (row) => (row.imagePath ? getSignedUrl(STORAGE_BUCKETS.INVENTORY_IMAGES, row.imagePath) : null)));

  const statusCount = (status: StockStatus) => rows.filter((row) => row.status === status).length;
  const userName = filters.userId ? counts.find((count) => count.createdById === filters.userId)?.createdByName ?? "" : "";
  const visibleMovements = movements.filter((row) => {
    const categoryOk = selected.size === 0 || [...selected].some((item) => row.category === item || MODULE_LABELS[item as ReportModule] === row.category);
    const userOk = !filters.userId || row.userName === userName;
    return categoryOk && userOk;
  });
  const priorVisible = priorMovements.filter((row) => {
    const categoryOk = selected.size === 0 || [...selected].some((item) => row.category === item || MODULE_LABELS[item as ReportModule] === row.category);
    return categoryOk && (!filters.userId || row.userName === userName);
  });
  const spanDays = history.from && history.to ? (history.to.getTime() - history.from.getTime()) / 86_400_000 : 30;
  const mode = spanDays <= 31 ? "day" : spanDays <= 120 ? "week" : "month";
  const seriesMap = new Map<string, { label: string; additions: number; reductions: number; counts: number }>();
  for (const row of visibleMovements) {
    const label = bucketKey(row.createdAt, mode);
    const point = seriesMap.get(label) ?? { label, additions: 0, reductions: 0, counts: 0 };
    const kind = movementKind(row);
    if (kind === "add") point.additions += 1;
    else if (kind === "sub") point.reductions += 1;
    else point.counts += 1;
    seriesMap.set(label, point);
  }

  const rangedCounts = counts.filter((count) => inRange(count.createdAt, history.from, history.to) && (selected.size === 0 || selected.has(count.module)) && (!filters.userId || count.createdById === filters.userId));
  const rangedTasks = tasks.filter((task) => inRange(task.dueDate.toISOString(), history.from, history.to) && (selected.size === 0 || selected.has(task.inventoryType)));
  const performed = rangedTasks.filter((task) => task.status === "COMPLETED").length;
  const missed = rangedTasks.filter((task) => task.status !== "COMPLETED").length;
  const withVariance = rangedCounts.filter((count) => count.lines.some((line) => {
    const reading = readCountLine(line);
    return reading.difference !== null && reading.difference !== 0;
  })).length;
  const pendingTaskCountIds = new Set(tasks.filter((task) => task.status === "PENDING_APPROVAL" && task.countId).map((task) => task.countId as string));
  const pendingApproval = tasks.filter((task) => task.status === "PENDING_APPROVAL" && (selected.size === 0 || selected.has(task.inventoryType))).length
    + counts.filter((count) => count.status === "DRAFT" && !pendingTaskCountIds.has(count.id) && (selected.size === 0 || selected.has(count.module)) && countProgress(count.status, count.lines).status === "ממתינה לבדיקה").length;

  const categories = MODULES.map((module) => {
    const items = rows.filter((row) => row.module === module);
    const units = new Set(items.map((row) => row.unit || "יחידה"));
    const quantities = items.filter((row) => row.quantity !== null);
    const canSum = units.size <= 1 && quantities.length === items.length && items.length > 0;
    return {
      module,
      label: MODULE_LABELS[module],
      items: items.length,
      unitTotal: canSum ? quantities.reduce((sum, row) => sum + (row.quantity ?? 0), 0) : null,
      unit: units.size === 1 ? [...units][0] : null,
      zero: items.filter((row) => row.status === "zero").length,
      low: items.filter((row) => row.status === "low").length,
      negative: items.filter((row) => row.status === "negative").length,
      missingImage: items.filter((row) => !row.hasImage).length,
      missingBarcode: items.filter((row) => !row.barcode.trim()).length,
    };
  });

  const control = MODULES.map((module) => {
    const policy = policies.find((row) => row.inventoryType === module);
    const moduleTasks = tasks.filter((task) => task.inventoryType === module);
    const open = moduleTasks.find((task) => task.status !== "COMPLETED");
    const last = moduleTasks.find((task) => task.status === "COMPLETED") ?? null;
    const latestCount = counts.find((count) => count.module === module && count.status !== "CANCELLED");
    const variance = (latestCount?.lines ?? []).filter((line) => {
      const reading = readCountLine(line);
      return reading.difference !== null && reading.difference !== 0;
    }).length;
    const due = policy?.enabled ? currentDueDate(policy.anchorDate, policy.frequencyDays, new Date()) : null;
    const status = open ? taskStatusLabel(open.status as CountTaskState) : last ? "הושלמה" : "לא בוצעה";
    return {
      module,
      label: MODULE_LABELS[module],
      href: `/inventory/reminders?type=${module}`,
      itemCount: rows.filter((row) => row.module === module).length,
      lastCountAt: last?.completedAt?.toISOString() ?? latestCount?.approvedAt ?? latestCount?.createdAt ?? null,
      lastCounter: last?.count?.createdBy.name || last?.assignedTo?.name || latestCount?.createdByName || "",
      nextDue: open?.dueDate.toISOString() ?? due?.toISOString() ?? null,
      status,
      completed: !open && Boolean(last),
      variance,
      pending: moduleTasks.filter((task) => task.status === "PENDING_APPROVAL").length,
    };
  });

  const operational = alerts.filter((alert) => alert.kind !== "NEVER_COUNTED").slice(0, 12).map((alert) => ({
    id: alert.id,
    title: alert.title,
    body: alert.body,
    href: alert.href,
    severity: alert.severity,
    kind: alert.kind,
  }));

  const movementDelta = prior && priorVisible.length > 0 ? visibleMovements.length - priorVisible.length : null;
  const priorCounts = prior ? counts.filter((count) => inRange(count.createdAt, prior.from, prior.to) && count.status === "APPROVED").length : 0;
  const approvedNow = rangedCounts.filter((count) => count.status === "APPROVED").length;

  return {
    generatedAt: new Date().toISOString(),
    stockNote: "מצב המלאי הוא היתרה העדכנית. טווח התאריכים חל על תנועות וספירות בלבד, בלי יתרה היסטורית משוערת.",
    usageNote: "רשומות השימוש בייצור הן תיעוד בלבד ואינן מספר יחידות שנגרעו מהמלאי.",
    history: { from: history.from?.toISOString() ?? null, to: history.to?.toISOString() ?? null, assumed: history.assumed, bucket: mode },
    kpis: [
      { id: "items", label: "סך פריטי המלאי", value: rows.length, hint: "פריטים ייחודיים, בלי סיכום יחידות", delta: null },
      { id: "low", label: "מלאי נמוך", value: statusCount("low"), hint: "מתחת למינימום שהוגדר, וכמות גדולה מאפס", delta: null },
      { id: "zero", label: "מלאי אפס", value: statusCount("zero"), hint: "כמות שמורה 0. כמות שלא הוגדרה אינה נספרת כאפס", delta: null },
      { id: "missed", label: "ספירות שלא בוצעו", value: missed, hint: history.assumed ? "משימות ספירה ב־30 הימים האחרונים שלא הושלמו" : "משימות בטווח שלא הושלמו", delta: null },
      { id: "pending", label: "ממתינות לאישור", value: pendingApproval, hint: "טיוטות שהושלמו או משימות שנשלחו לאישור", delta: null },
      { id: "movements", label: "תנועות בתקופה", value: visibleMovements.length, hint: history.assumed ? "30 הימים האחרונים" : "בטווח שנבחר", delta: movementDelta === null ? null : { value: movementDelta, label: "לעומת התקופה הקודמת" } },
      { id: "missing-image", label: "בלי תמונה", value: rows.filter((row) => !row.hasImage).length, hint: "המלצה להשלמת נתונים, לא התראת מלאי", delta: null },
      { id: "missing-barcode", label: "בלי ברקוד", value: rows.filter((row) => !row.barcode.trim()).length, hint: "ברקוד סריקה בלבד. קוד חלק אינו ברקוד", delta: null },
    ],
    countDelta: prior && priorCounts > 0 ? { value: approvedNow - priorCounts, label: "ספירות שאושרו לעומת התקופה הקודמת" } : null,
    categories,
    stockChart: [
      { id: "ok", label: "תקין", value: statusCount("ok") },
      { id: "low", label: "נמוך", value: statusCount("low") },
      { id: "zero", label: "אפס", value: statusCount("zero") },
      { id: "negative", label: "שלילי", value: statusCount("negative") },
      { id: "unset", label: "לא הוגדרה כמות", value: statusCount("unset") },
    ],
    movementSeries: [...seriesMap.values()].sort((left, right) => left.label.localeCompare(right.label)),
    countChart: [
      { id: "performed", label: "בוצעו", value: performed },
      { id: "missed", label: "לא בוצעו", value: missed },
      { id: "variance", label: "עם הפרשים", value: withVariance },
      { id: "pending", label: "ממתינות לאישור", value: pendingApproval },
    ],
    control,
    operational,
    recommendations: [
      { id: "images", title: "מוצרים בלי תמונה", body: `${rows.filter((row) => !row.hasImage).length} פריטים בלי תמונה ראשית. זו השלמת נתונים, לא חוסר מלאי.`, href: "/inventory/reports" },
      { id: "barcodes", title: "מוצרים בלי ברקוד", body: `${rows.filter((row) => !row.barcode.trim()).length} פריטים בלי ברקוד סריקה.`, href: "/inventory/reports" },
    ],
    materialUsage: { records: usageCount },
    models: [...new Set(scoped.map((row) => row.model).filter(Boolean))].sort((left, right) => left.localeCompare(right, "he")),
    employees: [...new Map(counts.map((count) => [count.createdById, count.createdByName])).entries()].map(([id, name]) => ({ id, name })),
    items: slice.map(({ imagePath: _imagePath, ...row }, index) => ({ ...row, imageUrl: thumbs[index] })),
    itemTotal: sorted.length,
    page,
    pageSize,
  };
}

export async function renderDashboardPdf(input: { title: string; producedBy: string; filters: string; rows: string[][]; headers: string[] }) {
  const logo = loadLogoDataUrl();
  const body = input.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8" /><style>
${buildEmbeddedFontCss()}
@page { size: A4 landscape; margin: 12mm 8mm 16mm; }
body { font-family: "Noto Sans Hebrew", Arial, sans-serif; color: #0f172a; font-size: 11px; }
header { display: flex; justify-content: space-between; border-bottom: 3px solid #c4a35a; padding-bottom: 8px; }
table { width: 100%; border-collapse: collapse; }
th { background: #0f172a; color: white; text-align: right; padding: 5px; }
td { border-bottom: 1px solid #e2e8f0; padding: 4px; }
tr, td, th { break-inside: avoid; }
</style></head><body>
<header><div>${logo ? `<img src="${logo}" alt="OPAL LAB" width="42" height="42" />` : "OPAL LAB"}</div><div><h1>${escapeHtml(input.title)}</h1><div>${escapeHtml(new Date().toLocaleString("he-IL"))} · ${escapeHtml(input.producedBy)}</div><div>${escapeHtml(input.filters)}</div></div></header>
<table><thead><tr>${input.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${input.headers.length}">אין שורות</td></tr>`}</tbody></table>
<p>הפקת הדוח לא שינתה מלאי. ${input.rows.length} שורות.</p>
</body></html>`;
  const buffer = await htmlToPdfBuffer(html, { landscape: true, footerLabel: input.title });
  return { buffer, filename: "opal-inventory-dashboard.pdf" };
}
