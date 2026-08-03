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

/** Shared print/PDF HTML shell — Rubik + full RTL for Hebrew/Arabic/English. */
export function printHtml(title: string, bodyHtml: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 16mm; }
    html { direction: rtl; unicode-bidi: embed; }
    body {
      font-family: "Rubik", "Noto Sans Arabic", Arial, sans-serif;
      direction: rtl;
      unicode-bidi: embed;
      padding: 28px;
      color: #111;
      max-width: 900px;
      margin: 0 auto;
      font-size: 14px;
      line-height: 1.55;
      text-align: right;
    }
    h1, h2, h3 {
      color: #a8861f;
      text-align: right;
      font-weight: 700;
      line-height: 1.35;
    }
    h1 { border-bottom: 2px solid #c9a227; padding-bottom: 8px; font-size: 22px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 22px; text-align: right; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; }
    th, td {
      border: 1px solid #ddd;
      padding: 10px 12px;
      text-align: right;
      font-size: 13px;
      vertical-align: top;
      unicode-bidi: embed;
    }
    th { background: #f5ecd3; font-weight: 700; }
    img { max-width: 100%; height: auto; }
    .footer { margin-top: 40px; font-size: 12px; color: #888; text-align: center; }
    .ltr, [dir="ltr"] { direction: ltr; unicode-bidi: embed; text-align: left; display: inline-block; }
  </style>
</head>
<body>
  <h1>${LAB_INFO.fullName}</h1>
  <div class="meta">${LAB_INFO.subtitle} · ${LAB_INFO.phone} · ${LAB_INFO.email}</div>
  ${bodyHtml}
  <div class="footer">${LAB_INFO.businessId} · ${LAB_INFO.location}</div>
</body>
</html>`);
  win.document.close();
  win.focus();
  // Wait for webfonts before print so Hebrew glyphs are not missing.
  setTimeout(() => win.print(), 700);
}
