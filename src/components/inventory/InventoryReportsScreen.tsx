"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileDown, Loader2, RefreshCw, Sheet } from "lucide-react";
import { Header } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MODULE_LABELS, REPORT_KINDS, REPORT_LABELS, type InventoryReportKind, type ReportModule } from "@/lib/inventory/inventory-reports";

type Kpi = { id: string; label: string; value: number; hint: string; delta: { value: number; label: string } | null };
type Item = {
  id: string;
  module: ReportModule;
  category: string;
  href: string;
  name: string;
  model: string | null;
  kind: string | null;
  kindLabel: string | null;
  measure: string | null;
  measureLabel: string | null;
  barcode: string;
  quantity: number | null;
  minQuantity: number | null;
  unit: string;
  status: string;
  statusLabel: string;
  lastCountAt: string | null;
  hasImage: boolean;
  imageUrl: string | null;
};
type Dashboard = {
  stockNote: string;
  usageNote: string;
  history: { assumed: boolean; bucket: string };
  kpis: Kpi[];
  countDelta: { value: number; label: string } | null;
  categories: { module: string; label: string; items: number; unitTotal: number | null; unit: string | null }[];
  stockChart: { id: string; label: string; value: number }[];
  movementSeries: { label: string; additions: number; reductions: number; counts: number }[];
  countChart: { id: string; label: string; value: number }[];
  control: { module: string; label: string; href: string; itemCount: number; lastCountAt: string | null; lastCounter: string; nextDue: string | null; status: string; completed: boolean; variance: number; pending: number }[];
  operational: { id: string; title: string; body: string; href: string; severity: string }[];
  recommendations: { id: string; title: string; body: string; href: string }[];
  materialUsage: { records: number };
  models: string[];
  employees: { id: string; name: string }[];
  items: Item[];
  itemTotal: number;
  page: number;
  pageSize: number;
};

const GROUPS: { title: string; kinds: InventoryReportKind[] }[] = [
  { title: "מצב מלאי", kinds: ["all-products", "current-stock", "by-category", "drills", "by-model", "low-zero"] },
  { title: "ספירות ובקרה", kinds: ["count-full", "uncounted", "differences", "count-status", "count-history"] },
  { title: "תנועות והיסטוריה", kinds: ["movements"] },
  { title: "תמונות וברקודים", kinds: ["with-media", "missing-media"] },
];

const HELP: Record<InventoryReportKind, string> = {
  "all-products": "כל פריטי המלאי הפעילים, בלי המלאי הקלאסי שהוסתר.",
  "current-stock": "היתרה העדכנית. לא יתרה משוערת לתאריך עבר.",
  "by-category": "אותם פריטים, מקובצים לפי קטגוריה.",
  "by-model": "פירוק לפי דגם וסוג חומר, כפי שהם שמורים.",
  drills: "דגם מקדח, חומר ומספר.",
  "count-full": "שורות הספירות בטווח, כולל פריטים שטרם נספרו.",
  "count-status": "האם הספירה התחילה, בתהליך, ממתינה או אושרה.",
  differences: "רק שורות עם הפרש אחרי ספירה.",
  uncounted: "שורות ספירה בלי כמות שנספרה. הן לא מוצגות כהושלמו.",
  "count-history": "ספירות שנשמרו, עם מבצע ומצב.",
  movements: "תוספות, הפחתות והתאמות ספירה בטווח.",
  "low-zero": "פריטים במינימום, באפס, או בלי כמות שהוגדרה.",
  "with-media": "פריטים ששמורים להם גם תמונה וגם ברקוד.",
  "missing-media": "פריטים בלי תמונה או בלי ברקוד סריקה.",
};

const STOCKS = [
  { id: "", label: "כל המצבים" },
  { id: "ok", label: "תקין" },
  { id: "low", label: "נמוך" },
  { id: "zero", label: "אפס" },
  { id: "negative", label: "שלילי" },
  { id: "unset", label: "כמות לא הוגדרה" },
  { id: "missing-image", label: "בלי תמונה" },
  { id: "missing-barcode", label: "בלי ברקוד" },
];

function qty(value: number | null) {
  return value === null ? "—" : String(value);
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleDateString("he-IL") : "—";
}

