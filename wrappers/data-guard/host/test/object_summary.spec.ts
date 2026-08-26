import { afterEach, describe, expect, it } from "vitest";
import { summarizeObject } from "../src/ui/object_summary.js";

const original = (globalThis as any).LanguageModel;
afterEach(() => {
  (globalThis as any).LanguageModel = original;
});

describe("object summaries", () => {
  it("uses the browser Prompt API with structured output when available", async () => {
    let prompt = "";
    let destroyed = false;
    (globalThis as any).LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        async prompt(value: string) {
          prompt = value;
          return '{"summary":"A Note saying hello."}';
        },
        destroy() {
          destroyed = true;
        },
      }),
    };

    await expect(
      summarizeObject({
        value: { type: "Note", content: "hello" },
        channels: ["chat"],
      }),
    ).resolves.toBe("A Note saying hello.");
    expect(prompt).toContain('"content":"hello"');
    expect(destroyed).toBe(true);
  });
});
