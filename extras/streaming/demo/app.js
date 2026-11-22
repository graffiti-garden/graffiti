const $ = id => document.getElementById(id);
const version = 12;
const run = crypto.randomUUID();
const diagnosticKey = "graffiti-streaming-diagnostics";
let entries = [];
try {
  const saved = JSON.parse(localStorage.getItem(diagnosticKey) || "[]");
  if (Array.isArray(saved)) entries = saved.slice(-200);
} catch { /* Diagnostics should also work when browser storage is unavailable. */ }
const previousEvent = entries.at(-1)?.event;
const peers = new Set();
const players = new Map();
const traffic = { postedFrames: 0, postedBytes: 0, tracks: {}, pendingPosts: 0, maxPostMs: 0 };
const storageDiagnostics = { durableOutbox: undefined, stages: {}, uploads: {}, failures: {} };
const pendingStorage = new Set();
let session;
let sharing;
let watching;

function log(event, detail) {
  entries.push({ time: new Date().toISOString(), run, event, detail });
  if (entries.length > 200) entries.shift();
  // Save each stage immediately: a terminated Safari process cannot report an error.
  try { localStorage.setItem(diagnosticKey, JSON.stringify(entries)); } catch {}
  $("log").textContent = entries.map(entry => `${entry.time.slice(11, 23)} ${entry.event} ${JSON.stringify(entry.detail ?? "")}`).join("\n");
}

function errorDetail(error) {
  return { name: error?.name, message: error?.message || String(error), stack: error?.stack };
}

function report(stage, error) {
  $("error").textContent = `${stage}: ${error?.name || "Error"}: ${error?.message || error}`;
  log(stage, errorDetail(error));
}

// Preserve the first failure at its source: Safari's "Internal error" alone
// cannot distinguish a local cache failure from a failed network request.
function operationFailed(operation, error) {
  const failure = storageDiagnostics.failures[operation] ??= { count: 0, ...errorDetail(error) };
  if (++failure.count === 1) log("Operation failed", { operation, ...errorDetail(error) });
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  try { return await nativeFetch(...args); }
  catch (error) {
    // Never record request URLs, headers, bodies, or credentials.
    operationFailed("fetch", error);
    throw error;
  }
};

window.addEventListener("unhandledrejection", event => report("Unhandled error", event.reason));
window.addEventListener("error", event => report("Script error", event.error || event.message));
// MoQ currently reports some codec failures through console.error. Preserve
// those in phone diagnostics, without logging arbitrary objects or credentials.
const consoleError = console.error.bind(console);
console.error = (...args) => {
  consoleError(...args);
  if (["audio decoder error", "video decoder error", "spawn error", "effect error", "cleanup error"].includes(args[0])) {
    log("Media library", args.filter(value => typeof value === "string" || value instanceof Error)
      .map(value => value instanceof Error ? `${value.name}: ${value.message}` : value).join(" "));
  }
};
log("Page opened", {
  version,
  userAgent: navigator.userAgent,
  secureContext: isSecureContext,
  navigation: performance.getEntriesByType("navigation")[0]?.type,
  previousEvent,
});
if (previousEvent) $("recovered").textContent = `Previous diagnostics recovered. Last event: ${previousEvent}.`;
document.addEventListener("visibilitychange", () => log("Visibility", { state: document.visibilityState }));
window.addEventListener("pageshow", event => log("Page shown", { persisted: event.persisted }));
for (const event of ["webkitbeginfullscreen", "webkitendfullscreen"]) {
  document.addEventListener(event, e => log(event, {
    element: e.target.id || e.target.tagName,
    playsInline: e.target.playsInline,
  }), true);
}

