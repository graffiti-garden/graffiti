import type { Context } from "hono";

export type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  STORAGE: R2Bucket;
  BASE_HOST: string;
};

export function getOrigin(context: Context) {
  const url = new URL(context.req.url);
  // Account for vite redirect during development
  return url.protocol === "https:"
    ? `https://${url.host}`
    : "https://localhost:5173";
}
