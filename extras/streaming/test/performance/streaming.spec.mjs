import { afterAll, beforeAll, expect, test } from "vitest";
import { chromium, firefox, webkit } from "playwright";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decode } from "@ipld/dag-cbor";
import { DecentralizedTestEnvironment, decentralizedTestUsers, decentralizedSharedInbox } from "../../../../implementations/decentralized/client/test/environment.ts";

const environment = new DecentralizedTestEnvironment();
let browser, receiverBrowser, server, address;
const uploads = [];
const networkErrors = [];
const profiles = [];
const engine = process.env.PERF_BROWSER ?? "chromium";
const receiverEngine = process.env.PERF_RECEIVER_BROWSER ?? engine;
const launch = engine => engine === "firefox"
  ? firefox.launch({ firefoxUserPrefs: { "media.autoplay.default": 0, "media.autoplay.blocking_policy": 0,
      "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true } })
  : engine === "webkit" ? webkit.launch()
  : chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
async function newContext(browser, engine) {
  if (engine !== "webkit") return browser.newContext();
  // Playwright WebKit's nonpersistent Cache Storage can silently lose writes
  // after its first page closes. Use a real temporary profile for durable-cache
  // tests, matching normal Safari; do not change production to mask that artifact.
  const profile = await mkdtemp(join(tmpdir(), "graffiti-webkit-performance-"));
  profiles.push(profile);
  return webkit.launchPersistentContext(profile);
}
beforeAll(async () => {
  await environment.start({ mocks: false });
  const roots = {
    decentralized: "../../../../implementations/decentralized/client/dist/browser/",
    realtime: "../../../../wrappers/realtime/dist/browser/",
    streaming: "../../dist/browser/",
    "vue-plugin": "../../../../plugins/vue/dist/browser/",
    vue: "../../../../node_modules/vue/dist/",
  };
  server = createServer(async (request, response) => {
    const [prefix, ...rest] = request.url.slice(1).split("/");
    try {
      if (!prefix) { response.setHeader("Content-Type", "text/html"); response.end('<script type="module" src="/page.mjs"></script>'); return; }
      if (prefix === "cursors") {
        const html = await readFile(new URL("../../../../wrappers/realtime/demo/index.html", import.meta.url), "utf8");
        response.setHeader("Content-Type", "text/html");
        response.end(html.replace("createApp({", "globalThis.cursorDemo = realtime; globalThis.cursorVue = useGraffiti;\ncreateApp({"));
        return;
      }
      if (prefix === "favicon.ico") { response.writeHead(204).end(); return; }
      const file = ["page.mjs", "monitor.mjs"].includes(prefix) ? new URL(`./${prefix}`, import.meta.url)
        : new URL(roots[prefix] + rest.join("/"), import.meta.url);
      const body = await readFile(file);
      response.setHeader("Content-Type", file.pathname.endsWith(".wasm") ? "application/wasm" : "text/javascript");
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  address = `http://127.0.0.1:${server.address().port}`;
  browser = await launch(engine);
  receiverBrowser = receiverEngine === engine ? browser : await launch(receiverEngine);
});
afterAll(async () => {
  await browser?.close();
  if (receiverBrowser !== browser) await receiverBrowser?.close();
  await Promise.all(profiles.map(profile => rm(profile, { recursive: true, force: true })));
  await new Promise(resolve => server?.close(resolve) ?? resolve());
  await environment.stop();
});

const percentile = (values, p) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
const summary = values => ({ count: values.length, median: percentile([...values], .5), p95: percentile([...values], .95), max: Math.max(0, ...values) });

test("cursor demo shares usernames and positions, expires, and reconnects after reload", async () => {
  const contexts = [await newContext(browser, engine), await newContext(receiverBrowser, receiverEngine)];
  const errors = [];
  const pages = [];
  async function open(context, userIndex) {
    const page = await context.newPage();
    pages.push(page);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${address}/cursors/#cursor-test`);
    await signIn(page, userIndex);
    return page;
  }
  async function signIn(page, userIndex) {
    await page.waitForFunction(() => !!globalThis.cursorDemo);
    await page.evaluate(({ users, sharedInbox, userIndex }) => {
      const app = globalThis.cursorDemo, raw = app.graffiti.graffiti, user = users[userIndex];
      const service = serviceEndpoint => ({ serviceEndpoint, authorizationEndpoint: "https://localhost:5173/auth", token: user.token });
      raw.defaultInboxEndpoints = [sharedInbox];
      raw.sessions.resolveSession = () => ({ actor: user.actor, tokens: [], servicesByAuthorization: [],
        storageBucket: service(user.bucketEndpoint), personalInbox: service(user.inboxEndpoint),
        sharedInboxes: [service(sharedInbox)],
      });
      raw.dids.resolve = async actor => {
        const account = users.find(user => user.actor === actor);
        return { id: actor, service: account ? [
          { id: "#graffitiStorageBucket", type: "GraffitiStorageBucket", serviceEndpoint: account.bucketEndpoint },
          { id: "#graffitiPersonalInbox", type: "GraffitiInbox", serviceEndpoint: account.inboxEndpoint },
          { id: "#graffitiSharedInbox_0", type: "GraffitiInbox", serviceEndpoint: sharedInbox },
        ] : [] };
      };
      cursorVue().actorToHandle = async actor => `user-${users.findIndex(user => user.actor === actor)}.example`;
      app.sessionEvents.dispatchEvent(new CustomEvent("login", { detail: { session: { actor: user.actor } } }));
    }, { users: decentralizedTestUsers, sharedInbox: decentralizedSharedInbox, userIndex });
  }
  for (const context of contexts) await context.route("https://localhost:5173/**", async route => {
    const request = route.request();
    const response = await environment.fetch(request.url(), { method: request.method(), headers: request.headers(), body: request.postDataBuffer() ?? undefined });
    await route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), "Access-Control-Allow-Origin": "*" }, body: Buffer.from(await response.arrayBuffer()) });
  });
  async function move(page, x, y) {
    await page.locator("#pad").waitFor();
    const box = await page.locator("#pad").boundingBox();
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  }
  try {
    let sender = await open(contexts[0], 0);
    const receiver = await open(contexts[1], 1);
    await move(sender, .2, .3);
    await expect.poll(() => receiver.locator("#pad").textContent(), { timeout: 30_000 }).toContain("user-0.example");
    expect(await receiver.locator(".cursor").evaluate(label => parseFloat(label.style.left))).toBeCloseTo(20, 0);
    await move(receiver, .7, .2);
    await expect.poll(() => sender.locator("#pad").textContent(), { timeout: 10_000 }).toContain("user-1.example");
    await sender.close();
    await expect.poll(() => receiver.locator(".cursor").count(), { timeout: 6000 }).toBe(0);
    await receiver.reload();
    await signIn(receiver, 1);
    sender = await open(contexts[0], 0);
    await move(sender, .8, .6);
    await expect.poll(() => receiver.locator("#pad").textContent(), { timeout: 30_000 }).toContain("user-0.example");
    expect(await receiver.locator(".cursor").filter({ hasText: "user-0.example" }).evaluate(label => parseFloat(label.style.left))).toBeCloseTo(80, 0);
    await expect.poll(() => receiver.locator(".cursor").filter({ hasText: "user-1.example" }).count(), { timeout: 4000 }).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    for (const page of pages) if (!page.isClosed()) await page.evaluate(() => cursorDemo.close());
    for (const context of contexts) { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }
  }
});

test("two pages: generated media through Decentralized, Trystero and MoQ", async () => {
  const shared = process.env.PERF_SHARED !== "0" && receiverEngine === engine;
  const networkDelay = Number(process.env.PERF_NETWORK_MS ?? 0);
  const history = Number(process.env.PERF_HISTORY ?? 2000);
  const seconds = Number(process.env.PERF_SECONDS ?? 30);
  const context = await newContext(browser, engine);
  const second = shared ? context : await newContext(receiverBrowser, receiverEngine);
  for (const current of new Set([context, second])) {
    await current.route("https://localhost:5173/**", async route => {
      const request = route.request();
      if (networkDelay) await new Promise(resolve => setTimeout(resolve, networkDelay));
      const body = request.postDataBuffer();
      if (request.method() === "PUT" && request.url().includes("/value/") && body) {
        const record = decode(body);
        uploads.push({ at: Date.now(), track: record.v?.moq?.track ?? "metadata", bytes: body.length });
      }
      const response = await environment.fetch(request.url(), {
        method: request.method(), headers: request.headers(), body: body ?? undefined,
      });
      if (response.status >= 400) networkErrors.push({ status: response.status, method: request.method(), url: request.url() });
      await route.fulfill({ status: response.status,
        headers: { ...Object.fromEntries(response.headers), "Access-Control-Allow-Origin": "*" },
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
  }
  const details = process.env.PERF_STORAGE_DETAILS === "1";
  const reorderSignals = process.env.PERF_REORDER_SIGNALS === "1";
  const setup = { users: decentralizedTestUsers, sharedInbox: decentralizedSharedInbox, details, reorderSignals };
  const freshPages = process.env.PERF_FRESH_PAGES === "1";
  if (freshPages) {
    const seeder = await context.newPage();
    await seeder.goto(address);
    await seeder.waitForFunction(() => !!globalThis.lab);
    await seeder.evaluate(options => lab.setup(options), setup);
    await seeder.evaluate(count => lab.history(count), history);
    const retained = await seeder.evaluate(() => lab.retained());
    expect(retained.outbox).toBe(0);
    expect(retained.history).toBeLessThanOrEqual(1024);
    await seeder.close();
  }
  const sender = await context.newPage();
  const receiver = await second.newPage();
  const errors = [];
  const pageErrors = [];
  for (const [name, page] of [["sender", sender], ["receiver", receiver]]) {
    page.on("pageerror", error => {
      const message = `${name}: ${error.message}`;
      pageErrors.push(message);
      errors.push(message);
    });
    page.on("console", message => { if (message.type() === "error") errors.push(`${name}: ${message.text().slice(0, 300)}`); });
    await page.goto(address);
    await page.waitForFunction(() => !!globalThis.lab);
  }
  await sender.evaluate(options => lab.setup(options), setup);
  if (!freshPages) await sender.evaluate(count => lab.history(count), history);
  expect((await sender.evaluate(() => lab.retained())).outbox).toBe(0);
  await receiver.evaluate(options => lab.setup(options), { ...setup, userIndex: shared ? 0 : 1, peerOnly: true });
  if (process.env.PERF_WARM_READER === "1") await receiver.evaluate(() => lab.history(0));
  await sender.evaluate(() => lab.list());
  if (process.env.PERF_RELOAD === "1") {
    // Exercise the same profile after a real call, not only fresh/seeded caches.
    const previous = await sender.evaluate(() => lab.publish());
    await receiver.evaluate(object => lab.play(object), previous);
    await receiver.waitForFunction(() => lab.status().videoFrames > 75, undefined, { timeout: 60_000 });
    await receiver.evaluate(() => lab.stop());
    await sender.evaluate(() => lab.stop());
    expect((await sender.evaluate(() => lab.retained())).outbox).toBe(0);
    await Promise.all([sender.reload(), receiver.reload()]);
    await Promise.all([sender.waitForFunction(() => !!globalThis.lab), receiver.waitForFunction(() => !!globalThis.lab)]);
    await sender.evaluate(options => lab.setup(options), setup);
    await receiver.evaluate(options => lab.setup(options), { ...setup, userIndex: shared ? 0 : 1, peerOnly: true });
    await sender.evaluate(() => lab.list());
  }
  if (process.env.PERF_MISSING_CLOCK === "1") await sender.evaluate(() => lab.hideClock());
  await Promise.all([sender.evaluate(() => lab.resetSamples()), receiver.evaluate(() => lab.resetSamples())]);
  const connectingAt = Date.now();
  try {
    const object = await sender.evaluate(fake => lab.publish(fake), process.env.PERF_FAKE_CAMERA === "1");
    await receiver.evaluate(object => lab.play(object), object);
    await receiver.waitForFunction(() => lab.status().videoFrames > 20, undefined, { timeout: Number(process.env.PERF_CONNECT_TIMEOUT ?? 60_000) });
    const startupMs = Date.now() - connectingAt;
    // Safari requires a gesture for audible playback. Click the same explicit
    // unmute control as the device demo, instead of weakening autoplay policy.
    await receiver.evaluate(() => {
      const button = document.createElement("button");
      button.id = "unmute"; button.textContent = "Enable test audio";
      button.onclick = () => { globalThis.unmuted = lab.unmute(); };
      document.body.append(button);
    });
    await receiver.click("#unmute");
    await receiver.evaluate(() => globalThis.unmuted);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const startup = { sent: await sender.evaluate(() => lab.snapshot()), received: await receiver.evaluate(() => lab.snapshot()) };
    await Promise.all([sender.evaluate(() => lab.resetSamples()), receiver.evaluate(() => lab.resetSamples())]);
    const start = Date.now();
    const retention = [{ seconds: 0, ...await sender.evaluate(() => lab.retained()) }];
    while (Date.now() - start < seconds * 1000) {
      await new Promise(resolve => setTimeout(resolve, Math.min(30_000, seconds * 1000 - (Date.now() - start))));
      retention.push({ seconds: Math.round((Date.now() - start) / 1000), ...await sender.evaluate(() => lab.retained()) });
    }
    const end = Date.now();
    const sent = await sender.evaluate(() => lab.snapshot());
    const received = await receiver.evaluate(() => lab.snapshot());
    const inWindow = values => values.filter(sample => sample.at >= start && sample.at <= end);
    const tracks = {};
    for (const track of ["audio", "video"]) {
      const select = values => inWindow(values).filter(sample => sample.track === track);
      const encoded = select(sent.samples.encoded);
      const posted = select(sent.samples.posted);
      const delivered = select(received.samples.received);
      const decoded = select(received.samples.decoded);
      const timestamps = decoded.map(frame => frame.timestamp).sort((a, b) => a - b);
      tracks[track] = {
        encoded: encoded.length, posted: posted.length, received: delivered.length, decoded: decoded.length,
        decodedPerSecond: decoded.length / seconds,
        postMs: summary(posted.map(frame => frame.ms)),
        deliveryMs: summary(delivered.map(frame => frame.at - sent.timeOrigin - frame.timestamp / 1000)),
        decodedGapMs: summary(timestamps.slice(1).map((timestamp, i) => (timestamp - timestamps[i]) / 1000)),
      };
    }
    const renders = inWindow(received.samples.renders);
    const playout = inWindow(received.samples.playout);
    const totalSamples = playout.reduce((sum, sample) => sum + sample.total, 0);
    const firstVideo = startup.received.samples.decoded.find(frame => frame.track === "video")?.at;
    const firstMedia = startup.received.samples.received.find(frame => frame.track !== "catalog.json")?.at;
    const result = {
      engine, receiverEngine, version: browser.version(), networkDelay, reorderSignals,
      firstVideoMs: firstVideo - connectingAt,
      catalogWaitMs: firstVideo - firstMedia,
      twentyVideoFramesMs: startupMs, shared, history, details, freshPages, seconds, source: process.env.PERF_FAKE_CAMERA === "1" ? "fake camera" : "canvas",
      tracks, drawnVideoFrames: inWindow(sent.samples.capture).length,
      videoLagMs: summary(renders.filter(frame => frame.videoTimestamp).map(frame => frame.at - sent.timeOrigin - frame.videoTimestamp)),
      audioLagMs: summary(renders.filter(frame => frame.audioTimestamp).map(frame => frame.at - sent.timeOrigin - frame.audioTimestamp)),
      playout: { samples: totalSamples, silenceRatio: playout.reduce((sum, sample) => sum + sample.silent, 0) / totalSamples,
        longestSilenceMs: Math.max(0, ...playout.map(sample => sample.longest * 1000 / sample.sampleRate)) },
      scans: [sent.scans, received.scans],
      retained: await sender.evaluate(() => lab.retained()),
      retention,
      outbox: Object.fromEntries([...new Set(sent.samples.outbox.map(sample => sample.method))].map(method => [method, summary(inWindow(sent.samples.outbox).filter(sample => sample.method === method).map(sample => sample.ms))])),
      uploads: uploads.filter(item => item.at <= end).reduce((counts, item) => ({ ...counts, [item.track]: (counts[item.track] ?? 0) + 1 }), {}),
      errors: [...errors, ...sent.samples.errors, ...received.samples.errors], networkErrors,
    };
    const label = process.env.PERF_LABEL ?? "latest";
    await writeFile(`/tmp/graffiti-performance-${label}.json`, JSON.stringify({ result, start, end, startup, sent, received, uploads }, null, 2));
    console.log(JSON.stringify(result, null, 2));
    // Window boundaries can include one packet at one stage but not another.
    // The v6 baseline lost about 20% of audio despite looking mostly smooth.
    expect(tracks.audio.encoded).toBeGreaterThan(seconds * 45);
    expect(tracks.audio.posted).toBeGreaterThan(tracks.audio.encoded * .99);
    expect(tracks.audio.decoded).toBeGreaterThan(tracks.audio.encoded * .99);
    expect(tracks.video.decoded).toBeGreaterThan(tracks.video.encoded * .97);
    // A stale replay used to deliver packets but withhold their codec catalog
    // for ~30 seconds. Established peer delivery must not wait for a refresh.
    expect(result.catalogWaitMs).toBeLessThan(5000);
    expect(result.videoLagMs.p95).toBeLessThan(300);
    expect(result.audioLagMs.p95).toBeLessThan(200);
    expect(result.playout.samples).toBeGreaterThan(seconds * 30_000);
    expect(result.playout.silenceRatio).toBeLessThan(.01);
    expect(result.playout.longestSilenceMs).toBeLessThan(100);
    expect(result.uploads.audio ?? 0).toBe(0);
    expect(result.uploads.video ?? 0).toBe(0);
    expect(result.uploads.metadata).toBeGreaterThan(0);
    expect(result.retained.history).toBeLessThanOrEqual(1024);
    expect(result.retained.live).toBeLessThanOrEqual(1024);
    // Three seconds of live packets, plus signaling/catalog work. The queue
    // must not grow with total call length or earlier calls.
    expect(result.retained.outbox).toBeLessThan(400);
    expect(pageErrors).toEqual([]);
    expect(sent.samples.errors).toEqual([]);
    expect(received.samples.errors).toEqual([]);
  } catch (error) {
    await writeFile(`/tmp/graffiti-performance-${process.env.PERF_LABEL ?? "latest"}-failure.json`, JSON.stringify({
      sender: await sender.evaluate(() => ({ status: lab.status(), snapshot: lab.snapshot() })),
      receiver: await receiver.evaluate(() => ({ status: lab.status(), snapshot: lab.snapshot() })), errors, networkErrors,
    }, null, 2));
    throw error;
  } finally {
    await receiver.evaluate(() => lab.stop());
    await sender.evaluate(() => lab.stop());
    // Playback has stopped; closing pages cancels any remaining discovery HTTP.
    for (const current of new Set([context, second])) await current.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
    if (second !== context) await second.close();
  }
});
