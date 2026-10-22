/**
 * HTML → PDF via headless Chromium.
 * Native RTL/BiDi — no pdfmake visual reorder hacks.
 */
import type { Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = await import("puppeteer");
      return puppeteer.default.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--font-render-hinting=none",
          "--disable-dev-shm-usage",
        ],
      });
    })();
  }
  return browserPromise;
}

export async function htmlToPdfBuffer(
  html: string,
  opts?: { landscape?: boolean; footerLabel?: string },
): Promise<Buffer> {
  const landscape = opts?.landscape ?? true;
  const footerLabel = opts?.footerLabel ?? "Attendance Report";
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "18mm", right: "10mm", bottom: "14mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;font-size:8px;padding:0 10mm;direction:rtl;font-family:Arial,sans-serif;
          display:flex;justify-content:space-between;align-items:center;color:#64748b;">
          <span style="direction:ltr;">OPAL LAB · ${footerLabel}</span>
          <span>עמוד <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          <span style="direction:ltr;">${footerLabel}</span>
        </div>`,
    });

    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
