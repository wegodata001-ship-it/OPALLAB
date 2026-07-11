import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const ROOT = path.resolve(import.meta.dirname, "..");
const SVG_PATH = path.join(ROOT, "assets", "opal-lab-icon.svg");
const PUBLIC = path.join(ROOT, "public");
const APP = path.join(ROOT, "src", "app");

async function png(size: number): Promise<Buffer> {
  return sharp(SVG_PATH).resize(size, size).png().toBuffer();
}

async function main() {
  const svg = fs.readFileSync(SVG_PATH);

  const [p16, p32, p180, p192, p512] = await Promise.all([
    png(16),
    png(32),
    png(180),
    png(192),
    png(512),
  ]);

  fs.mkdirSync(PUBLIC, { recursive: true });
  fs.mkdirSync(APP, { recursive: true });

  fs.writeFileSync(path.join(PUBLIC, "favicon-16x16.png"), p16);
  fs.writeFileSync(path.join(PUBLIC, "favicon-32x32.png"), p32);
  fs.writeFileSync(path.join(PUBLIC, "apple-touch-icon.png"), p180);
  fs.writeFileSync(path.join(PUBLIC, "android-chrome-192x192.png"), p192);
  fs.writeFileSync(path.join(PUBLIC, "android-chrome-512x512.png"), p512);

  const ico = await toIco([p16, p32]);
  fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), ico);

  fs.writeFileSync(path.join(APP, "icon.png"), p32);
  fs.writeFileSync(path.join(APP, "apple-icon.png"), p180);

  fs.writeFileSync(
    path.join(PUBLIC, "site.webmanifest"),
    JSON.stringify(
      {
        name: "OPAL LAB",
        short_name: "OPAL LAB",
        description: "מערכת ניהול מעבדת שיניים דיגיטלית",
        start_url: "/",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          {
            src: "/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      null,
      2,
    ),
  );

  console.log("Generated favicon + app icons in public/ and src/app/");
  void svg;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
