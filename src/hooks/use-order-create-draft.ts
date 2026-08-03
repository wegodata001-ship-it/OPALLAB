"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/client";
import {
  clearDraftSession,
  loadDraftSession,
  saveDraftSession,
} from "@/lib/orders/order-draft-session";
import { uploadAudit } from "@/lib/orders/upload-audit";
import type { CreateOrderInput, Order, OrderWithRelations, UpdateOrderInput } from "@/lib/types";

type DraftReady = {
  orderId: string | null;
  ready: boolean;
  error: string | null;
  ensureDraft: (doctorId?: string) => Promise<string | null>;
  finalize: (input: CreateOrderInput) => Promise<Order>;
  saveDraftFields: (fields: Omit<UpdateOrderInput, "orderId">) => Promise<void>;
  discard: () => Promise<void>;
  keepAndLeave: () => void;
  hydrateFromDraft: OrderWithRelations | null;
};

/**
 * Creates / resumes a server-side temporary order draft so files can upload
 * before the user clicks save. Draft is invisible in order lists.
 */
export function useOrderCreateDraft(
  draftKey: string,
  options?: { doctorId?: string; enabled?: boolean },
): DraftReady {
  const enabled = options?.enabled !== false;
  const doctorIdOpt = options?.doctorId;
  const [orderId, setOrderId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(!enabled);
  const [error, setError] = useState<string | null>(null);
  const [hydrateFromDraft, setHydrateFromDraft] = useState<OrderWithRelations | null>(null);
  const creatingRef = useRef<Promise<string | null> | null>(null);
  const orderIdRef = useRef<string | null>(null);
  const doctorIdOptRef = useRef(doctorIdOpt);
  useEffect(() => {
    doctorIdOptRef.current = doctorIdOpt;
  }, [doctorIdOpt]);

  const ensureDraft = useCallback(async (doctorId?: string) => {
    if (orderIdRef.current) return orderIdRef.current;
    if (creatingRef.current) return creatingRef.current;

    creatingRef.current = (async () => {
      try {
        const stored = loadDraftSession(draftKey);
          if (stored?.orderId) {
            try {
              const existing = await apiGet<{ order: OrderWithRelations }>(
                `/api/orders/draft/${stored.orderId}`,
              );
              orderIdRef.current = existing.order.id;
              startTransition(() => {
                setOrderId(existing.order.id);
                setHydrateFromDraft(existing.order);
              });
              saveDraftSession(draftKey, existing.order.id);
              uploadAudit({
                step: "CREATE_DRAFT",
                orderId: existing.order.id,
                draft: true,
                success: true,
                count: existing.order.files?.length ?? 0,
                extra: { resumed: true },
              });
              return existing.order.id;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              // Only drop session when draft is truly gone — not on transient network errors.
              const notFound =
                /לא נמצא|not found|404/i.test(message) || message.includes("טיוטה לא נמצאה");
              if (notFound) {
                clearDraftSession(draftKey);
              } else {
                uploadAudit({
                  step: "CREATE_DRAFT",
                  orderId: stored.orderId,
                  success: false,
                  error: message,
                  extra: { resumed: false, keptSession: true },
                });
                throw err;
              }
            }
          }

        const created = await apiPost<{ order: Order }>("/api/orders/draft", {
          doctorId: doctorId ?? doctorIdOptRef.current,
        });
        orderIdRef.current = created.order.id;
        startTransition(() => {
          setOrderId(created.order.id);
          setHydrateFromDraft(null);
        });
        saveDraftSession(draftKey, created.order.id);
        uploadAudit({
          step: "CREATE_DRAFT",
          orderId: created.order.id,
          draft: true,
          success: true,
          extra: { resumed: false, serialNumber: created.order.serialNumber },
        });
        return created.order.id;
      } catch (err) {
        const message = err instanceof Error ? err.message : "יצירת טיוטה נכשלה";
        startTransition(() => setError(message));
        uploadAudit({ step: "CREATE_DRAFT", success: false, error: message });
        return null;
      } finally {
        creatingRef.current = null;
      }
    })();

    return creatingRef.current;
  }, [draftKey]);

  useEffect(() => {
    if (!enabled) {
      startTransition(() => setBootstrapped(true));
      return;
    }
    let cancelled = false;
    startTransition(() => setBootstrapped(false));
    void (async () => {
      await ensureDraft();
      if (!cancelled) startTransition(() => setBootstrapped(true));
    })();
    return () => {
      cancelled = true;
    };
  }, [draftKey, enabled, ensureDraft]);

  // Keep draft doctorId in sync when staff selects a doctor
  useEffect(() => {
    if (!orderId || !doctorIdOpt) return;
    void apiPatch("/api/orders/draft", {
      orderId,
      doctorId: doctorIdOpt,
    }).catch(() => undefined);
  }, [orderId, doctorIdOpt]);

  const finalize = useCallback(
    async (input: CreateOrderInput) => {
      const id = orderIdRef.current ?? (await ensureDraft(input.doctorId));
      if (!id) throw new Error(error || "לא ניתן לשמור — טיוטה לא נוצרה");
      const result = await apiPut<{ order: Order }>("/api/orders/draft", {
        ...input,
        orderId: id,
      });
      clearDraftSession(draftKey);
      orderIdRef.current = null;
      startTransition(() => {
        setOrderId(null);
        setHydrateFromDraft(null);
      });
      return result.order;
    },
    [draftKey, ensureDraft, error],
  );

  const saveDraftFields = useCallback(
    async (fields: Omit<UpdateOrderInput, "orderId">) => {
      const id = orderIdRef.current ?? (await ensureDraft());
      if (!id) return;
      await apiPatch("/api/orders/draft", { ...fields, orderId: id });
    },
    [ensureDraft],
  );

  const discard = useCallback(async () => {
    const id = orderIdRef.current ?? loadDraftSession(draftKey)?.orderId;
    if (id) {
      try {
        await apiDelete(`/api/orders/draft?orderId=${encodeURIComponent(id)}`);
      } catch {
        /* already gone */
      }
    }
    clearDraftSession(draftKey);
    orderIdRef.current = null;
    startTransition(() => {
      setOrderId(null);
      setHydrateFromDraft(null);
    });
  }, [draftKey]);

  const keepAndLeave = useCallback(() => {
    const id = orderIdRef.current ?? orderId;
    if (id) saveDraftSession(draftKey, id);
  }, [draftKey, orderId]);

  return {
    orderId,
    ready: !enabled || bootstrapped,
    error,
    ensureDraft,
    finalize,
    saveDraftFields,
    discard,
    keepAndLeave,
    hydrateFromDraft,
  };
}
