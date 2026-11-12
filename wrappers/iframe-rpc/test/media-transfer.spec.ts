import type { Graffiti } from "@graffiti-garden/api";
import { connect, Reply, WindowMessenger } from "penpal";
import { expect, it, vi } from "vitest";
import { serveGraffiti } from "../host/index.js";
const fixtures = [
  {
    name: "empty",
    file: false,
    bytes: new Uint8Array(),
    type: "application/x-empty",
  },
  {
    name: "Unicode and NUL",
    file: false,
    bytes: new TextEncoder().encode("Text with null\0, Unicode ✓, and 🌱"),
    type: 'text/plain;charset=utf-8;note="a,b"',
  },
  {
    name: "binary",
    file: false,
    bytes: Uint8Array.from({ length: 65_537 }, (_, index) => index % 256),
    type: "application/octet-stream",
  },
  {
    name: "File metadata",
    file: true,
    bytes: new TextEncoder().encode("Private file bytes"),
    type: "text/plain",
  },
];
for (const legacyHost of [false, true])
  for (const legacyClient of [false, true]) {
    it.each(fixtures)(
      `$name media remains readable with ${legacyHost ? "legacy" : "current"} host and ${legacyClient ? "legacy" : "current"} client`,
      async ({ bytes, type, file }) => {
        const blob = file
          ? new File([bytes], "private-fixture.txt", {
              type,
              lastModified: 123456789,
            })
          : new Blob([bytes], { type });
        const actor = "did:example:media-owner",
          allowed = ["did:example:recipient"];
        const getMedia = vi.fn(async (..._args: unknown[]) => ({
          data: blob,
          actor,
          allowed,
        }));
        const sessionEvents = new EventTarget();
        const frame = document.createElement("iframe"),
          channel = crypto.randomUUID();
        frame.name = JSON.stringify({ channel, legacyClient });
        frame.srcdoc = `<script type="module" src=${JSON.stringify(new URL("./media-frame.ts", import.meta.url).href)}></script>`;
        const messages: any[] = [];
        const receive = (event: MessageEvent) => {
          if (
            event.source === frame.contentWindow &&
            event.data?.channel === channel
          )
            messages.push(event.data);
        };
        window.addEventListener("message", receive);
        document.body.append(frame);
        let destroy: () => void | Promise<void>;
        const transferred: ArrayBuffer[] = [];
        const materialize = vi.spyOn(blob, "arrayBuffer");
        if (legacyHost) {
          const connection = connect<{
            sessionEvent(type: string, detail?: unknown): void;
          }>({
            messenger: new WindowMessenger({
              remoteWindow: frame.contentWindow!,
              allowedOrigins: ["*"],
            }),
            channel,
            methods: {
              async initialize() {
                await (await connection.promise).sessionEvent("initialized");
              },
              async getMedia(...args: unknown[]) {
                getMedia(...args);
                const buffer = await blob.arrayBuffer();
                transferred.push(buffer);
                return new Reply(
                  { data: { buffer, type: blob.type }, actor, allowed },
                  { transferables: [buffer] },
                );
              },
              destroy() {},
            },
          });
          destroy = () => connection.destroy();
        } else {
          // A host-side arrayBuffer read is the regression this test guards.
          materialize.mockRejectedValue(
            new Error("RPC host must not materialize media"),
          );
          const host = serveGraffiti({
            sessionEvents,
            getMedia,
          } as unknown as Graffiti);
          host.connect({ remoteWindow: frame.contentWindow!, channel });
          sessionEvents.dispatchEvent(new CustomEvent("initialized"));
          destroy = () => host.destroy();
        }
        try {
          await vi.waitFor(() => {
            expect(
              messages.find((message) => message.type === "error"),
            ).toBeUndefined();
            expect(messages.some((message) => message.type === "ready")).toBe(
              true,
            );
          });
          frame.contentWindow!.postMessage(
            { type: "read", size: bytes.length },
            "*",
          );
          await vi.waitFor(() => {
            expect(
              messages.find((message) => message.type === "error"),
            ).toBeUndefined();
            expect(messages.some((message) => message.type === "result")).toBe(
              true,
            );
          });
          const result = messages.find((message) => message.type === "result");
          expect(result.original).toEqual(bytes);
          expect(result.repeated).toEqual(bytes);
          expect(result.fetched).toEqual(bytes);
          expect(result.concurrent).toEqual([bytes, bytes]);
          expect(result.metadata).toEqual(
            Array.from({ length: 3 }, () => ({
              size: bytes.length,
              type,
              actor,
              allowed,
            })),
          );
          expect(getMedia).toHaveBeenCalledTimes(3);
          for (const args of getMedia.mock.calls)
            expect(args).toEqual(["fixture:media", { maxBytes: bytes.length }]);
          if (legacyClient) {
            expect(result.wireIsBlob).toBe(!legacyHost);
            expect(result.wireFileMetadata).toEqual({
              isFile: false,
              name: undefined,
              lastModified: undefined,
            });
          }
          if (legacyHost) {
            expect(materialize).toHaveBeenCalledTimes(3);
            expect(transferred.every((buffer) => buffer.byteLength === 0)).toBe(
              true,
            );
          } else expect(materialize).not.toHaveBeenCalled();
        } finally {
          await destroy!();
          frame.remove();
          window.removeEventListener("message", receive);
          materialize.mockRestore();
        }
      },
      10_000,
    );
  }
