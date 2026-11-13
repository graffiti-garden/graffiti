import type { Graffiti } from "@graffiti-garden/api";
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
for (const releasedClient of [false, true]) {
    it.each(fixtures)(
      `$name media remains readable with a direct-Blob host and ${releasedClient ? "released 0.3.1" : "current"} client`,
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
        frame.name = JSON.stringify({ channel, releasedClient });
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
        // A host-side arrayBuffer read is the regression this test guards.
        const materialize = vi.spyOn(blob, "arrayBuffer").mockRejectedValue(
          new Error("RPC host must not materialize media"),
        );
        const host = serveGraffiti({ sessionEvents, getMedia } as unknown as Graffiti);
        host.connect({ remoteWindow: frame.contentWindow!, channel });
        sessionEvents.dispatchEvent(new CustomEvent("initialized"));
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
          expect(result.wireIsBlob).toBe(true);
          expect(result.wireFileMetadata).toEqual({
            isFile: false,
            name: undefined,
            lastModified: undefined,
          });
          expect(materialize).not.toHaveBeenCalled();
        } finally {
          await host.destroy();
          frame.remove();
          window.removeEventListener("message", receive);
          materialize.mockRestore();
        }
      },
      10_000,
    );
  }
