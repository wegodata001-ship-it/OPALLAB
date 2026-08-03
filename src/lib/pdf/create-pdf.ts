import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { ensurePdfFonts, PDF_DEFAULT_FONT } from "@/lib/pdf/fonts";

export async function createPdfBuffer(
  docDefinition: TDocumentDefinitions,
): Promise<Buffer> {
  const pdfmake = ensurePdfFonts();
  const definition: TDocumentDefinitions = {
    ...docDefinition,
    defaultStyle: {
      font: PDF_DEFAULT_FONT,
      fontSize: 10,
      alignment: "right",
      ...(docDefinition.defaultStyle ?? {}),
    },
  };
  return (await pdfmake.createPdf(definition).getBuffer()) as Buffer;
}

export function pdfResponse(
  buffer: Buffer,
  filename: string,
): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(buffer.byteLength),
    },
  });
}
