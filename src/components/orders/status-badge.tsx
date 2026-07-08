import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants/labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge className={cn(ORDER_STATUS_COLORS[status], className)}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
