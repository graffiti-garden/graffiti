import type { GraffitiMedia } from "@graffiti-garden/api";
import { connect, WindowMessenger } from "penpal";
import { GraffitiRpcClient } from "../client/index.js";
const { channel, legacyClient } = JSON.parse(window.name) as {
  channel: string;
  legacyClient: boolean;
};
async function run() {
  let getMedia: (
    url: string,
    accept: { maxBytes: number },
  ) => Promise<GraffitiMedia>;
  let wireIsBlob: boolean | undefined;
  let wireFileMetadata:
    | { isFile: boolean; name: unknown; lastModified: unknown }
    | undefined;
  if (legacyClient) {
    const connection = connect<{
      initialize(): void;
      getMedia(
        url: string,
        accept: { maxBytes: number },
      ): Promise<{
        actor: string;
        allowed?: string[];
        data: { buffer: ArrayBuffer; type: string };
      }>;
    }>({
      messenger: new WindowMessenger({
        remoteWindow: parent,
        allowedOrigins: ["*"],
      }),
      channel,
      methods: { sessionEvent() {} },
    });
    const remote = await connection.promise;
    await remote.initialize();
    getMedia = async (...args) => {
      const result = await remote.getMedia(...args);
      wireIsBlob = result.data.buffer instanceof Blob;
      wireFileMetadata = {
        isFile: result.data.buffer instanceof File,
        name: Reflect.get(result.data.buffer, "name"),
        lastModified: Reflect.get(result.data.buffer, "lastModified"),
      };
      // Preserve the decoder used by older, separately deployed clients.
      return {
        ...result,
        data: new Blob([result.data.buffer], { type: result.data.type }),
      };
    };
  } else {
    const client = new GraffitiRpcClient({ remoteWindow: parent, channel });
    await new Promise<void>((resolve) =>
      client.sessionEvents.addEventListener("initialized", () => resolve(), {
        once: true,
      }),
    );
    getMedia = (...args) => client.getMedia(...args);
  }
  parent.postMessage({ channel, type: "ready" }, "*");
  window.addEventListener("message", async (event) => {
    if (event.source !== parent || event.data?.type !== "read") return;
    try {
      const media = await Promise.all(
        Array.from({ length: 3 }, () =>
          getMedia("fixture:media", { maxBytes: event.data.size }),
        ),
      );
      const snapshots = await Promise.all(
        media.map((item) => item.data.arrayBuffer()),
      );
      const original = new Uint8Array(snapshots[0]).slice();
      new Uint8Array(snapshots[0]).fill(99);
      const repeated = new Uint8Array(await media[0].data.arrayBuffer());
      const objectUrl = URL.createObjectURL(media[0].data);
      let fetched: Uint8Array;
      try {
        fetched = new Uint8Array(await (await fetch(objectUrl)).arrayBuffer());
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      parent.postMessage(
        {
          channel,
          type: "result",
          wireIsBlob,
          wireFileMetadata,
          original,
          repeated,
          fetched,
          concurrent: snapshots
            .slice(1)
            .map((buffer) => new Uint8Array(buffer)),
          metadata: media.map(({ data, actor, allowed }) => ({
            size: data.size,
            type: data.type,
            actor,
            allowed,
          })),
        },
        "*",
      );
    } catch (error) {
      parent.postMessage({ channel, type: "error", error: String(error) }, "*");
    }
  });
}
void run().catch((error) =>
  parent.postMessage({ channel, type: "error", error: String(error) }, "*"),
);
