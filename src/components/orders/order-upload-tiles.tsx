"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { FileText } from "lucide-react";
import { FileManagerV2 } from "@/components/file-manager-v2/file-manager-v2";
import { FmGlobalProgress } from "@/components/file-manager-v2/fm-global-progress";
import type { FileManagerV2Handle, FmUploadAggregate } from "@/lib/file-manager-v2/types";
import { mergeAggregates } from "@/lib/file-manager-v2/upload-state";
import { cn } from "@/lib/utils";
import {
  ORDER_UPLOAD_SLOTS,
  type OrderUploadSlotDef,
  type OrderUploadSlotId,
} from "@/lib/orders/upload-slots";
import type { PendingSlotUpload } from "@/lib/orders/persist-slot-uploads";
import type { UploadVersionMode } from "@/lib/orders/upload-with-progress";

export type { PendingSlotUpload, FmUploadAggregate };

export type OrderUploadTilesHandle = {
  getPendingUploads: () => PendingSlotUpload[];
  uploadAll: (orderId: string, pending?: PendingSlotUpload[]) => Promise<void>;
  clear: () => Promise<void>;
  hasFiles: () => boolean;
  hasUploadedFiles: () => boolean;
  hasBlockingUploads: () => boolean;
  waitForUploads: (timeoutMs?: number) => Promise<void>;
  getUploadAggregate: () => FmUploadAggregate;
  askVersionMode: (
    fileName: string,
    existingName: string,
    existingVersion: number,
  ) => Promise<UploadVersionMode | null>;
};

interface OrderUploadTilesProps {
  draftKey: string;
  className?: string;
  orderId?: string;
  ensureOrderId?: () => Promise<string | null>;
  onChanged?: () => void;
  onUploadStateChange?: (state: FmUploadAggregate) => void;
}

function aggregatesEqual(a: FmUploadAggregate, b: FmUploadAggregate): boolean {
  return (
    a.total === b.total &&
    a.queued === b.queued &&
    a.uploading === b.uploading &&
    a.done === b.done &&
    a.error === b.error &&
    a.overallProgress === b.overallProgress &&
    a.isUploading === b.isUploading &&
    a.isComplete === b.isComplete &&
    a.hasBlocking === b.hasBlocking
  );
}

/** Static illustration card — never replaced by uploads. */
function SlotIllustrationCard({ def }: { def: OrderUploadSlotDef }) {
  return (
    <div className="relative aspect-square w-full rounded-2xl border-2 border-slate-300 bg-white overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-between px-2 pt-2 pb-2.5">
        <div className="flex-1 w-full flex items-center justify-center min-h-0">
          {def.guideSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={def.guideSrc}
              alt=""
              aria-hidden
              className="h-[70%] w-[70%] object-contain opacity-90"
              draggable={false}
            />
          ) : (
            <FileText className="h-[42%] w-[42%] text-slate-300" strokeWidth={1.25} />
          )}
        </div>
        <div className="shrink-0 text-center space-y-0.5">
          <p className="text-xs font-bold text-slate-800 leading-tight">{def.label}</p>
          <p className="text-[10px] text-slate-400">{def.hint}</p>
        </div>
      </div>
    </div>
  );
}

