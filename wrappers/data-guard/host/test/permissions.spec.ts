import { describe, expect, it } from "vitest";
import type { Permission } from "../src/core/db.js";
import {
  exactReadMatch,
  matches,
  mediaMatch,
  objectMatch,
} from "../src/core/permissions.js";

const source = {
  key: '["https://example.com"]',
  origin: "https://example.com",
  path: [],
};

function permission(
  method: Permission["method"],
  match: Permission["match"],
): Permission {
  return {
    id: "permission",
    source,
    actor: "actor:one",
    method,
    match,
    createdAt: 0,
  };
}

describe("permission matching", () => {
  it("preserves object shape, types, and conventional discriminators", () => {
    const object = {
      value: {
        type: "Note",
        content: "first",
        metadata: { pinned: false },
      },
      channels: ["chat"],
    };
    const grant = permission("post", objectMatch(object));

    expect(matches(grant, { kind: "object", object: {
      ...object,
      value: {
        type: "Note",
        content: "second",
        metadata: { pinned: true },
      },
    } })).toBe(true);
    expect(matches(grant, { kind: "object", object: {
      ...object,
      value: { ...object.value, type: "Article" },
    } })).toBe(false);
    expect(matches(grant, { kind: "object", object: {
      ...object,
      value: { type: "Note", content: "second" },
    } })).toBe(false);
    expect(matches(grant, { kind: "object", object: {
      ...object,
      value: { ...object.value, extra: true },
    } })).toBe(false);
  });

  it("uses human-filetypes families without grouping unknown MIME types", () => {
    const images = permission("postMedia", mediaMatch({ type: "image/png" }));
    const unknown = permission(
      "postMedia",
      mediaMatch({ type: "application/x-example-one" }),
    );

    expect(matches(images, { kind: "media", type: "image/jpeg" })).toBe(true);
    expect(matches(images, { kind: "media", type: "video/mp4" })).toBe(false);
    expect(matches(unknown, {
      kind: "media",
      type: "application/x-example-two",
    })).toBe(false);
  });

  it("keeps exact object and media reads URL-specific", () => {
    const object = permission(
      "get",
      exactReadMatch({ kind: "object", object: { url: "graffiti:one" } }),
    );
    const media = permission(
      "getMedia",
      exactReadMatch({ kind: "media", url: "graffiti:media-one" }),
    );

    expect(matches(object, {
      kind: "object",
      object: { url: "graffiti:one" },
    })).toBe(true);
    expect(matches(object, {
      kind: "object",
      object: { url: "graffiti:two" },
    })).toBe(false);
    expect(matches(media, {
      kind: "media",
      url: "graffiti:media-two",
    })).toBe(false);
  });
});
