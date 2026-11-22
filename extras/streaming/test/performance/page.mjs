import { GraffitiDecentralized } from "/decentralized/index.js";
import { GraffitiRealtime } from "/realtime/index.js";
import { publishStream, playStream } from "/streaming/index.js";

// Test instrumentation only. Timestamp every stage without modifying the wire
// format or requesting hardware permissions.
const samples = { capture: [], encoded: [], decoded: [], posted: [], received: [], renders: [], playout: [], outbox: [], connections: [], errors: [] };
const now = () => performance.timeOrigin + performance.now();
for (const [type, track, stage] of [
  ["AudioEncoder", "audio", "encoded"], ["VideoEncoder", "video", "encoded"],
  ["AudioDecoder", "audio", "decoded"], ["VideoDecoder", "video", "decoded"],
]) {
  const Native = globalThis[type];
  if (!Native) continue;
  globalThis[type] = class extends Native {
    constructor(options) {
      super({ ...options, output(frame, metadata) {
        samples[stage].push({ at: now(), track, timestamp: frame.timestamp,
          duration: frame.duration, frames: frame.numberOfFrames });
        options.output(frame, metadata);
      } });
    }
  };
}
const pcs = [];
const NativeRTC = RTCPeerConnection;
globalThis.RTCPeerConnection = class extends NativeRTC {
  constructor(config) {
    super(config); pcs.push(this);
    this.id = pcs.length;
    this.candidates = { local: {}, remote: {} };
    for (const event of ["connectionstatechange", "iceconnectionstatechange", "icegatheringstatechange"]) {
      this.addEventListener(event, () => samples.connections.push({ at: now(), event, ...this.status() }));
    }
    this.addEventListener("icecandidate", event => this.count("local", event.candidate));
    this.addEventListener("icecandidateerror", event => samples.connections.push({ at: now(), id: this.id, event: "ICE error", code: event.errorCode }));
  }
  count(side, candidate) {
    if (!candidate?.candidate) return;
    const type = / typ (\w+)/.exec(candidate.candidate)?.[1] || "unknown";
    this.candidates[side][type] = (this.candidates[side][type] || 0) + 1;
  }
  async setRemoteDescription(description) {
    await super.setRemoteDescription(description);
    for (const candidate of description.sdp?.split("\r\n") || []) {
      if (candidate.startsWith("a=candidate:")) this.count("remote", { candidate });
    }
    samples.connections.push({ at: now(), event: "remote description", type: description.type, ...this.status() });
  }
  async addIceCandidate(candidate) { await super.addIceCandidate(candidate); this.count("remote", candidate); }
  status() {
    return { id: this.id, state: this.connectionState, ice: this.iceConnectionState,
      gathering: this.iceGatheringState, signaling: this.signalingState, candidates: structuredClone(this.candidates) };
  }
};
const oldKeys = Cache.prototype.keys;
let scans = 0;
Cache.prototype.keys = function (...args) { scans++; return oldKeys.apply(this, args); };
function traceCache() {
  const cacheResponses = new WeakSet();
  const match = Cache.prototype.match;
  Cache.prototype.match = async function (...args) {
    const start = now();
    const response = await match.apply(this, args);
    samples.outbox.push({ at: now(), method: "cache.match", ms: now() - start });
    if (response) cacheResponses.add(response);
    return response;
  };
  const arrayBuffer = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = async function (...args) {
    const start = now();
    const result = await arrayBuffer.apply(this, args);
    if (cacheResponses.has(this)) samples.outbox.push({ at: now(), method: "cache.body", ms: now() - start });
    return result;
  };
}

let storage, graffiti, session, publishing, playing, input, interval, audio, poll;
let polling = true;
const channel = "performance";
const seen = new Set();

function observe(iterator) {
  return (async function* () {
    while (true) {
      const result = await iterator.next();
      if (result.done) return result.value;
      const entry = result.value;
      const frame = entry.object?.value.moq;
      if (frame && !entry.tombstone && !seen.has(entry.object.url)) {
        seen.add(entry.object.url);
        samples.received.push({ at: now(), track: frame.track, timestamp: frame.timestamp,
          group: frame.group, frame: frame.frame });
      }
      if (entry.error) samples.errors.push(String(entry.error));
      yield entry;
    }
  })();
}

