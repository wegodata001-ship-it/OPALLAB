import { Suspense } from "react";
import { InventoryReminderCenter } from "@/components/inventory/InventoryReminderCenter";

export default function InventoryRemindersPage() {
  return (
    <Suspense fallback={null}>
      <InventoryReminderCenter />
    </Suspense>
  );
}