export async function downloadInventoryReport(params: Record<string, string | undefined>) {
  const format = params.format === "xlsx" ? "xlsx" : "pdf";
  const query = new URLSearchParams({ format });
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const response = await fetch(`/api/inventory/reports?${query.toString()}`, { credentials: "include" });
  const type = response.headers.get("content-type") ?? "";
  const expected = format === "pdf" ? "pdf" : "spreadsheet";
  if (!response.ok || !type.includes(expected)) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? "הפקת הדוח נכשלה");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `opal-inventory-${params.kind ?? "report"}.${format === "pdf" ? "pdf" : "xlsx"}`;
  link.click();
  URL.revokeObjectURL(url);
}

function Bars({ rows, onPick }: { rows: { id?: string; label: string; value: number }[]; onPick?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <button key={row.label} type="button" className="block w-full text-right" onClick={() => row.id && onPick?.(row.id)}>
          <span className="mb-1 flex justify-between text-xs text-slate-600"><span>{row.label}</span><span>{row.value}</span></span>
          <span className="block h-2 rounded-full bg-slate-100"><span className="block h-2 rounded-full bg-slate-900" style={{ width: `${(row.value / max) * 100}%` }} /></span>
        </button>
      ))}
    </div>
  );
}

function MovementChart({ rows }: { rows: Dashboard["movementSeries"] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">אין תנועות בטווח שנבחר.</p>;
  const max = Math.max(1, ...rows.flatMap((row) => [row.additions, row.reductions, row.counts]));
  const width = 640;
  const height = 160;
  const step = rows.length === 1 ? width : width / (rows.length - 1);
  const line = (key: "additions" | "reductions" | "counts") => rows.map((row, index) => `${index * step},${height - (row[key] / max) * (height - 16)}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 28}`} className="min-w-[520px]" role="img" aria-label="תנועות מלאי">
        <polyline fill="none" stroke="#0f172a" strokeWidth="2" points={line("additions")} />
        <polyline fill="none" stroke="#c4a35a" strokeWidth="2" points={line("reductions")} />
        <polyline fill="none" stroke="#64748b" strokeWidth="2" points={line("counts")} />
        {rows.map((row, index) => <text key={row.label} x={index * step} y={height + 18} fontSize="9" fill="#475569">{row.label.slice(5)}</text>)}
      </svg>
      <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span>כהה: תוספות</span><span>זהב: הפחתות</span><span>אפור: התאמות ספירה</span></p>
    </div>
  );
}

