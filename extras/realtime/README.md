# Graffiti Realtime

Live messages and media streams, using [Graffiti](https://graffiti.garden) for
signaling and actor verification and [Trystero](https://github.com/dmotz/trystero)
for peer-to-peer communication over WebRTC.

```ts
import type { JSONSchema } from "@graffiti-garden/api";
import { GraffitiRealtime } from "@graffiti-garden/realtime";

// graffiti and session come from your application's existing Graffiti login.
const room = new GraffitiRealtime(graffiti, "minecraftish:world-42", session);

// Observe positions from others
const positionSchema = {
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
} as const satisfies JSONSchema;
// Register listeners immediately so you don't miss early events.
room.onMessage(positionSchema, ({ value, actor, peerId }) => {
  updatePlayer(actor, peerId, value);
});

// Stream video from one other actor
const videoMetadataSchema = {
  properties: {
    actor: { const: otherActor },
    value: {
      properties: {
        source: { enum: ["camera", "screen"] },
      },
      required: ["source"],
    },
  },
} as const satisfies JSONSchema;
room.onStream(videoMetadataSchema, (stream, { value, actor, peerId }) => {
  showVideo(`${peerId}:${stream.id}`, stream, actor, value);
});

room.onPeerJoin(({ actor, peerId }) => addPlayer(actor, peerId));
room.onPeerLeave(({ actor, peerId }) => removePlayer(actor, peerId));
room.onError(showConnectionError);

// Sending waits for local initialization automatically.
await room.send({ x: 10, y: 3, z: 5 });

// Optional: look up this endpoint's identity.
const { actor, peerId } = await room.getSelf();
console.log(actor === session.actor); // true
console.log(peerId); // a unique ID for this room's endpoint

// From a camera/microphone button:
const stream = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: true,
});
await room.addStream(stream, { source: "camera" });

// When stopping the camera:
await room.removeStream(stream);
stream.getTracks().forEach((track) => track.stop());

// When leaving the app or logging out:
await room.leave();
```

## API

| Member | Behavior |
| --- | --- |
| `getSelf()` | Resolves to `{ actor, peerId }` after local identity publication. Initialization failures reject it. |
| `send(value)` | Broadcasts a JSON object to the room. |
| `addStream(stream, value?)` | Shares a stream and JSON object metadata with current and future peers. Metadata defaults to `{}`. Call again after changing metadata or tracks. |
| `removeStream(stream)` | Removes publication to current and future peers. Does not stop local tracks. |
| `leave()` | Stops polling, closes peers, and attempts cleanup. Safe to call repeatedly. Does not stop local tracks. |
| `onMessage(schema, fn)` | Calls `fn({ value, actor, peerId })` for matching messages, with types inferred from the schema. |
| `onStream(schema, fn)` | Calls `fn(stream, { value, actor, peerId })` for matching stream metadata. Observe the stream's track events for later changes. |
| `onPeerJoin(fn)` / `onPeerLeave(fn)` | One event per verified endpoint, with `{ actor, peerId }`. |
| `onError(fn)` | Background signaling, verification, schema, and connection errors. Catch rejected method promises separately. |


All listeners return an unsubscribe function. Register them immediately after
construction; events are not replayed. `send()` and `addStream()` wait for local
initialization automatically.

Schemas match the complete `{ value, actor, peerId }` envelope. `value` is a JSON
object containing the message or stream metadata; `actor` is the verified
Graffiti actor, and `peerId` identifies their endpoint. Use `{}` to receive all
events.

Everyone who joins the channel can receive messages and media. Schema filters
only select incoming events; use a privately shared channel for private rooms.

Connections use public STUN servers. TURN is not provisioned, so some restrictive
networks still require a relay that this package does not yet provide.
