/**
 * Best-effort deep links to OS / browser location permission settings.
 * Browsers block most direct settings URLs; we guide the user clearly.
 */
export function openPermissionHelp(): void {
  if (typeof window === "undefined") return;

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (isAndroid) {
    try {
      window.open(
        "intent://settings#Intent;scheme=android.settings.APPLICATION_DETAILS_SETTINGS;end",
        "_blank",
      );
      return;
    } catch {
      /* fall through */
    }
  }

  if (isIOS) {
    return;
  }

  try {
    window.open("chrome://settings/content", "_blank");
  } catch {
    /* ignore */
  }
}

export function permissionHelpText(): string {
  if (typeof navigator === "undefined") {
    return "פתחו את הגדרות הדפדפן ואפשרו מיקום לאתר זה.";
  }
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "ב־iPhone: הגדרות ← פרטיות ואבטחה ← שירותי מיקום ← Safari ← אפשרו גישה. לאחר מכן חזרו לכאן ורעננו.";
  }
  if (/Android/i.test(ua)) {
    return "באנדרואיד: הגדרות ← אפליקציות ← הדפדפן ← הרשאות ← הפעילו מיקום. לאחר מכן חזרו לכאן.";
  }
  return "לחצו על מנעול/הגדרות האתר בשורת הכתובת ואפשרו מיקום.";
}
