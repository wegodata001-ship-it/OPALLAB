"use client";

import { Button } from "@/components/ui/button";

type DraftLeaveDialogProps = {
  open: boolean;
  busy?: boolean;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onContinue: () => void;
};

/** Shown when leaving create-order with uploaded files before final save. */
export function DraftLeaveDialog({
  open,
  busy,
  onSaveDraft,
  onDiscard,
  onContinue,
}: DraftLeaveDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onContinue} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
        <div>
          <p className="font-bold text-slate-900 text-base">קיימים קבצים שלא נשמרו</p>
          <p className="text-sm text-slate-600 mt-1">
            ההזמנה עדיין לא נשמרה. מה ברצונך לעשות?
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={onSaveDraft} disabled={busy} className="w-full">
            שמור טיוטה
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            disabled={busy}
            className="w-full text-red-600 border-red-200 hover:bg-red-50"
          >
            מחק
          </Button>
          <Button type="button" variant="ghost" onClick={onContinue} disabled={busy} className="w-full">
            חזור לעריכה
          </Button>
        </div>
      </div>
    </div>
  );
}
