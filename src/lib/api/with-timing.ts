import { NextResponse } from "next/server";

/** Attach server timing headers to a JSON Response. */
export function withServerTiming(response: NextResponse, startedAt: number): NextResponse {
  const ms = Math.round(Date.now() - startedAt);
  response.headers.set("X-Server-Time-Ms", String(ms));
  response.headers.set("Server-Timing", `app;dur=${ms}`);
  response.headers.set("Access-Control-Expose-Headers", "X-Server-Time-Ms, Server-Timing");
  return response;
}
