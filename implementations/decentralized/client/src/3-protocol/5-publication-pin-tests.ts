import { afterEach, describe, expect, test, vi } from "vitest";
import type { GraffitiSession } from "@graffiti-garden/api";
import { GraffitiDecentralized } from "./5-graffiti";
import { decentralizedTestUsers, type DecentralizedTestEnvironment } from "../../test/environment";

const actor = "did:web:author.test";
const personal = "https://example.test/personal";
const shared = "https://example.test/shared";
const bucket = "https://example.test/bucket";

class PublicationGraffiti extends GraffitiDecentralized {
  get services() {
    return { inboxes: this.inboxes, buckets: this.storageBuckets, sessions: this.sessions, dids: this.dids };
  }
}

function setup() {
  const graffiti = new PublicationGraffiti({ defaultInboxEndpoints: [] });
  const service = { token: "token", authorizationEndpoint: "https://example.test/auth" };
  vi.spyOn(graffiti.services.sessions, "resolveSession").mockReturnValue({
    actor, tokens: [], servicesByAuthorization: [],
    personalInbox: { ...service, serviceEndpoint: personal },
    sharedInboxes: [{ ...service, serviceEndpoint: shared }],
    storageBucket: { ...service, serviceEndpoint: bucket },
  });
  const send = vi.spyOn(graffiti.services.inboxes, "send").mockImplementation(async endpoint => endpoint);
  const pin = vi.spyOn(graffiti.services.inboxes, "pin").mockResolvedValue();
  const unpin = vi.spyOn(graffiti.services.inboxes, "unpin").mockResolvedValue();
  const put = vi.spyOn(graffiti.services.buckets, "put").mockResolvedValue();
  const remove = vi.spyOn(graffiti.services.buckets, "delete").mockResolvedValue();
  return { graffiti, send, pin, unpin, put, remove };
}

export function publicationPinTests() {
  describe("Publication pins", () => {
    afterEach(() => vi.restoreAllMocks());

    test("waits for both shared and personal pins before publishing", async () => {
      const { graffiti, pin, unpin, remove } = setup();
      let finishPersonal!: () => void;
      pin.mockImplementation(async endpoint => {
        if (endpoint === personal) await new Promise<void>(resolve => { finishPersonal = resolve; });
      });
      const pending = graffiti.post({ value: {}, channels: [] }, { actor });
      let complete = false;
      void pending.then(() => { complete = true; }, () => { complete = true; });
      try {
        await vi.waitFor(() => expect(finishPersonal).toBeDefined());
        expect(pin).toHaveBeenCalledWith(shared, [shared], "token");
        expect(pin).toHaveBeenCalledWith(personal, [personal], "token");
        expect(complete).toBe(false);
      } finally { finishPersonal?.(); }
      await expect(pending).resolves.toMatchObject({ actor });
      expect(unpin).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    test.each(["object", "media"])("settles and unpins failed %s publication", async kind => {
      const { graffiti, pin, unpin, put, remove } = setup();
      const failure = new Error("Pin response lost");
      let finishShared!: () => void;
      pin.mockImplementation(async endpoint => {
        if (endpoint === personal) throw failure;
        await new Promise<void>(resolve => { finishShared = resolve; });
      });
      // Unpinning is best effort; a failure must not hide the original error.
      unpin.mockRejectedValueOnce(new Error("Unpin offline"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      if (kind === "media") remove.mockRejectedValueOnce(new Error("Delete offline"));
      const pending = kind === "object"
        ? graffiti.post({ value: {}, channels: [] }, { actor })
        : graffiti.postMedia({ data: new Blob(["media"]) }, { actor });
      const rejected = expect(pending).rejects.toBe(failure);
      try {
        await vi.waitFor(() => expect(pin).toHaveBeenCalledTimes(2));
        // A late successful pin must finish before any compensating unpin.
        expect(unpin).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
      } finally { finishShared?.(); }
      await rejected;
      // Also unpin the failed request: its response may have been lost after
      // the server created the pin. Media has both raw bytes and a descriptor.
      expect(unpin).toHaveBeenCalledWith(shared, [shared], "token");
      expect(unpin).toHaveBeenCalledWith(personal, [personal], "token");
      expect(put).toHaveBeenCalledTimes(kind === "media" ? 2 : 1);
      // Objects retain their queued bytes for retry; media keeps its existing rollback.
      if (kind === "media") {
        expect(remove.mock.calls.map(([, key]) => key).sort()).toEqual(put.mock.calls.map(([, key]) => key).sort());
      } else {
        expect(remove).not.toHaveBeenCalled();
      }
    });

    test.each([shared, personal])("a failed required send to %s retains storage for retry without pinning", async endpoint => {
      const { graffiti, send, pin, put, remove } = setup();
      const failure = new Error("Send failed");
      send.mockImplementation(async target => {
        if (target === endpoint) throw failure;
        return target;
      });
      await expect(graffiti.post({ value: {}, channels: [] }, { actor })).rejects.toBe(failure);
      expect(pin).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    test("recipient delivery remains best effort and never uses the author's pin credentials", async () => {
      const { graffiti, send, pin } = setup();
      const recipient = "did:web:recipient.test";
      const inbox = "https://recipient.test/inbox";
      vi.spyOn(graffiti.services.dids, "resolve").mockResolvedValue({
        id: recipient, service: [{ id: "#graffitiPersonalInbox", type: "GraffitiInbox", serviceEndpoint: inbox }],
      });
      send.mockImplementation(async endpoint => {
        if (endpoint === inbox) throw new Error("Recipient offline");
        return endpoint;
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(graffiti.post({ value: {}, channels: [], allowed: [recipient] }, { actor })).resolves.toMatchObject({ actor });
      expect(send).toHaveBeenCalledWith(inbox, expect.any(Object));
      expect(pin.mock.calls).toEqual([[personal, [personal], "token"]]);
    });
  });
}

export function publicationPinIntegrationTests(
  environment: DecentralizedTestEnvironment,
  useGraffiti: () => GraffitiDecentralized,
  sessions: () => GraffitiSession[],
) {
  describe("Publication pin policy", () => {
    test.each([false, true])("only sponsors the author's inboxes (private: %s)", async privateObject => {
      const [author, recipient] = sessions();
      const writer = useGraffiti();
      const object = await writer.post({
        value: {}, channels: [crypto.randomUUID()],
        ...(privateObject ? { allowed: [recipient.actor] } : {}),
      }, author);
      const pins = await (await environment.database()).prepare(`
        SELECT i.account_id AS owner, p.account_id AS sponsor
        FROM inbox_message_pins p JOIN inbox_messages m ON m.message_seq = p.message_seq
        JOIN inboxes i ON i.inbox_seq = m.inbox_seq
        WHERE json_extract(m.object, '$.url') = ? ORDER BY owner
      `).bind(object.url).all<{ owner: number; sponsor: number }>();
      const sponsor = decentralizedTestUsers[0].accountId;
      expect(pins.results).toEqual([
        ...(!privateObject ? [{ owner: 0, sponsor }] : []),
        { owner: sponsor, sponsor },
      ]);
      // Existing reads/deletion still use the current announcement format.
      expect((await writer.get(object.url, {}, { session: author })).url).toBe(object.url);
      await writer.delete(object, author);
    });
  });
}
