import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { afterAll, beforeAll } from "vitest";
import { GraffitiRpcClient } from "../client/index.js";

let frame: HTMLIFrameElement;
let graffiti: GraffitiRpcClient;

beforeAll(async () => {
  frame = await createHostFrame();
  graffiti = new GraffitiRpcClient({ remoteWindow: frame.contentWindow! });
  await new Promise<void>((resolve) =>
    graffiti.sessionEvents.addEventListener("initialized", () => resolve(), {
      once: true,
    }),
  );
}, 20_000);

afterAll(() => {
  graffiti?.destroy();
  frame?.remove();
});

const useGraffiti = () => graffiti;
const useSession1 = () => ({ actor: "did:example:someone" });
const useSession2 = () => ({ actor: "did:example:someoneelse" });

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
graffitiDiscoverTests(useGraffiti, useSession1, useSession2);
graffitiMediaTests(useGraffiti, useSession1, useSession2);

function createHostFrame() {
  const iframe = document.createElement("iframe");
  iframe.src = "/test/host.html";

  return new Promise<HTMLIFrameElement>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => {
        window.removeEventListener("message", onMessage);
        reject(
          new Error(
            `Host iframe did not start: ${iframe.contentWindow?.location.href}\n${iframe.contentDocument?.documentElement.outerHTML}`,
          ),
        );
      },
      5_000,
    );
    const onMessage = (event: MessageEvent) => {
      if (
        event.source === iframe.contentWindow &&
        event.data?.graffitiRpcTestHostError
      ) {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        reject(new Error(event.data.graffitiRpcTestHostError));
      } else if (
        event.source === iframe.contentWindow &&
        event.data === "graffiti-rpc-test-host-ready"
      ) {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(iframe);
      }
    };
    window.addEventListener("message", onMessage);
    document.body.append(iframe);
  });
}
