import type { OrderStatus, User } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import { StatusBadge } from "@/components/orders/status-badge";
import {
  getOrderStageRelevance,
  STAGE_RELEVANCE_BADGE_CLASS,
  STAGE_RELEVANCE_LABELS,
} from "@/lib/workflow-permissions";
import { cn } from "@/lib/utils";

export function OrderStageIndicator({
  user,
  status,
  className,
}: {
  user: Pick<User, "role" | "roles">;
  status: OrderStatus;
  className?: string;
}) {
  const relevance = getOrderStageRelevance(user, status);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <StatusBadge status={status} />
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
          STAGE_RELEVANCE_BADGE_CLASS[relevance],
        )}
      >
        {STAGE_RELEVANCE_LABELS[relevance]}
      </span>
      <span className="text-xs text-slate-500 hidden sm:inline">
        שלב: {ORDER_STATUS_LABELS[status]}
      </span>
    </div>
  );
}
