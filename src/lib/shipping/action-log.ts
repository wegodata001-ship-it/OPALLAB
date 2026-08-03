/**
 * Debug-only timing logs for packing/shipping actions.
 * Enable with localStorage.setItem("opal-debug-shipping", "1")
 * or NODE_ENV=development (console.debug).
 */

const PREFIX = "[shipping:flow]";

function enabled(): boolean {
  if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
  try {
    return (
      process.env.NODE_ENV !== "production" ||
      window.localStorage.getItem("opal-debug-shipping") === "1"
    );
  } catch {
    return process.env.NODE_ENV !== "production";
  }
}

export function shippingLog(
  phase:
    | "click"
    | "api:start"
    | "api:end"
    | "db:start"
    | "db:end"
    | "ui:updated"
    | "error"
    | "CREATE_PDF"
    | "UPLOAD_PDF"
    | "GENERATE_PUBLIC_URL"
    | "OPEN_WHATSAPP"
    | "SUCCESS"
    | "ERROR",
  action: string,
  detail?: Record<string, unknown>,
): void {
  if (!enabled()) return;
  const payload = { t: Date.now(), action, ...detail };
  if (phase === "error") console.error(PREFIX, phase, payload);
  else console.debug(PREFIX, phase, payload);
}

export function shippingTimed(action: string) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    end(phase: "api:end" | "ui:updated" | "error" = "api:end", detail?: Record<string, unknown>) {
      const ms = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );
      shippingLog(phase, action, { ...detail, ms });
      return ms;
    },
  };
}
