import type { GraffitiObject, JSONSchema } from "@graffiti-garden/api";

/** Discover live streams using the ordinary Graffiti discovery API. */
export const streamSchema = {
  properties: {
    value: {
      properties: {
        liveStream: {
          type: "object",
          properties: {
            format: { const: "moq-hang/1" },
            id: { type: "string" },
            audio: { type: "boolean" },
            video: { type: "boolean" },
            expires: { type: "number" },
          },
          required: ["format", "id", "audio", "video", "expires"],
        },
      },
      required: ["liveStream"],
    },
  },
} as const satisfies JSONSchema;

export type StreamObject = GraffitiObject<typeof streamSchema>;

export function trackNames(object: StreamObject) {
  return [
    "catalog.json",
    ...(object.value.liveStream.audio ? ["audio"] : []),
    ...(object.value.liveStream.video ? ["video"] : []),
  ];
}

/** A MoQ frame, addressed by track, group, and position within that group. */
export const frameSchema = (stream: StreamObject) => ({
  properties: {
    actor: { const: stream.actor },
    value: {
      properties: {
        moq: {
          type: "object",
          properties: {
            // Announcements renew at new immutable URLs; the broadcast keeps
            // the same actor and random ID so existing players keep receiving.
            stream: { const: stream.value.liveStream.id },
            track: { enum: ["catalog.json", "audio", "video"] },
            group: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            frame: { type: "integer", minimum: 0, maximum: 1023 },
            timestamp: { type: "number", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            payload: { type: "string", maxLength: 2 * 1024 * 1024 },
            expires: { type: "number", minimum: Date.now() - 3000 },
          },
          required: ["stream", "track", "group", "frame", "timestamp", "payload", "expires"],
        },
      },
      required: ["moq"],
    },
  },
}) as const satisfies JSONSchema;

export type Frame = GraffitiObject<ReturnType<typeof frameSchema>>["value"]["moq"];