function SlotWithFileManager({
  def,
  orderId,
  ensureOrderId,
  onChanged,
  fmRef,
  onSlotStateChange,
}: {
  def: OrderUploadSlotDef;
  orderId?: string;
  ensureOrderId?: () => Promise<string | null>;
  onChanged?: () => void;
  fmRef: (handle: FileManagerV2Handle | null) => void;
  onSlotStateChange: (slotId: OrderUploadSlotId, state: FmUploadAggregate) => void;
}) {
  // Stable per-slot callback — must not be recreated each parent render.
  const onStateChange = useCallback(
    (state: FmUploadAggregate) => onSlotStateChange(def.id, state),
    [def.id, onSlotStateChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <SlotIllustrationCard def={def} />
      <FileManagerV2
        ref={fmRef}
        uploadSlotId={def.id}
        orderId={orderId}
        ensureOrderId={ensureOrderId}
        onChanged={onChanged}
        onUploadStateChange={onStateChange}
      />
    </div>
  );
}

export const OrderUploadTiles = forwardRef<OrderUploadTilesHandle, OrderUploadTilesProps>(
  function OrderUploadTiles(
    { className, orderId, ensureOrderId, onChanged, onUploadStateChange },
    ref,
  ) {
    const fmHandles = useRef<Map<OrderUploadSlotId, FileManagerV2Handle>>(new Map());
    const slotStates = useRef<Map<OrderUploadSlotId, FmUploadAggregate>>(new Map());
    const fmRefCallbacks = useRef(
      new Map<OrderUploadSlotId, (handle: FileManagerV2Handle | null) => void>(),
    );
    const onUploadStateChangeRef = useRef(onUploadStateChange);
    onUploadStateChangeRef.current = onUploadStateChange;

    const [aggregate, setAggregate] = useState<FmUploadAggregate>(() =>
      mergeAggregates([]),
    );
    const aggregateRef = useRef(aggregate);
    aggregateRef.current = aggregate;

    const publishAggregate = useCallback(() => {
      const merged = mergeAggregates([...slotStates.current.values()]);
      if (aggregatesEqual(aggregateRef.current, merged)) return;
      aggregateRef.current = merged;
      setAggregate(merged);
      onUploadStateChangeRef.current?.(merged);
    }, []);

    const onSlotStateChange = useCallback(
      (slotId: OrderUploadSlotId, state: FmUploadAggregate) => {
        const prev = slotStates.current.get(slotId);
        if (prev && aggregatesEqual(prev, state)) return;
        slotStates.current.set(slotId, state);
        publishAggregate();
      },
      [publishAggregate],
    );

    /** Stable ref callback per slot — never recreate (avoids ref detach/attach loop). */
    const getFmRef = useCallback((slotId: OrderUploadSlotId) => {
      let cb = fmRefCallbacks.current.get(slotId);
      if (!cb) {
        cb = (handle: FileManagerV2Handle | null) => {
          if (handle) {
            fmHandles.current.set(slotId, handle);
          } else {
            fmHandles.current.delete(slotId);
          }
          // Do NOT publishAggregate here — state updates come from onUploadStateChange only.
        };
        fmRefCallbacks.current.set(slotId, cb);
      }
      return cb;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getPendingUploads: () => [],
        uploadAll: async () => {
          await Promise.all(
            [...fmHandles.current.values()].map((h) => h.waitForUploads()),
          );
        },
        clear: async () => {
          for (const h of fmHandles.current.values()) h.clearLocal();
          slotStates.current.clear();
          publishAggregate();
        },
        hasFiles: () =>
          [...fmHandles.current.values()].some((h) => h.hasFiles()),
        hasUploadedFiles: () =>
          [...fmHandles.current.values()].some((h) => h.hasUploadedFiles()),
        hasBlockingUploads: () =>
          [...fmHandles.current.values()].some((h) => h.hasBlockingUploads()),
        waitForUploads: async (timeoutMs) => {
          await Promise.all(
            [...fmHandles.current.values()].map((h) => h.waitForUploads(timeoutMs)),
          );
        },
        getUploadAggregate: () => mergeAggregates([...slotStates.current.values()]),
        askVersionMode: async () => "new_version" as UploadVersionMode,
      }),
      [publishAggregate],
    );

    const photos = ORDER_UPLOAD_SLOTS.filter((s) => s.group === "photos");
    const scans = ORDER_UPLOAD_SLOTS.filter((s) => s.group === "scans");
    const docs = ORDER_UPLOAD_SLOTS.filter((s) => s.group === "docs");

    const renderSlot = (def: OrderUploadSlotDef) => (
      <SlotWithFileManager
        key={def.id}
        def={def}
        orderId={orderId}
        ensureOrderId={ensureOrderId}
        onChanged={onChanged}
        fmRef={getFmRef(def.id)}
        onSlotStateChange={onSlotStateChange}
      />
    );

    return (
      <div className={cn("space-y-5", className)}>
        {(aggregate.isUploading || aggregate.hasBlocking || aggregate.isComplete) &&
          aggregate.total > 0 && (
            <FmGlobalProgress state={aggregate} sticky />
          )}

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-2">תמונות קליניות</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map(renderSlot)}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-2">סריקות</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {scans.map(renderSlot)}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-2">מסמכים נוספים</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {docs.map(renderSlot)}
          </div>
        </section>
      </div>
    );
  },
);
