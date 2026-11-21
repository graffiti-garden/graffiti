import { GraffitiRealtime } from "/bundle.js";

const rpcUrl = new URL("/rpc", import.meta.url);
async function rpc(method, ...args) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, args }),
  });
  const result = await response.json();
  if (result.error)
    throw Object.assign(new Error(result.error.message), {
      name: result.error.name,
    });
  return result.value;
}
const graffiti = {
  flush: (...args) => rpc("flush", ...args),
  post: (...args) => rpc("post", ...args),
  get: (...args) => rpc("get", ...args),
  delete: (...args) => rpc("delete", ...args),
  async *discover(...args) {
    const result = await rpc("discover", ...args);
    yield* result.entries;
    return result.result;
  },
  async *continueDiscover(...args) {
    const result = await rpc("continueDiscover", ...args);
    yield* result.entries;
    return result.result;
  },
};

let room, localStream;
const events = {
  joins: [],
  leaves: [],
  messages: [],
  positions: [],
  streams: [],
  videos: [],
  errors: [],
};
globalThis.api = {
  events,
  async join(actor, channel, greet = false) {
    room = new GraffitiRealtime(graffiti, channel, { actor });
    room.onPeerJoin((peer) => {
      events.joins.push(peer);
      if (greet) return room.send({ type: "hello-on-join" });
    });
    room.onPeerLeave((peer) => events.leaves.push(peer));
    room.onMessage({}, (message) => events.messages.push(message));
    room.onMessage(
      {
        properties: {
          value: {
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
            },
            required: ["x", "y", "z"],
          },
        },
      },
      (message) => events.positions.push(message),
    );
    room.onStream(
      {
        properties: {
          actor: { const: "https://actors.example/bob" },
          value: {
            properties: { source: { enum: ["camera", "screen"] } },
            required: ["source"],
          },
        },
      },
      (stream, metadata) => events.videos.push({ id: stream.id, ...metadata }),
    );
    room.onStream({}, (stream, metadata) => {
      events.streams.push({
        ...metadata,
        id: stream.id,
        tracks: stream.getTracks().map((track) => track.kind),
      });
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.srcObject = stream;
      document.body.append(video);
      void video.play().catch(() => {});
    });
    room.onError((error) =>
      events.errors.push({
        code: error.cause?.code,
        message: error.message,
        cause: String(error.cause ?? ""),
      }),
    );
    return room.getSelf();
  },
  send: (message) => room.send(message),
  topology: () => room.transport.getTopology(),
  sendLarge: () => room.send({ text: "x".repeat(65_536) }),
  async startMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    await room.addStream(localStream, { source: "camera" });
  },
  updateMedia: (value) => room.addStream(localStream, value),
  async stopMedia() {
    await room.removeStream(localStream);
    localStream.getTracks().forEach((track) => track.stop());
  },
  leave: () => room.leave(),
};