export function InventoryReportsScreen() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [stock, setStock] = useState("");
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"name" | "category" | "quantity" | "status">("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; total: number; columns: string[]; rows: string[][] } | null>(null);

  const params = useMemo(() => {
    const search = new URLSearchParams({ view: "dashboard", page: String(page), sort, dir: direction });
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    if (categories.length) search.set("categories", categories.join(","));
    if (model) search.set("model", model);
    if (stock) search.set("stock", stock);
    if (userId) search.set("userId", userId);
    if (query.trim()) search.set("q", query.trim());
    return search;
  }, [categories, direction, from, model, page, query, reloadKey, sort, stock, to, userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/inventory/reports?${params.toString()}`, { credentials: "include" });
        const json = (await response.json()) as { success?: boolean; data?: Dashboard; error?: { message?: string } };
        if (!json.success || !json.data) throw new Error(json.error?.message ?? "שגיאה בטעינה");
        if (!cancelled) setData(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, reloadKey]);

  function reportParams(kind: InventoryReportKind, format?: "pdf" | "xlsx") {
    return {
      kind,
      format,
      scope: categories.length || model || stock || userId || from || to ? "filtered" : "all",
      categories: categories.join(","),
      models: model,
      stock,
      userId,
      from,
      to,
      images: "1",
      barcodes: "1",
    };
  }

  async function produce(kind: InventoryReportKind, format: "pdf" | "xlsx") {
    setBusy(`${kind}-${format}`);
    setError(null);
    try {
      await downloadInventoryReport(reportParams(kind, format));
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפקת הדוח נכשלה");
    } finally {
      setBusy(null);
    }
  }

  async function showPreview(kind: InventoryReportKind) {
    setBusy(`${kind}-preview`);
    setError(null);
    try {
      const search = new URLSearchParams(reportParams(kind) as Record<string, string>);
      search.set("format", "preview");
      const response = await fetch(`/api/inventory/reports?${search.toString()}`, { credentials: "include" });
      const json = (await response.json()) as { success?: boolean; data?: { title: string; total: number; columns: string[]; rows: string[][] }; error?: { message?: string } };
      if (!json.success || !json.data) throw new Error(json.error?.message ?? "התצוגה נכשלה");
      setPreview(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "התצוגה נכשלה");
    } finally {
      setBusy(null);
    }
  }

  function pickKpi(id: string) {
    if (id === "items") setStock("");
    else if (id === "low" || id === "zero" || id === "missing-image" || id === "missing-barcode") setStock(id);
    else if (id === "missed" || id === "pending") document.getElementById("count-control")?.scrollIntoView({ behavior: "smooth" });
    else if (id === "movements") document.getElementById("movements")?.scrollIntoView({ behavior: "smooth" });
    setPage(1);
  }

  function toggleSort(next: "name" | "category" | "quantity" | "status") {
    if (sort === next) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection("asc"); }
    setPage(1);
  }

  const kindLabel = data?.items.find((item) => item.kindLabel)?.kindLabel ?? "מאפיין";
  const measureLabel = data?.items.find((item) => item.measureLabel)?.measureLabel ?? "מידה";
  const pages = data ? Math.max(1, Math.ceil(data.itemTotal / data.pageSize)) : 1;

  return (
    <>
      <Header title="דוחות וניתוח מלאי" description="מצב המלאים, ספירות, תנועות ודוחות מנתוני המערכת" actions={<div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" onClick={() => setReloadKey((current) => current + 1)}><RefreshCw className="h-4 w-4" />רענון</Button><Button size="sm" disabled={Boolean(busy)} onClick={() => void produce("current-stock", "pdf")}>{busy === "current-stock-pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF</Button><Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void produce("current-stock", "xlsx")}>{busy === "current-stock-xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sheet className="h-4 w-4" />}Excel</Button><Link href="/inventory" className="text-sm text-slate-600">חזרה למלאי</Link></div>} />
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" open>
        <summary className="cursor-pointer text-sm font-medium text-slate-800">סינון</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-slate-500">מתאריך<input aria-label="מתאריך" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">עד תאריך<input aria-label="עד תאריך" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">דגם<select aria-label="דגם" value={model} onChange={(event) => { setModel(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"><option value="">כל הדגמים</option>{data?.models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-xs text-slate-500">מצב מלאי<select aria-label="מצב מלאי" value={stock} onChange={(event) => { setStock(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm">{STOCKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="text-xs text-slate-500">עובד<select aria-label="עובד" value={userId} onChange={(event) => { setUserId(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"><option value="">כל העובדים</option>{data?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(MODULE_LABELS).filter(([id]) => id !== "CLASSIC").map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setCategories((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); setPage(1); }} className={`rounded-full border px-3 py-1 text-xs ${categories.includes(id) ? "border-opal-gold bg-opal-gold text-white" : "border-slate-200 bg-white"}`}>{label}</button>
          ))}
        </div>
      </details>
      {data && <p className="mb-3 text-xs text-slate-500">{data.stockNote}{data.history.assumed ? " גרף התנועות מציג 30 ימים אחרונים כל עוד לא נבחר טווח." : ""}</p>}
      <section className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(data?.kpis ?? []).map((kpi) => (
          <button key={kpi.id} type="button" onClick={() => pickKpi(kpi.id)} className={`rounded-2xl border bg-white p-3 text-right shadow-sm ${stock === kpi.id ? "border-opal-gold" : "border-slate-200"}`}>
            <span className="block text-xs text-slate-500">{kpi.label}</span>
            <span className="mt-1 block text-2xl font-bold text-slate-900">{loading ? "…" : kpi.value}</span>
            <span className="mt-1 block text-[11px] text-slate-500">{kpi.hint}</span>
            {kpi.delta && <span className="mt-1 block text-[11px] text-slate-700">{kpi.delta.value > 0 ? "+" : ""}{kpi.delta.value} {kpi.delta.label}</span>}
          </button>
        ))}
      </section>
      <section className="mb-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">פריטים לפי קטגוריה</h2>
          <Bars rows={(data?.categories ?? []).map((row) => ({ id: row.module, label: row.label, value: row.items }))} onPick={(id) => { setCategories([id]); setPage(1); }} />
          <p className="mt-2 text-[11px] text-slate-500">האורך הוא מספר פריטי מלאי סופיים, לא דגמים בלי גודל. סכום יחידות מוצג רק כשכל הכמויות בקטגוריה הוגדרו ובאותה יחידה.</p>
          <div className="mt-2 space-y-1 text-[11px] text-slate-600">
            {(data?.categories ?? []).filter((row) => row.unitTotal !== null).map((row) => <p key={row.module}>{row.label}: {row.unitTotal} {row.unit}. זה סכום כמויות באותה יחידה, לא מספר פריטים.</p>)}
          </div>
        </article>
        <article id="movements" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">תנועות מלאי</h2>
          <MovementChart rows={data?.movementSeries ?? []} />
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">ספירות</h2>
          <Bars rows={data?.countChart ?? []} />
          {data?.countDelta && <p className="mt-2 text-[11px] text-slate-500">{data.countDelta.value > 0 ? "+" : ""}{data.countDelta.value} {data.countDelta.label}</p>}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-900">מצב מלאי נוכחי</h2>
          <Bars rows={data?.stockChart ?? []} onPick={(id) => { setStock(id); setPage(1); }} />
        </article>
      </section>
      <section id="count-control" className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-900">בקרת ספירות</h2>
        <p className="mb-3 text-xs text-slate-500">ספירה שלא הושלמה נשארת במצב הפתוח שלה.</p>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-right text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="px-2 py-2">קטגוריה</th><th>פריטים</th><th>ספירה אחרונה</th><th>עובד</th><th>יעד הבא</th><th>סטטוס</th><th>הפרשים</th><th>ממתינות</th></tr></thead>
            <tbody>
              {(data?.control ?? []).map((row) => (
                <tr key={row.module} className="border-t border-slate-100">
                  <td className="px-2 py-2"><Link className="font-medium text-slate-900 underline-offset-2 hover:underline" href={row.href}>{row.label}</Link></td>
                  <td>{row.itemCount}</td>
                  <td>{when(row.lastCountAt)}</td>
                  <td>{row.lastCounter || "—"}</td>
                  <td>{when(row.nextDue)}</td>
                  <td>{row.status}</td>
                  <td>{row.variance}</td>
                  <td>{row.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mb-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-slate-900">דורש טיפול</h2>
          <div className="space-y-2">
            {(data?.operational ?? []).length === 0 && <p className="text-sm text-slate-500">אין התראות תפעוליות פתוחות בהרשאה שלך.</p>}
            {data?.operational.map((alert) => <Link key={alert.id} href={alert.href} className="block rounded-xl border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"><span className="font-medium text-slate-900">{alert.title}</span><span className="mt-1 block text-xs text-slate-500">{alert.body}</span></Link>)}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-slate-900">השלמת נתונים</h2>
          <p className="mb-2 text-xs text-slate-500">אלה לא התראות חוסר מלאי.</p>
          {data?.recommendations.map((item) => <p key={item.id} className="mb-2 text-sm text-slate-700">{item.body}</p>)}
          <p className="text-sm text-slate-700">{data?.usageNote} בתקופה: {data?.materialUsage.records ?? 0} רשומות תיעוד.</p>
        </article>
      </section>
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">טבלת מלאי</h2>
          <input aria-label="חיפוש" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="חיפוש שם, דגם או ברקוד" className="h-10 w-full rounded-lg border px-3 text-sm sm:w-72" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-right text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2">תמונה</th>
                <th><button type="button" onClick={() => toggleSort("category")}>קטגוריה</button></th>
                <th><button type="button" onClick={() => toggleSort("name")}>פריט</button></th>
                <th>{kindLabel}</th>
                <th>{measureLabel}</th>
                <th>ברקוד</th>
                <th><button type="button" onClick={() => toggleSort("quantity")}>כמות</button></th>
                <th>מינימום</th>
                <th><button type="button" onClick={() => toggleSort("status")}>סטטוס</button></th>
                <th>ספירה אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-2 py-2">{item.imageUrl ? <button type="button" onClick={() => setZoom(item.imageUrl)}><img src={item.imageUrl} alt="" className="h-12 w-12 rounded-xl bg-white object-contain" loading="lazy" /></button> : <span className="text-xs text-slate-400">הוסף תמונה</span>}</td>
                  <td>{item.category}</td>
                  <td><button type="button" className="text-right font-medium text-slate-900" onClick={() => setSelected(item)}>{item.model || item.name}</button></td>
                  <td>{item.kind || ""}</td>
                  <td>{item.measure || ""}</td>
                  <td className="font-mono text-xs">{item.barcode}</td>
                  <td>{qty(item.quantity)} {item.quantity === null ? "" : item.unit}</td>
                  <td>{qty(item.minQuantity)}</td>
                  <td>{item.statusLabel}</td>
                  <td>{when(item.lastCountAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>{data ? `${data.itemTotal} פריטים` : ""}</span>
          <span className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>הקודם</Button><span>{page} / {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>הבא</Button></span>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="font-bold text-slate-900">מרכז דוחות</h2>
        {GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-sm font-medium text-slate-700">{group.title}</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.kinds.map((kind) => (
                <article key={kind} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="font-bold text-slate-900">{REPORT_LABELS[kind]}</h4>
                  <p className="mt-1 text-xs text-slate-500">{HELP[kind]}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void showPreview(kind)}>צפייה</Button>
                    <Button size="sm" disabled={Boolean(busy)} onClick={() => void produce(kind, "pdf")}>PDF</Button>
                    <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void produce(kind, "xlsx")}>Excel</Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">שימוש בחומרים בייצור</h3>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:max-w-xl">
            <h4 className="font-bold text-slate-900">דוח שימוש בחומרים במעקב ייצור</h4>
            <p className="mt-1 text-xs text-slate-500">תיעוד בחירת זירקוניה בעיצוב ובהדפסה. מספר הרשומות אינו כמות שנגרעה מהמלאי.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="rounded-lg border border-slate-200 px-3 py-2 text-sm" href="/inventory/material-usage">צפייה</Link>
              <a className="rounded-lg bg-opal-gold px-3 py-2 text-sm text-white" href={`/api/workflow/material-usage?format=pdf${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}>PDF</a>
              <a className="rounded-lg border border-slate-200 px-3 py-2 text-sm" href={`/api/workflow/material-usage?format=xlsx${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`}>Excel</a>
            </div>
          </article>
        </div>
        <p className="text-[11px] text-slate-400">{REPORT_KINDS.length} דוחות מלאי פעילים, בנוסף לדוח השימוש בייצור.</p>
      </section>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? "פריט"} className="max-w-lg">
        {selected && (
          <div className="space-y-2 text-sm">
            {selected.imageUrl && <img src={selected.imageUrl} alt="" className="mx-auto max-h-60 w-full object-contain" />}
            <p>{selected.category}</p>
            <p>כמות {qty(selected.quantity)} {selected.quantity === null ? "" : selected.unit}</p>
            <p>מינימום {qty(selected.minQuantity)}</p>
            <p>סטטוס {selected.statusLabel}</p>
            <p>ברקוד {selected.barcode || "אין"}</p>
            <p>ספירה אחרונה {when(selected.lastCountAt)}</p>
            <Link className="inline-block text-slate-900 underline" href={selected.href}>פתיחת הקטגוריה</Link>
          </div>
        )}
      </Modal>
      <Modal open={Boolean(zoom)} onClose={() => setZoom(null)} title="תמונה" className="max-w-3xl">
        {zoom && <img src={zoom} alt="" className="max-h-[70vh] w-full object-contain" />}
      </Modal>
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.title ?? "תצוגה"} className="max-w-3xl">
        {preview && (
          <div className="overflow-x-auto text-sm">
            <p className="mb-2 text-slate-500">{preview.total} רשומות. מוצגות עד 12.</p>
            <table className="w-full text-right"><thead><tr>{preview.columns.map((column) => <th key={column} className="px-2 py-1">{column}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-1">{cell}</td>)}</tr>)}</tbody></table>
          </div>
        )}
      </Modal>
    </>
  );
}
