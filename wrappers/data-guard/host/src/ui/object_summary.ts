const systemPrompt =
  "Summarize the data represented by a JSON object. Summarize its value, not the app, Graffiti, the requested operation, or this permission prompt. Mention concrete fields such as type, activity, content, name, target, or recipient when present. Use one short sentence.";
const responseSchema = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
  additionalProperties: false,
};
// This small model is sufficient for a one-sentence description and avoids
// making the permission prompt depend on a roughly 1 GB GPU allocation.
const model = "SmolLM2-360M-Instruct-q4f32_1-MLC";
let enginePromise: ReturnType<typeof loadWebLlm> | undefined;

export async function summarizeObject(object: any) {
  const input = JSON.stringify({
    value: object.value,
    channels: object.channels,
    ...(object.allowed !== undefined ? { allowed: object.allowed } : {}),
  });
  for (const [name, summarize] of [
    ["browser Prompt API", chromeSummary],
    ["WebLLM", webLlmSummary],
  ] as const) {
    try {
      const summary = await summarize(input);
      if (summary) return summary;
    } catch (error) {
      // AI summaries are optional UI assistance. Keep the permission prompt
      // usable while leaving enough information to diagnose browser support.
      console.info(`[Graffiti Guard] ${name} unavailable.`, error);
    }
  }
}

async function chromeSummary(input: string) {
  const LanguageModel = (globalThis as any).LanguageModel;
  if (!LanguageModel) return;
  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  const availability = await LanguageModel.availability(options);
  if (
    availability === "unavailable" ||
    (availability !== "available" && !navigator.userActivation?.isActive)
  ) {
    return;
  }
  const session = await LanguageModel.create(options);
  try {
    const result = await session.prompt(`${systemPrompt}\n\nObject JSON:\n${input}`, {
      responseConstraint: responseSchema,
      omitResponseConstraintInput: true,
    });
    return readSummary(result);
  } finally {
    session.destroy();
  }
}

async function webLlmSummary(input: string) {
  if (!("gpu" in navigator)) return;
  const engine = await (enginePromise ??= loadWebLlm());
  if (!engine) return;
  const response = await engine.chat.completions.create({
    messages: [
      { role: "system", content: `${systemPrompt} Return only JSON matching {"summary":"..."}.` },
      { role: "user", content: `Object JSON:\n${input}` },
    ],
    temperature: 0,
    max_tokens: 120,
    response_format: {
      type: "json_object",
      schema: JSON.stringify(responseSchema),
    },
  });
  return readSummary(response.choices[0]?.message.content);
}

async function loadWebLlm() {
  try {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    return await CreateMLCEngine(model, {
      initProgressCallback({ text }) {
        if (text) console.info(`[Graffiti Guard] WebLLM: ${text}`);
      },
    });
  } catch (error) {
    console.info("[Graffiti Guard] WebLLM could not start.", error);
    return undefined;
  }
}

function readSummary(value: unknown) {
  if (typeof value !== "string") return undefined;
  const json = value.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return undefined;
  try {
    const summary = JSON.parse(json).summary;
    return useful(summary) ? summary.trim() : undefined;
  } catch {
    return undefined;
  }
}

function useful(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const summary = value.toLowerCase();
  return !summary.includes("permission prompt") && !summary.includes("graffiti app");
}