// Demo-only instrumentation of browser connections; the library uses only Graffiti.
const NativePeerConnection = window.RTCPeerConnection;
let connectionId = 0;
window.RTCPeerConnection = class extends NativePeerConnection {
  constructor(...args) {
    super(...args);
    this.id = ++connectionId;
    this.candidates = { local: {}, remote: {} };
    peers.add(this);
    this.addEventListener("connectionstatechange", () => {
      log("WebRTC connection", this.diagnostics());
      if (this.connectionState === "closed") peers.delete(this);
    });
    this.addEventListener("icegatheringstatechange", () => log("ICE gathering", this.diagnostics()));
    this.addEventListener("icecandidate", event => this.countCandidate("local", event.candidate));
    this.addEventListener("icecandidateerror", event => log("ICE server", {
      id: this.id, url: event.url, code: event.errorCode, message: event.errorText,
    }));
  }
  countCandidate(side, candidate) {
    if (!candidate?.candidate) return;
    // Count types only; do not put IP addresses or full SDP in diagnostics.
    const type = / typ (\w+)/.exec(candidate.candidate)?.[1] || "unknown";
    const counts = this.candidates[side];
    counts[type] = (counts[type] || 0) + 1;
    if (counts[type] === 1) log("ICE candidate", { id: this.id, side, type });
  }
  diagnostics() {
    return {
      id: this.id, state: this.connectionState, ice: this.iceConnectionState,
      gathering: this.iceGatheringState, signaling: this.signalingState,
      candidates: structuredClone(this.candidates),
    };
  }
  async setRemoteDescription(description) {
    await super.setRemoteDescription(description);
    for (const candidate of description.sdp?.split("\r\n") || []) {
      if (candidate.startsWith("a=candidate:")) this.countCandidate("remote", { candidate });
    }
    log("Remote description", { type: description.type, ...this.diagnostics() });
  }
  async addIceCandidate(candidate) {
    try {
      await super.addIceCandidate(candidate);
      this.countCandidate("remote", candidate);
    } catch (error) {
      log("ICE candidate rejected", { id: this.id, name: error.name, message: error.message });
      throw error;
    }
  }
  close() {
    super.close();
    log("WebRTC closed", this.diagnostics());
    peers.delete(this);
  }
};

const [{ GraffitiDecentralized }, { GraffitiRealtime }, { publishStream, playStream, streamSchema }] = await Promise.all([
  import("/decentralized/index.js"),
  import("/realtime/index.js"),
  import("/streaming/index.js"),
]);

const storage = new GraffitiDecentralized({ writeGracePeriod: 5000 });
// Inspect this implementation only in the diagnostic demo. The streaming
// library itself depends exclusively on the public Graffiti API.
const implementation = storage.graffiti;
function timing(label, start) {
  const ms = Math.round(performance.now() - start);
  const stage = storageDiagnostics.stages[label] ??= { calls: 0, totalMs: 0, maxMs: 0 };
  stage.calls++;
  stage.totalMs += ms;
  stage.maxMs = Math.max(stage.maxMs, ms);
}
function measure(object, method, label) {
  const original = object[method].bind(object);
  object[method] = async (...args) => {
    const start = performance.now();
    const pending = { label, start };
    pendingStorage.add(pending);
    try {
      const result = await original(...args);
      if (label === "cache.get" && args[0] === "clock") storageDiagnostics.outboxClock = result ?? null;
      if (label === "cache.keys") storageDiagnostics.outboxRecords = result.filter(key => key !== "clock").length;
      return result;
    }
    catch (error) { operationFailed(label, error); throw error; }
    finally { pendingStorage.delete(pending); timing(label, start); }
  };
}
measure(implementation.objectEncoding, "encode", "encode");
for (const method of ["put", "delete", "read"]) measure(implementation.outbox, method, `outbox.${method}`);
void implementation.outbox.store.then(async store => {
  storageDiagnostics.durableOutbox = store.shared;
  log("Outbox storage", { durable: store.shared });
  for (const method of ["get", "set", "keys", "delete"]) measure(store, method, `cache.${method}`);
  const initialClock = await store.get("clock");
  storageDiagnostics.clockAtOpen = {
    value: initialClock ?? null,
    keyPresent: (await store.keys()).includes("clock"),
  };
  log("Restored outbox clock", storageDiagnostics.clockAtOpen);
  const set = store.set.bind(store);
  let checkedClock = false;
  store.set = async (key, value) => {
    await set(key, value);
    if (key !== "clock" || checkedClock) return;
    checkedClock = true;
    // One read-back per page, not another cache operation on every media frame.
    storageDiagnostics.clockReadBack = { written: value, read: await store.get(key) ?? null };
    log("Outbox clock read-back", storageDiagnostics.clockReadBack);
  };
  const lock = store.lock.bind(store);
  store.lock = async (work, mode = "exclusive") => {
    const queued = performance.now();
    const pending = { label: "lock.wait", mode, start: queued };
    pendingStorage.add(pending);
    try {
      return await lock(async () => {
        timing("lock.wait", queued);
        pending.label = "lock.held";
        pending.start = performance.now();
        try { return await work(); }
        finally { timing("lock.held", pending.start); }
      }, mode);
    } finally { pendingStorage.delete(pending); timing("lock.total", queued); }
  };
});
void implementation.outbox.changes.then(cache => {
  for (const method of ["get", "set"]) measure(cache, method, `journal.${method}`);
});
storageDiagnostics.cacheRoundTrip = "pending";
void (async () => {
  try {
    const cache = await caches.open("graffiti-streaming-diagnostic");
    const key = `https://graffiti.invalid/?probe=${run}`;
    await cache.put(key, new Response(new Uint8Array([42])));
    const response = await cache.match(key);
    const bytes = response && new Uint8Array(await response.arrayBuffer());
    storageDiagnostics.cacheRoundTrip = bytes?.[0] === 42 ? "passed" : "failed";
    await cache.delete(key);
  } catch (error) { storageDiagnostics.cacheRoundTrip = error.name; }
  log("Cache round trip", { result: storageDiagnostics.cacheRoundTrip });
})();
// This reports actual timer lateness, including suspension, without changing
// library scheduling or relying on the media playback timer itself.
let timerDue = performance.now() + 1000;
setInterval(() => {
  const late = performance.now() - timerDue;
  if (late > 1000) log("Timer delayed", { ms: Math.round(late), visibility: document.visibilityState });
  timerDue = performance.now() + 1000;
}, 1000);

