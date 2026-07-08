"use client";

import { Button } from "@/components/ui/button";
import { shareWhatsApp, printHtml } from "@/lib/export";
import { MessageCircle, FileDown } from "lucide-react";

interface ExportActionsProps {
  title: string;
  whatsappText: string;
  pdfHtml: string;
  phone?: string;
  className?: string;
}

export function ExportActions({ title, whatsappText, pdfHtml, phone, className }: ExportActionsProps) {
  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => shareWhatsApp(whatsappText, phone)}
        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => printHtml(title, pdfHtml)}
      >
        <FileDown className="h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}
