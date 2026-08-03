"use client";

import { Button } from "@/components/ui/button";
import {
  openTelegramOrderShare,
  type TelegramOrderShareInput,
} from "@/lib/orders/telegram-order";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

type TelegramOrderButtonProps = {
  order?: TelegramOrderShareInput | null;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary" | "danger" | "success";
  label?: string;
  /** When set, called instead of opening immediately (e.g. save-then-share). */
  onBeforeOpen?: () => Promise<TelegramOrderShareInput | null | void> | TelegramOrderShareInput | null | void;
  /** Fully custom click (e.g. save + share + navigate). Skips default open. */
  onClick?: () => void | Promise<void>;
};

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function TelegramOrderButton({
  order,
  disabled,
  className,
  size = "lg",
  variant = "outline",
  label = "שלח ב־Telegram",
  onBeforeOpen,
  onClick,
}: TelegramOrderButtonProps) {
  const handleClick = async () => {
    if (onClick) {
      await onClick();
      return;
    }
    let payload = order ?? null;
    if (onBeforeOpen) {
      const next = await onBeforeOpen();
      if (next) payload = next;
    }
    if (!payload?.serialNumber) return;
    openTelegramOrderShare(payload);
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={disabled}
      onClick={() => void handleClick()}
      className={cn(
        "gap-2 border-[#2AABEE]/40 text-[#1c8fc7] hover:bg-[#2AABEE]/10 hover:text-[#157aad]",
        className,
      )}
    >
      <TelegramIcon className="h-4 w-4" />
      <Send className="h-3.5 w-3.5 opacity-70" />
      {label}
    </Button>
  );
}