// A lock held by another page is different from this page doing slow work.
// Keep only categories and that distinction, never lock names containing URLs.
let inspectingLocks = false;
setInterval(async () => {
  if (inspectingLocks || !navigator.locks) return;
  inspectingLocks = true;
  const name = `graffiti:diagnostic:${run}`;
  const start = performance.now();
  try {
    await navigator.locks.request(name, async () => {
      const snapshot = await navigator.locks.query();
      const self = snapshot.held.find(lock => lock.name === name)?.clientId;
      const summarize = locks => {
        const counts = new Map();
        for (const lock of locks) {
          if (lock.name === name) continue;
          const category = lock.name.startsWith("graffiti:cache:") ? lock.name.slice("graffiti:cache:".length)
            : lock.name.startsWith("graffiti:inbox:") ? "inbox query"
            : lock.name.startsWith("graffiti:outbox:") ? "URL upload" : "other";
          const key = JSON.stringify({ category, mode: lock.mode, page: lock.clientId === self ? "this page" : "another page" });
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts].map(([key, count]) => ({ ...JSON.parse(key), count }));
      };
      storageDiagnostics.locks = { at: Date.now(), queryMs: Math.round(performance.now() - start),
        held: summarize(snapshot.held), pending: summarize(snapshot.pending) };
    });
  } catch (error) { storageDiagnostics.locks = { error: error.message }; }
  finally { inspectingLocks = false; }
}, 5000);

// Count actual bucket PUTs, separately from locally accepted post() calls.
// Associate only in-flight keys with a category; never log keys or credentials.
const uploading = new Map();
const persist = implementation.persistWrite.bind(implementation);
implementation.persistWrite = async write => {
  const frame = write.object.value.moq;
  const category = frame
    ? (write.object.channels.includes(channel) ? frame.track : `other channel / ${frame.track}`)
    : (write.object.value.liveStream ? "descriptor" : "signaling / other");
  uploading.set(write.storageBucketKey, { category, expired: frame?.expires <= Date.now() });
  try { return await persist(write); }
  finally { uploading.delete(write.storageBucketKey); }
};
const upload = implementation.storageBuckets.put.bind(implementation.storageBuckets);
implementation.storageBuckets.put = async (endpoint, key, bytes, token) => {
  const { category, expired } = uploading.get(key) || { category: "other" };
  const counts = storageDiagnostics.uploads[category] ??= { attempted: 0, succeeded: 0, failed: 0, bytes: 0, expired: 0 };
  counts.attempted++;
  counts.bytes += bytes.byteLength;
  if (expired) counts.expired++;
  if (counts.attempted === 1) log("Persistent upload started", { category, expired });
  try {
    await upload(endpoint, key, bytes, token);
    counts.succeeded++;
    if (counts.succeeded === 1) log("Persistent upload confirmed", { category });
  } catch (error) {
    counts.failed++;
    operationFailed("bucket.put", error);
    throw error;
  }
};
const flush = storage.flush.bind(storage);
storage.flush = async (...args) => {
  const start = performance.now();
  try { return await flush(...args); }
  finally {
    const ms = Math.round(performance.now() - start);
    if (ms > 1000) log("Slow flush", { ms, urls: args[0].length });
  }
};
const graffiti = new GraffitiRealtime(storage);
// Count ordinary API traffic, without recording media or session credentials.
const post = graffiti.post.bind(graffiti);
graffiti.post = async (...args) => {
  const start = performance.now();
  traffic.pendingPosts++;
  const frame = args[0].value.moq;
  try {
    const result = await post(...args);
    if (frame) {
      traffic.postedFrames++;
      traffic.postedBytes += frame.payload.length;
      traffic.tracks[frame.track] = (traffic.tracks[frame.track] || 0) + 1;
    }
    return result;
  } finally {
    traffic.pendingPosts--;
    const ms = Math.round(performance.now() - start);
    traffic.maxPostMs = Math.max(traffic.maxPostMs, ms);
    if (ms > 1000) log("Slow post", { ms, track: frame?.track || "descriptor" });
  }
};

