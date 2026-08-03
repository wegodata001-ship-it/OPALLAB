import { reviveDates } from "@/lib/api/revive-dates";
import { humanizeUploadHttpError, readResponsePayload } from "@/lib/api/parse-response";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error: { code: string; message: string } };

async function parseResponse<T>(response: Response): Promise<T> {
  const { json, text, isJson } = await readResponsePayload(response);
  if (!isJson || !json || typeof json !== "object") {
    throw new Error(humanizeUploadHttpError(response.status, text));
  }
  const body = json as ApiSuccess<T> | ApiFailure;
  if (!("success" in body) || !body.success) {
    const fail = body as ApiFailure;
    throw new Error(fail.error?.message ?? humanizeUploadHttpError(response.status, text));
  }
  return reviveDates(body.data);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include", cache: "no-store" });
  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}
