import { describe, expect, it } from "vitest";
import { mediaLabels } from "../src/ui/media.js";

describe("mediaLabels", () => {
  it.each([
    "text/html",
    "application/xhtml+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ])("classifies %s as a document", (type) => {
    expect(mediaLabels(type).item).toBe("document");
  });

  it.each(["text/plain", "application/json", "text/css"])(
    "keeps %s classified as text",
    (type) => {
      expect(mediaLabels(type).item).toBe("text");
    },
  );
});