const channel = new URLSearchParams(location.hash.slice(1)).get("channel") || `stream-test:${crypto.randomUUID()}`;
history.replaceState(null, "", `#${new URLSearchParams({ channel })}`);
$("channel").value = channel;
$("identity").textContent = "Sign in to join this channel.";
$("login").disabled = false;
$("login").onclick = () => graffiti.login().catch(error => report("Sign-in", error));
$("copy-link").onclick = () => navigator.clipboard.writeText(location.href)
  .then(() => log("Test link copied")).catch(error => report("Copy link", error));
$("copy-log").onclick = () => navigator.clipboard.writeText(JSON.stringify({
  version, run, browser: navigator.userAgent, traffic, storage: storageDiagnostics,
  realtime: [...graffiti.accounts.values()].map(account => ({
    entries: account.entries.size,
    rooms: [...account.connections.values()].filter(connection => connection.room).length,
  })),
  pendingStorage: [...pendingStorage].map(({ label, mode, start }) => ({ label, mode, ms: Math.round(performance.now() - start) })),
  playback: [...players.values()].map(state => ({ id: state.id, ...state.sample })),
  connections: [...peers].map(peer => peer.diagnostics()),
  entries: entries.filter(entry => entry.run === run), previousEvent,
}, null, 2)).then(() => { $("copy-log").textContent = "Copied"; }).catch(error => report("Copy diagnostics", error));

graffiti.sessionEvents.addEventListener("login", event => {
  if (event.detail.error) { report("Sign-in", event.detail.error); return; }
  session = event.detail.session;
  $("identity").textContent = session.actor;
  $("login").disabled = true;
  log("Signed in", { actor: session.actor });
  beginListening();
});
function beginListening() {
  $("start").disabled = !session;
  if (!session) { $("listening").textContent = "Ready. Sign in to join this channel."; return; }
  watching?.abort();
  watching = new AbortController();
  watchStreams(watching.signal, session).catch(error => report("Discovery", error));
}
graffiti.sessionEvents.addEventListener("initialized", event => {
  if (event.detail?.error) report("Restore sign-in", event.detail.error);
});
graffiti.sessionEvents.addEventListener("logout", event => {
  if (event.detail.error) { report("Sign-out", event.detail.error); return; }
  if (event.detail.actor !== session?.actor) return;
  session = undefined;
  watching?.abort();
  void stopSharing();
  for (const key of players.keys()) removePlayer(key);
  $("login").disabled = false;
  $("start").disabled = true;
  $("identity").textContent = "Signed out.";
});