globalThis.lab = {
  async setup({ users, sharedInbox, userIndex = 0, peerOnly = false, details = false, reorderSignals = false }) {
    if (details) traceCache();
    const user = users[userIndex];
    session = { actor: user.actor };
    storage = new GraffitiDecentralized({ writeGracePeriod: 5000, defaultInboxEndpoints: [sharedInbox] });
    const raw = storage.graffiti;
    const service = endpoint => ({ serviceEndpoint: endpoint, authorizationEndpoint: "https://localhost:5173/auth", token: user.token });
    raw.sessions.resolveSession = requested => {
      if (requested.actor !== user.actor) throw new Error("The test account is not signed in");
      return {
        actor: user.actor, tokens: [], servicesByAuthorization: [],
        storageBucket: service(user.bucketEndpoint), personalInbox: service(user.inboxEndpoint),
        sharedInboxes: [service(sharedInbox)],
      };
    };
    raw.dids.resolve = async actor => {
      const account = users.find(user => user.actor === actor);
      return { id: actor, service: account ? [
        { id: "#graffitiStorageBucket", type: "GraffitiStorageBucket", serviceEndpoint: account.bucketEndpoint },
        { id: "#graffitiPersonalInbox", type: "GraffitiInbox", serviceEndpoint: account.inboxEndpoint },
        { id: "#graffitiSharedInbox_0", type: "GraffitiInbox", serviceEndpoint: sharedInbox },
      ] : [] };
    };
    if (reorderSignals) {
      // Graffiti makes no delivery-order promise. Let ICE candidate writes
      // overtake their offer, as independent storage requests can in practice.
      const post = storage.post.bind(storage);
      storage.post = async (object, session) => {
        if (object.value.protocol === "graffiti-realtime/v1" && typeof object.value.payload === "string"
          && JSON.parse(object.value.payload).offer) await new Promise(resolve => setTimeout(resolve, 5000));
        return post(object, session);
      };
    }
    for (const method of ["put", "delete", "read"]) {
      const original = raw.outbox[method].bind(raw.outbox);
      raw.outbox[method] = async (...args) => {
        const start = now();
        try { return await original(...args); }
        finally { samples.outbox.push({ at: now(), method, ms: now() - start }); }
      };
    }
    for (const [name, cache] of details ? [["records", await raw.outbox.store], ["journal", await raw.outbox.changes]] : []) {
      const lock = cache.lock.bind(cache);
      cache.lock = (work, mode = "exclusive") => {
        const queued = now();
        return lock(async () => {
          const start = now();
          samples.outbox.push({ at: start, method: `${name}.${mode}.wait`, ms: start - queued });
          try { return await work(); }
          finally { samples.outbox.push({ at: now(), method: `${name}.${mode}.held`, ms: now() - start }); }
        }, mode);
      };
      for (const method of ["get", "set"]) {
        const original = cache[method].bind(cache);
        cache[method] = async (...args) => {
          const start = now();
          let result;
          try { return result = await original(...args); }
          finally { samples.outbox.push({ at: now(), method: `${name}.${method}`, ms: now() - start,
            ...(method === "get" && name === "journal" ? { key: args[0], modified: result?.modified, due: result?.due } : {}),
            ...(method === "get" && args[0] === "clock" ? { clock: result } : {}),
          }); }
        };
      }
    }
    if (peerOnly) {
      // Shared storage would otherwise deliver the sender's frames before RTC.
      // Keep all real storage/discovery work, but require the media to cross RTC.
      for (const method of ["discover", "continueDiscover"]) {
        const original = storage[method].bind(storage);
        storage[method] = (...args) => (async function* () {
          const iterator = original(...args);
          while (true) {
            const result = await iterator.next();
            if (result.done) return result.value;
            const track = result.value.object?.value.moq?.track;
            if (track !== "audio" && track !== "video") yield result.value;
          }
        })();
      }
    }
    graffiti = new GraffitiRealtime(storage);
    const post = graffiti.post.bind(graffiti);
    graffiti.post = async (...args) => {
      const start = now();
      const object = await post(...args);
      const frame = object.value.moq;
      if (frame) samples.posted.push({ at: now(), ms: now() - start, track: frame.track,
        timestamp: frame.timestamp, group: frame.group, frame: frame.frame });
      return object;
    };
    for (const method of ["discover", "continueDiscover"]) {
      const original = graffiti[method].bind(graffiti);
      graffiti[method] = (...args) => observe(original(...args));
    }
    return { timeOrigin: performance.timeOrigin, durable: (await raw.outbox.store).shared };
  },
  async history(count) {
    for (let frame = 0; frame < count; frame++) {
      const object = await storage.post({ value: { frame, payload: "x".repeat(4000) }, channels: [channel] }, session);
      await storage.delete(object, session);
    }
    // Verify a fresh discovery after the simulated workload.
    for await (const entry of storage.discover([channel], {}, session)) {
      if (entry.error) throw entry.error;
    }
  },
  async retained() {
    const outbox = storage.graffiti.outbox;
    return {
      outbox: (await (await outbox.store).keys()).filter(key => key !== "clock").length,
      history: (await (await outbox.changes).keys()).length,
      live: [...graffiti.accounts.values()].reduce((sum, account) => sum + account.entries.size, 0),
    };
  },
  async hideClock() {
    // Fault injection for the phone's missing-key observation. Pending data
    // remains readable, exactly as in that run; no production recovery hook.
    const store = await storage.graffiti.outbox.store;
    const get = store.get.bind(store);
    store.get = key => key === "clock" ? Promise.resolve(undefined) : get(key);
  },
  async publish(fakeCamera = false) {
    audio = new AudioContext();
    await audio.resume();
    const oscillator = audio.createOscillator();
    const destination = audio.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start();
    input = destination.stream;
    if (fakeCamera) {
      const camera = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 15 } });
      input.addTrack(camera.getVideoTracks()[0]);
      const preview = document.createElement("video");
      preview.muted = true; preview.playsInline = true; preview.srcObject = camera;
      document.body.append(preview);
      await preview.play();
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 360;
      document.body.append(canvas);
      const ctx = canvas.getContext("2d");
      let frame = 0;
      interval = setInterval(() => {
        ctx.fillStyle = `hsl(${frame++ * 15} 70% 50%)`;
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = "white"; ctx.font = "30px sans-serif";
        ctx.fillText(String(frame), frame * 7 % 500, 180);
        samples.capture.push({ at: now(), frame });
      }, 1000 / 15);
      input.addTrack(canvas.captureStream(15).getVideoTracks()[0]);
    }
    publishing = await publishStream(graffiti, input, { channels: [channel] }, session);
    void publishing.done.catch(error => samples.errors.push(String(error)));
    return publishing.object;
  },
  async play(object) {
    const connect = AudioNode.prototype.connect;
    const contexts = new WeakSet();
    AudioNode.prototype.connect = function (destination, ...args) {
      const result = connect.call(this, destination, ...args);
      if (destination instanceof AudioDestinationNode && !contexts.has(this.context)) {
        contexts.add(this.context);
        void this.context.audioWorklet.addModule("/monitor.mjs").then(() => {
          const monitor = new AudioWorkletNode(this.context, "continuity-monitor");
          monitor.port.onmessage = event => samples.playout.push({ at: now(), ...event.data });
          connect.call(this, monitor);
          connect.call(monitor, destination);
        }).catch(error => samples.errors.push(String(error)));
      }
      return result;
    };
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    playing = await playStream(graffiti, object, canvas, { session });
    void playing.done.catch(error => samples.errors.push(String(error)));
    interval = setInterval(() => samples.renders.push({ at: now(), ...playing.getStats() }), 50);
  },
  unmute() { return playing.setMuted(false); },
  list() {
    poll = (async () => {
      let cursor;
      while (polling) {
        const iterator = cursor === undefined
          ? graffiti.discover([channel], { properties: { value: { required: ["liveStream"] } } }, session)
          : graffiti.continueDiscover(cursor, session);
        while (true) {
          const result = await iterator.next();
          if (result.done) { cursor = result.value.cursor; break; }
          if (result.value.error) samples.errors.push(String(result.value.error));
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })().catch(error => samples.errors.push(String(error)));
  },
  status() { return { ...playing?.getStats(), connections: pcs.map(pc => pc.status()), errors: samples.errors }; },
  resetSamples() { for (const [name, values] of Object.entries(samples)) if (name !== "errors") values.length = 0; },
  snapshot() { return { samples, scans, timeOrigin: performance.timeOrigin, at: now(), visibility: document.visibilityState }; },
  async stop() {
    polling = false;
    clearInterval(interval);
    await playing?.stop();
    await publishing?.stop();
    input?.getTracks().forEach(track => track.stop());
    await audio?.close();
    await poll;
    await graffiti.close();
    await storage.flush({}, session);
  },
};
