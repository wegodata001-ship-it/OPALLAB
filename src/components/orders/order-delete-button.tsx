"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Label, Textarea } from "@/components/ui/input";
import { apiPost } from "@/lib/api/client";
import { useApp } from "@/providers/AppProvider";
import type { OrderWithRelations } from "@/lib/types";

type OrderDeleteButtonProps = {
  order: OrderWithRelations;
};

export function OrderDeleteButton({ order }: OrderDeleteButtonProps) {
  const router = useRouter();
  const { refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onConfirm = async () => {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/orders/${order.id}/soft-delete`, {
        reason: reason.trim() || null,
      });
      setOpen(false);
      await refresh();
      router.push("/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        מחק הזמנה
      </Button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="מחיקת הזמנה" className="max-w-md">
        <div className="space-y-4 text-sm">
          <p className="text-slate-700">האם אתה בטוח שברצונך למחוק את ההזמנה?</p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <dt className="text-slate-500">מספר הזמנה:</dt>
            <dd className="font-semibold text-slate-900">{order.serialNumber}</dd>
            <dt className="text-slate-500">מטופל:</dt>
            <dd className="font-medium">{order.patient.name}</dd>
            <dt className="text-slate-500">רופא:</dt>
            <dd className="font-medium">{order.doctor?.name ?? "—"}</dd>
          </dl>

          <div>
            <Label htmlFor="delete-reason">סיבת מחיקה (אופציונלי)</Label>
            <Textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="למשל: הזמנה כפולה"
              className="mt-1"
            />
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            ⚠ פעולה זו אינה ניתנת לביטול.
          </p>

          {error && <p className="text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void onConfirm()}
            >
              {busy ? "מוחק..." : "מחק הזמנה"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Permanent delete confirm — type DELETE. */
export function PermanentDeleteDialog({
  open,
  onClose,
  serialNumber,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  serialNumber: string;
  onConfirm: (confirm: string) => void;
  busy?: boolean;
  error?: string;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="מחיקה סופית" className="max-w-md">
      <div className="space-y-4 text-sm">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-900">
          ⚠ פעולה זו תמחק את ההזמנה <strong>{serialNumber}</strong> לצמיתות.
          <br />
          לא ניתן יהיה לשחזר אותה. כל הקבצים והשיוכים יימחקו.
        </p>
        <div>
          <Label htmlFor="confirm-delete">הקלד DELETE כדי לאשר</Label>
          <Input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 font-mono tracking-widest"
            autoComplete="off"
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            ביטול
          </Button>
          <Button
            type="button"
            disabled={busy || typed !== "DELETE"}
            className="bg-red-700 text-white hover:bg-red-800"
            onClick={() => onConfirm(typed)}
          >
            {busy ? "מוחק..." : "מחק לצמיתות"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
