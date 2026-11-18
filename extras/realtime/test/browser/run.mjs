import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";

// Use the local Graffiti packages' CommonJS builds in this Node test server.
const { localGraffiti } = createRequire(import.meta.url)("../graffiti-local.ts");

const { graffiti: store, dispose } = await localGraffiti();
const posted = [];
const files = {
  "/bundle.js": new URL("../../dist/browser/index.js", import.meta.url),
  "/client.js": new URL("./client.mjs", import.meta.url),
};
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  try {
    if (request.url === "/rpc") {
      let body = "";
      for await (const part of request) body += part;
      const { method, args } = JSON.parse(body);
      if (
        !["post", "get", "delete", "discover", "continueDiscover"].includes(
          method,
        )
      )
        throw new Error("Unknown method");
      let value;
      if (method === "discover" || method === "continueDiscover") {
        const iterator = store[method](...args);
        const entries = [];
        let next;
        while (!(next = await iterator.next()).done) entries.push(next.value);
        value = { entries, result: next.value };
      } else {
        // Make one endpoint's actor lookup slow enough to exercise receive gating.
        if (
          method === "get" &&
          args[2]?.actor === "https://actors.example/bob"
        ) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        value = await store[method](...args);
        if (method === "post") posted.push(value);
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ value }));
    } else if (files[request.url]) {
      response.setHeader("Content-Type", "text/javascript");
      response.end(await readFile(files[request.url]));
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><html><head><title>Realtime browser test</title></head><body><script type="module" src="/client.js"></script></body></html>',
      );
    }
  } catch (error) {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({ error: { name: error.name, message: error.message } }),
    );
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const clients = [];
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  async function client(sandbox = false) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const NativePeerConnection = RTCPeerConnection;
      globalThis.testConnections = new Set();
      globalThis.RTCPeerConnection = class extends NativePeerConnection {
        constructor(...args) {
          super(...args);
          globalThis.testConnections.add(this);
        }
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      console.error("Browser error:", error.message),
    );
    await page.goto(origin);
    let target = page;
    if (sandbox) {
      await page.evaluate((origin) => {
        const iframe = document.createElement("iframe");
        iframe.sandbox = "allow-scripts";
        iframe.srcdoc = `<!doctype html><html><body><script type="module" src="${origin}/client.js"></script></body></html>`;
        document.body.append(iframe);
      }, origin);
      await page.waitForFunction(
        () => document.querySelector("iframe")?.contentWindow,
      );
      target = page.frames().find((frame) => frame.parentFrame());
      assert.ok(target);
    }
    await target.waitForFunction(() => globalThis.api);
    clients.push(target);
    return target;
  }
  const channel = `test:${crypto.randomUUID()}`;
  const alice = await client(true);
  const bob = await client();
  assert.equal(
    await alice.evaluate(() => {
      try {
        localStorage.getItem("test");
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  const selves = await Promise.all([
    alice.evaluate(
      ({ channel }) => api.join("https://actors.example/alice", channel, true),
      { channel },
    ),
    bob.evaluate(
      ({ channel }) => api.join("https://actors.example/bob", channel),
      { channel },
    ),
  ]);
  assert.equal(selves[0].actor, "https://actors.example/alice");
  assert.equal(selves[1].actor, "https://actors.example/bob");
  assert.notEqual(selves[0].peerId, selves[1].peerId);
  await Promise.all(
    [alice, bob].map((page) =>
      page.waitForFunction(() => api.events.joins.length === 1, null, {
        timeout: 45_000,
      }),
    ),
  );
  await bob.waitForFunction(() =>
    api.events.messages.some((event) => event.value.type === "hello-on-join"),
  );
  console.log("PASS: first message survives delayed actor verification");
  await alice.evaluate(async () => {
    await api.send({ x: "invalid", y: 3, z: 5 });
    await api.send({ x: 10, y: 3, z: 5 });
  });
  await bob.waitForFunction(() => api.events.positions.length === 1);
  assert.equal(
    (await bob.evaluate(() => api.events.positions[0])).actor,
    "https://actors.example/alice",
  );
  assert.equal((await bob.evaluate(() => api.events.positions)).length, 1);
  await bob.evaluate(() => api.sendLarge());
  await alice.waitForFunction(() =>
    api.events.messages.some((event) => event.value.text?.length === 65_536),
  );
  assert.equal(
    await alice.evaluate(
      () => api.events.messages.find((event) => event.value.text)?.value.text,
    ),
    "x".repeat(65_536),
  );
  console.log(
    "PASS: schema-filtered and large JSON messages, including an originless iframe",
  );

  await bob.evaluate(() => api.startMedia());
  await alice.waitForFunction(
    () =>
      [...document.querySelectorAll("video")].some(
        (video) => video.videoWidth > 0,
      ),
    null,
    { timeout: 20_000 },
  );
  for (const page of [alice, bob]) {
    assert.deepEqual(await page.evaluate(() => api.events.errors), []);
  }
  await bob.evaluate(() => {
    for (const connection of globalThis.testConnections) {
      if (connection.connectionState === "connected") connection.close();
    }
  });
  await Promise.all(
    [alice, bob].map((page) =>
      page.waitForFunction(() => api.events.joins.length >= 2, null, {
        // Recovery can wait for Trystero's next steady announcement (60s).
        timeout: 120_000,
      }),
    ),
  );
  await alice.waitForFunction(
    () =>
      [...document.querySelectorAll("video")].filter(
        (video) => video.videoWidth > 0,
      ).length >= 2,
    null,
    { timeout: 20_000 },
  );
  await alice.evaluate(() => api.send({ type: "after-reconnect" }));
  await bob.waitForFunction(() =>
    api.events.messages.some((event) => event.value.type === "after-reconnect"),
  );
  for (const page of [alice, bob]) {
    const errors = await page.evaluate(() => api.events.errors.splice(0));
    // Failed attempts during the forced outage are expected; require recovery.
    assert.ok(errors.every((error) => error.code === "peer-connect-failed"));
  }
  console.log(
    "PASS: reconnection after a dropped peer connection, with media restored",
  );

  const phone = await client();
  await phone.evaluate(
    ({ channel }) => api.join("https://actors.example/bob", channel),
    { channel },
  );
  await phone.waitForFunction(() => api.events.joins.length === 2, null, {
    timeout: 45_000,
  });
  await phone.waitForFunction(
    () =>
      [...document.querySelectorAll("video")].some(
        (video) => video.videoWidth > 0,
      ),
    null,
    { timeout: 20_000 },
  );
  assert.ok(
    (await phone.evaluate(() => api.events.streams)).some(
      (stream) =>
        stream.tracks.includes("audio") &&
        stream.tracks.includes("video") &&
        stream.value.source === "camera",
    ),
  );
  const bobEndpoints = (await alice.evaluate(() => api.events.joins)).filter(
    (peer) => peer.actor === "https://actors.example/bob",
  );
  assert.equal(new Set(bobEndpoints.map((peer) => peer.peerId)).size, 2);
  console.log(
    "PASS: audio/video, automatic stream attachment for late joins, multiple endpoints per actor",
  );
  await bob.evaluate(() => api.updateMedia({ source: "screen" }));
  await Promise.all(
    [alice, phone].map((page) =>
      page.waitForFunction(() =>
        api.events.videos.some((video) => video.value.source === "screen"),
      ),
    ),
  );
  console.log(
    "PASS: stream metadata survives late joins and updates with actor/schema filtering",
  );

  const stranger = await client();
  await stranger.evaluate(() =>
    api.join("https://actors.example/stranger", "different-channel"),
  );
  await bob.evaluate(() => api.stopMedia());
  await alice.evaluate(() => api.send({ type: "private-room-event" }));
  await phone.waitForFunction(() =>
    api.events.messages.some(
      (event) => event.value.type === "private-room-event",
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal((await stranger.evaluate(() => api.events.joins)).length, 0);
  assert.equal((await stranger.evaluate(() => api.events.messages)).length, 0);
  assert.ok(!JSON.stringify(posted).includes(channel));
  // Reusing the greatest peer ID after leave can stall Trystero's scale routing.
  // A new GraffitiRealtime must get a fresh native endpoint, regardless of ordering.
  const participants = [alice, bob, phone];
  const ids = await Promise.all(
    participants.map((page) => page.evaluate(() => api.topology().peerId)),
  );
  const leavingIndex = ids.indexOf([...ids].sort().at(-1));
  const departing = participants[leavingIndex];
  const observer = participants.find((page) => page !== departing);
  const leaveCount = await observer.evaluate(() => api.events.leaves.length);
  await departing.evaluate(() => api.leave());
  await observer.waitForFunction(
    (previous) => api.events.leaves.length > previous,
    leaveCount,
  );
  console.log(
    "PASS: separate channels stay isolated, channels are absent from signaling records, peer departure",
  );

  const joinCount = await observer.evaluate(() => api.events.joins.length);
  const actor =
    leavingIndex === 0
      ? "https://actors.example/alice"
      : "https://actors.example/bob";
  await departing.evaluate(({ actor, channel }) => api.join(actor, channel), {
    actor,
    channel,
  });
  assert.notEqual(
    await departing.evaluate(() => api.topology().peerId),
    ids[leavingIndex],
  );
  await observer.waitForFunction(
    (previous) => api.events.joins.length > previous,
    joinCount,
  );
  await observer.evaluate(() => api.send({ type: "after-rejoin" }));
  await departing.waitForFunction(() =>
    api.events.messages.some((event) => event.value.type === "after-rejoin"),
  );
  console.log(
    "PASS: leaving and rejoining uses a fresh endpoint with scale enabled",
  );

  for (const page of clients) {
    const errors = await page.evaluate(() => api.events.errors);
    assert.deepEqual(errors, []);
  }
  await Promise.all(clients.map((page) => page.evaluate(() => api.leave())));
  for (const object of posted) {
    await assert.rejects(store.get(object.url, {}, { actor: object.actor }), {
      name: "GraffitiErrorNotFound",
    });
  }
  console.log("PASS: signaling and identity records cleaned up after leaving");

  // Exceed scale()'s default full-mesh threshold to exercise routed peers.
  const scaledChannel = `scale:${crypto.randomUUID()}`;
  while (clients.length < 10) await client();
  for (const [index, page] of clients.entries()) {
    await page.evaluate(
      ({ index, channel }) => api.join(`did:example:scale:${index}`, channel),
      { index, channel: scaledChannel },
    );
    if (index === 0) await page.evaluate(() => api.send({ type: "alone" }));
    // Let membership settle before adding another peer, avoiding startup bursts
    // of in-flight connections above scale's soft neighbor target.
    await Promise.all(
      clients
        .slice(0, index + 1)
        .map((joined) =>
          joined.waitForFunction(
            (count) =>
              new Set(
                api.events.joins
                  .filter((peer) => peer.actor.startsWith("did:example:scale:"))
                  .map((peer) => peer.peerId),
              ).size === count,
            index,
            { timeout: 60_000 },
          ),
        ),
    );
  }
  const routedPeerIndex = () =>
    Promise.any(
      clients.map(async (page, index) => {
        await page.waitForFunction(
          () =>
            Object.values(api.topology().routes).some((route) => route.hops > 1),
          null,
          { timeout: 60_000 },
        );
        return index;
      }),
    );
  const senderIndex = await routedPeerIndex();
  const sender = clients[senderIndex];
  await sender.evaluate(() => api.send({ type: "routed-broadcast" }));
  await Promise.all(
    clients
      .filter((page) => page !== sender)
      .map((page) =>
        page.waitForFunction(
          (actor) =>
            api.events.messages.some(
              (event) =>
                event.value.type === "routed-broadcast" &&
                event.actor === actor,
            ),
          `did:example:scale:${senderIndex}`,
        ),
      ),
  );
  // Scale may rebalance which peers have multi-hop routes during delivery.
  await routedPeerIndex();
  for (const page of clients)
    assert.deepEqual(await page.evaluate(() => api.events.errors), []);
  await Promise.all(clients.map((page) => page.evaluate(() => api.leave())));
  for (const object of posted) {
    await assert.rejects(store.get(object.url, {}, { actor: object.actor }), {
      name: "GraffitiErrorNotFound",
    });
  }
  console.log(
    "PASS: ten peers verify actors and receive a broadcast over multi-hop routes without promoting to a full mesh",
  );
} catch (error) {
  for (let i = 0; i < clients.length; i++) {
    console.error(
      `Client ${i}:`,
      await clients[i]
        .evaluate(() => ({ ...api.events, topology: api.topology() }))
        .catch(() => "unavailable"),
    );
  }
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await dispose();
}
