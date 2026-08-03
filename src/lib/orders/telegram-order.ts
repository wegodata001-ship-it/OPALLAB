import { WORK_TYPE_LABELS } from "@/lib/constants/labels";
import type { WorkType } from "@/lib/types";

/** Lab Telegram destination (international, no +). */
export const TELEGRAM_ORDER_PHONE = "972546246608";

export type TelegramOrderShareInput = {
  serialNumber: string;
  patientName: string;
  doctorName: string;
  workTypes?: WorkType[];
  orderId?: string;
  /** Absolute or site-relative order URL */
  orderUrl?: string;
};

export function buildOrderPublicUrl(orderId: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/orders/${orderId}`;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/orders/${orderId}` : `/orders/${orderId}`;
}

export function buildTelegramOrderMessage(input: TelegramOrderShareInput): string {
  const work =
    input.workTypes?.length
      ? input.workTypes.map((w) => WORK_TYPE_LABELS[w] ?? w).join(", ")
      : "—";
  const orderUrl =
    input.orderUrl ||
    (input.orderId ? buildOrderPublicUrl(input.orderId) : "—");

  return [
    "🦷 OPAL LAB",
    "",
    "נוצרה הזמנה חדשה.",
    "",
    "מספר הזמנה:",
    input.serialNumber || "—",
    "",
    "מטופל:",
    input.patientName?.trim() || "—",
    "",
    "רופא:",
    input.doctorName?.trim() || "—",
    "",
    "סוג עבודה:",
    work,
    "",
    "קישור להזמנה:",
    orderUrl,
  ].join("\n");
}

/** Opens Telegram chat with the lab number and pre-filled message. */
export function openTelegramOrderShare(input: TelegramOrderShareInput): void {
  const text = buildTelegramOrderMessage(input);
  const encoded = encodeURIComponent(text);
  // Mobile Telegram app deep-link (pre-filled text + destination)
  const appLink = `tg://msg?to=+${TELEGRAM_ORDER_PHONE}&text=${encoded}`;
  // Web / desktop fallback — opens chat; text is also available via share URL
  const webChat = `https://t.me/+${TELEGRAM_ORDER_PHONE}`;
  const webShare = `https://t.me/share/url?url=${encodeURIComponent(
    input.orderUrl || (input.orderId ? buildOrderPublicUrl(input.orderId) : webChat),
  )}&text=${encoded}`;

  if (typeof window === "undefined") return;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = appLink;
    window.setTimeout(() => {
      window.open(webShare, "_blank", "noopener,noreferrer");
    }, 800);
    return;
  }

  window.open(webShare, "_blank", "noopener,noreferrer");
}
