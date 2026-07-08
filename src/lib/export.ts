import { LAB_INFO } from "@/lib/constants/labels";

export function shareWhatsApp(text: string, phone?: string) {
  const encoded = encodeURIComponent(text);
  const url = phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank");
}

export function downloadTextAsFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printHtml(title: string, bodyHtml: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="he"><head>
    <meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:800px;margin:0 auto}
      h1{color:#a8861f;border-bottom:2px solid #c9a227;padding-bottom:8px}
      .meta{color:#666;font-size:14px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:14px}
      th{background:#f5ecd3}
      .footer{margin-top:40px;font-size:12px;color:#888;text-align:center}
    </style></head><body>
    <h1>${LAB_INFO.fullName}</h1>
    <div class="meta">${LAB_INFO.subtitle} · ${LAB_INFO.phone} · ${LAB_INFO.email}</div>
    ${bodyHtml}
    <div class="footer">${LAB_INFO.businessId} · ${LAB_INFO.location}</div>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
