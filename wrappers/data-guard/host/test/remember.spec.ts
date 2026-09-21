import { describe, expect, it } from "vitest";
import type { Request } from "../src/core/db.js";
import { rememberDecisionLabel } from "../src/ui/remember.js";

const source = { key: "https://example.com", path: [] };

function request(method: Request["method"], subject: unknown = {}): Request {
  return {
    id: "request",
    source,
    actor: "actor",
    method,
    subject,
    createdAt: 0,
  };
}

describe("rememberDecisionLabel", () => {
  it.each([
    ["post", "post similar data"],
    ["get", "access similar private data"],
    ["delete", "delete similar data"],
    ["logout", "log you out"],
  ] as const)("describes %s requests", (method, action) => {
    expect(rememberDecisionLabel(request(method))).toBe(
      `Remember your decision whenever this site asks to ${action}?`,
    );
  });

  it.each([
    ["postMedia", "image/png", "upload an image"],
    ["postMedia", "text/html", "upload a document"],
    ["getMedia", "video/mp4", "access a private video"],
    ["deleteMedia", "audio/mpeg", "delete an audio file"],
  ] as const)("describes %s by media kind", (method, type, action) => {
    expect(rememberDecisionLabel(request(method, { type }))).toBe(
      `Remember your decision whenever this site asks to ${action}?`,
    );
  });
});
