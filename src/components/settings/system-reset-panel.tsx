"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { apiGet, apiPost } from "@/lib/api/client";
import { userHasRole } from "@/lib/user-roles";
import { useApp } from "@/providers/AppProvider";

type ResetStatus = {
  enabled: boolean;
  allowed: boolean;
  isOwner: boolean;
};

export function SystemResetPanel() {
  const { currentUser } = useApp();
  const [status, setStatus] = useState<ResetStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isOwner = Boolean(currentUser && userHasRole(currentUser, "OWNER"));

  useEffect(() => {
    if (!isOwner) return;
    void apiGet<ResetStatus>("/api/system/reset")
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, allowed: false, isOwner: true }));
  }, [isOwner]);

  if (!isOwner) return null;

  const canSubmit = confirmText.trim() === "DELETE" && !loading;
  const resetEnabled = status?.enabled ?? false;

  const runReset = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/system/reset", {
        confirmation: "DELETE",
        reason: "Client handover reset",
      });
      setDone(true);
      window.setTimeout(() => {
        window.location.href = "/dashboard";
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "האיפוס נכשל");
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="mt-8 border-red-200 bg-red-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="h-5 w-5" />
            איפוס נתוני מערכת
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            מוחק רק <strong>הזמנות</strong>, <strong>משלוחים</strong> ו<strong>נוכחות</strong>
            (כולל קבצי הזמנה ותמונות נוכחות) — לפני מסירת המערכת ללקוח.
          </p>
          <p className="text-xs text-slate-500">
            נשארים: משתמשים, הרשאות, מלאי, רופאים, שליחים והגדרות מערכת.
          </p>
          {!resetEnabled && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              האיפוס כבוי בסביבה זו. בפרודקשן יש להגדיר <code className="text-xs">ALLOW_SYSTEM_RESET=true</code>.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
            disabled={!resetEnabled}
            onClick={() => {
              setConfirmText("");
              setError(null);
              setDone(false);
              setOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 ml-1" />
            איפוס הזמנות / משלוחים / נוכחות
          </Button>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => { if (!loading) setOpen(false); }} title="אזהרה — איפוס לפני מסירה" className="max-w-lg">
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-2">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              יימחקו כל ההזמנות, המשלוחים והנוכחות.
            </p>
            <p>המשתמשים, המלאי, הרופאים וההרשאות יישארו.</p>
            <p className="font-medium">לא ניתן לשחזר את הפעולה.</p>
          </div>

          <div>
            <Label>הקלד DELETE לאישור</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={loading || done}
              className="font-mono tracking-wider"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {done && <p className="text-sm text-emerald-700">האיפוס הושלם — מרענן...</p>}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" disabled={loading} onClick={() => setOpen(false)}>
              בטל
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!canSubmit || done}
              onClick={() => void runReset()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  מוחק...
                </>
              ) : (
                "מחק הכל"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
