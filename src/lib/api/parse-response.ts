/**
 * Safe API response parsing — never throw SyntaxError on HTML/text bodies
 * (e.g. "Request Entity Too Large" → Unexpected token 'R').
 */

export async function readResponsePayload(response: Response): Promise<{
  json: unknown | null;
  text: string;
  isJson: boolean;
}> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return { json: null, text: "", isJson: false };

  try {
    return { json: JSON.parse(trimmed), text, isJson: true };
  } catch {
    return { json: null, text, isJson: false };
  }
}

export function humanizeUploadHttpError(status: number, bodyText: string): string {
  const lower = bodyText.toLowerCase();
  if (
    status === 413 ||
    lower.includes("request entity too large") ||
    lower.includes("payload too large") ||
    lower.startsWith("request entity")
  ) {
    return "הקובץ גדול מדי להעלאה דרך השרת. המערכת תנסה העלאה ישירה ל־Storage — נסו שוב.";
  }
  if (status === 401 || status === 403) return "אין הרשאה להעלות קבצים";
  if (status >= 500) return "שגיאת שרת בהעלאה — נסו שוב בעוד רגע";
  if (bodyText.length && bodyText.length < 200 && !bodyText.trim().startsWith("{")) {
    return bodyText.trim();
  }
  return "העלאת הקובץ נכשלה";
}