async function watchStreams(signal, reader) {
  $("listening").textContent = "Listening for streams and connecting to peers…";
  let cursor;
  while (!signal.aborted) {
    try {
      const results = cursor === undefined
        ? graffiti.discover([channel], streamSchema, reader)
        : graffiti.continueDiscover(cursor, reader);
      while (!signal.aborted) {
        const result = await results.next();
        if (result.done) { cursor = result.value.cursor; break; }
        if (signal.aborted) break;
        const entry = result.value;
        if (entry.error) { report("Discovery", entry.error); continue; }
        const object = entry.object;
        const key = streamKey(object);
        const current = players.get(key);
        if (entry.tombstone) {
          // An older announcement's deletion must not remove its renewal.
          if (current?.object.url === object.url) removePlayer(key);
        } else if (object.value.liveStream.expires > Date.now()
          && object.value.liveStream.id !== sharing?.publication?.object.value.liveStream.id) {
          if (!current) addPlayer(object, reader);
          else if (object.value.liveStream.expires > current.object.value.liveStream.expires) current.object = object;
        }
      }
      if (signal.aborted) void results.return({ cursor: "" });
    } catch (error) {
      if (error.name === "GraffitiErrorCursorExpired") cursor = undefined;
      else { report("Discovery", error); await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

const streamKey = object => JSON.stringify([object.actor, object.value.liveStream.id]);
function addPlayer(object, reader) {
  const controller = new AbortController();
  const card = document.createElement("article");
  const title = document.createElement("h2");
  title.textContent = object.actor === session.actor ? "Your other stream" : "Remote stream";
  const actor = document.createElement("p");
  actor.className = "muted";
  actor.textContent = object.actor;
  actor.style.overflowWrap = "anywhere";
  const canvas = document.createElement("canvas");
  canvas.hidden = !object.value.liveStream.video;
  const status = document.createElement("p");
  status.textContent = "Connecting — waiting for MoQ media…";
  const sound = document.createElement("button");
  sound.textContent = "Enable sound";
  sound.hidden = !object.value.liveStream.audio;
  sound.disabled = true;
  const state = { id: object.value.liveStream.id, object, controller, card, status, muted: true };
  sound.onclick = async () => {
    try {
      await state.player.setMuted(!state.muted);
      state.muted = !state.muted;
      sound.textContent = state.muted ? "Enable sound" : "Mute";
    } catch (error) { report("Play / sound", error); }
  };
  card.append(title, actor, canvas, status, sound);
  $("remote").append(card);
  players.set(streamKey(object), state);
  log("Discovered stream", { actor: object.actor, ...object.value.liveStream });
  playStream(graffiti, object, canvas, { session: reader, signal: controller.signal }).then(player => {
    state.player = player;
    sound.disabled = false;
    return player.done;
  }).catch(error => {
    if (controller.signal.aborted && error === controller.signal.reason) return;
    status.textContent = `Playback failed: ${error.message}`;
    report("Playback", error);
  });
}

function removePlayer(key) {
  const player = players.get(key);
  if (!player) return;
  player.controller.abort();
  player.card.remove();
  players.delete(key);
}

function releaseCapture(state) {
  state.input?.getTracks().forEach(track => track.stop());
  if (sharing !== state) return;
  sharing = undefined;
  $("local").srcObject = null;
  $("local-card").hidden = true;
  $("stop").disabled = true;
  $("start").disabled = !session;
  $("mode").disabled = false;
  $("preview-only").disabled = false;
  $("publishing").textContent = "Camera and microphone are off.";
  log("Capture released");
}

$("start").onclick = async () => {
  const state = { controller: new AbortController() };
  sharing = state;
  $("error").textContent = "";
  $("start").disabled = true;
  $("mode").disabled = true;
  $("preview-only").disabled = true;
  const mode = $("mode").value;
  const previewOnly = $("preview-only").checked;
  log("Share requested", { mode, previewOnly });
  let stage = "Camera / microphone";
  try {
    $("publishing").textContent = "Opening camera / microphone…";
    state.input = await navigator.mediaDevices.getUserMedia({
      audio: mode !== "camera",
      video: mode !== "audio" ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : false,
    });
    state.controller.signal.throwIfAborted();
    log("Capture opened", state.input.getTracks().map(track => {
      const { width, height, frameRate, sampleRate, channelCount } = track.getSettings();
      return { kind: track.kind, state: track.readyState, width, height, frameRate, sampleRate, channelCount };
    }));
    stage = "Local preview";
    $("local").srcObject = state.input;
    $("local-card").hidden = false;
    $("stop").disabled = false;
    log("Preview attached");
    if (previewOnly) {
      $("publishing").textContent = "Preview only — capture is running; no encoder or publishing has started.";
      return;
    }
    stage = "Publishing";
    $("publishing").textContent = "Camera / microphone opened. Starting the encoder…";
    log("Publishing requested");
    state.starting = publishStream(graffiti, state.input, { channels: [channel], signal: state.controller.signal }, session);
    state.publication = await state.starting;
    removePlayer(streamKey(state.publication.object));
    $("publishing").textContent = "Sharing through Graffiti. Open the test link on the other device.";
    log("Publishing", state.publication.object.value.liveStream);
    state.publication.done.catch(error => {
      if (error !== state.controller.signal.reason) report("Publishing", error);
    }).finally(() => releaseCapture(state));
  } catch (error) {
    if (error !== state.controller.signal.reason) report(stage, error);
    releaseCapture(state);
  }
};

async function stopSharing() {
  const state = sharing;
  if (!state) return;
  $("stop").disabled = true;
  $("publishing").textContent = "Stopping and removing stream data…";
  state.controller.abort();
  try { await (await state.starting)?.stop(); }
  catch (error) {
    if (error !== state.controller.signal.reason) report("Stop sharing", error);
  }
  finally { releaseCapture(state); log("Sharing stopped"); }
}
$("stop").onclick = stopSharing;

setInterval(async () => {
  let received = 0;
  let sent = 0;
  const states = {};
  for (const peer of peers) {
    states[peer.connectionState] = (states[peer.connectionState] || 0) + 1;
    const stats = await peer.getStats().catch(() => []);
    stats.forEach(stat => {
      if (stat.type === "data-channel") { received += stat.bytesReceived || 0; sent += stat.bytesSent || 0; }
    });
  }
  $("connections").textContent = `WebRTC: ${Object.entries(states).map(([state, count]) => `${count} ${state}`).join(", ") || "no connections"}. Data channels: ${Math.round(sent / 1024)} KB sent, ${Math.round(received / 1024)} KB received.`;
  $("traffic").textContent = `Graffiti API: ${traffic.postedFrames} MoQ frames posted (${Math.round(traffic.postedBytes / 1024)} KB including base64). ${traffic.pendingPosts} writes pending; slowest post ${traffic.maxPostMs} ms.`;
  $("outbox").textContent = `Outbox: ${storageDiagnostics.outboxRecords ?? "?"} queued records at last check. Completed writes are removed; discovery history is limited to 1,024 changes.`;
  const mediaUploads = ["audio", "video"].map(track => storageDiagnostics.uploads[track]);
  $("persistence").textContent = `This channel's audio/video frames sent to persistent storage: ${mediaUploads.reduce((sum, counts) => sum + (counts?.attempted || 0), 0)} attempted, ${mediaUploads.reduce((sum, counts) => sum + (counts?.succeeded || 0), 0)} confirmed. ${storageDiagnostics.durableOutbox === false ? "Local storage unavailable: posts wait for the server." : "Signaling, catalogs and older channels are counted separately in the copied diagnostics."}`;
  for (const [key, state] of players) {
    if (state.object.value.liveStream.expires <= Date.now()) {
      log("Stream expired", { id: state.id });
      removePlayer(key);
      continue;
    }
    if (!state.player) continue;
    const stats = state.player.getStats();
    const now = performance.now();
    const elapsed = now - (state.sampledAt ?? now);
    const fps = elapsed ? (stats.videoFrames - (state.previous?.videoFrames ?? stats.videoFrames)) * 1000 / elapsed : 0;
    state.sample = { ...stats, muted: state.muted, videoFps: Math.round(fps * 10) / 10,
      intervalMs: Math.round(elapsed),
      audioAdvanceMs: Math.round((stats.audioTimestamp ?? 0) - (state.previous?.audioTimestamp ?? stats.audioTimestamp ?? 0)),
    };
    const progressing = stats.videoFrames > (state.previous?.videoFrames ?? 0)
      || stats.audioTimestamp > (state.previous?.audioTimestamp ?? 0);
    const waiting = stats.videoFrames || stats.audioBytes ? "Waiting for media to resume" : "Connecting to this participant…";
    state.status.textContent = `${progressing ? "Playing" : waiting}${state.muted ? " · sound muted" : ""}. ${state.sample.videoFps} fps; ${stats.videoFrames} decoded video frames, ${Math.round(stats.audioBytes / 1024)} KB decoded audio.`;
    if (progressing !== state.progressing) log(progressing ? "Playback advancing" : "Playback waiting", stats);
    if (now - (state.reportedAt ?? 0) >= 5000) {
      log("Playback sample", { id: state.id, ...state.sample });
      state.reportedAt = now;
    }
    state.progressing = progressing;
    state.previous = stats;
    state.sampledAt = now;
  }
  $("listening").textContent = session
    ? `${players.size} remote stream(s). ${states.connected ? "Peers connected." : "Listening for streams and connecting to peers…"}`
    : "Waiting for sign-in.";
}, 1000);

// Closing a tab cannot await cleanup. Use Stop sharing for a clean test.
window.addEventListener("pagehide", event => {
  log("Page hidden", { persisted: event.persisted });
  sharing?.controller.abort();
  watching?.abort();
  void graffiti.close();
});
