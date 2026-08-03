"use client";

import { Box } from "lucide-react";
import type { OrderFile } from "@/lib/types";

/** Prefer persisted Storage thumbnail — never re-download/reparse the mesh for list thumbs. */
export function FileModelThumb({ file }: { file: OrderFile }) {
  if (file.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={file.thumbnailUrl} alt="" className="h-full w-full object-cover" />
    );
  }

  return <Box className="h-6 w-6 text-opal-gold" />;
}
