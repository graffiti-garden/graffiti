import { assert, describe, expect, test } from "vitest";

import {
  encodeObjectUrl,
  decodeObjectUrl,
  ObjectEncoding,
} from "./2-object-encoding.js";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  STRING_ENCODER_METHOD_BASE64URL,
  StringEncoder,
} from "../2-primitives/0-string-encoding.js";
import {
  ALLOWED_ATTESTATION_METHOD_HMAC_SHA256,
  AllowedAttestations,
} from "../2-primitives/3-allowed-attestations.js";
import { ChannelAttestations } from "../2-primitives/2-channel-attestations.js";
import { ContentAddresses } from "../2-primitives/1-content-addresses.js";
import { encode, decode } from "@ipld/dag-cbor";

describe("object Urls", () => {
  for (const actor of [
    "did:plc:alsdkjfkdjf",
    "did:web:example.com/someone",
    "did:example:123456789abcdefghi👻",
  ]) {
    test(`encodeObjectUrl encodes and decodes correctly with actor: ${actor}`, async () => {
      const contentAddressBytes = randomBytes();
      const contentAddress = await new StringEncoder().encode(
        STRING_ENCODER_METHOD_BASE64URL,
        contentAddressBytes,
      );

      const url = encodeObjectUrl(actor, contentAddress);
      const decoded = decodeObjectUrl(url);
      expect(decoded.actor).toBe(actor);
      expect(decoded.contentAddress).toBe(contentAddress);
    });
  }

  for (const invalidUrl of [
    "http://example.com/not-an-object-url",
    "graffiti:",
    "graffiti:",
    "graffiti:no-content-address",
    "graffiti:too:many:parts",
  ]) {
    test(`Invalid Graffiti URL: ${invalidUrl}`, () => {
      expect(() => decodeObjectUrl(invalidUrl)).toThrow();
    });
  }
});

describe("object encoding and validation", async () => {
  const objectEncoding = new ObjectEncoding({
    stringEncoder: new StringEncoder(),
    allowedAttestations: new AllowedAttestations(),
    channelAttestations: new ChannelAttestations(),
    contentAddresses: new ContentAddresses(),
  });

  const value = {
    message: "Hello world!",
    nested: {
      foo: {
        bar: 42,
      },
    },
    array: [1, "something 👻", { key: "value" }],
  };
  const channels = ["channel1👻", "channel2"];
  const allowed = ["did:web:noone.example.com", "did:web:someone.else.com"];
  const actor = "did:web:someone.example.com";

  const { allowedTickets, channelPublicIds, objectBytes, objectUrl } =
    await objectEncoding.encode(
      {
        value,
        channels,
        allowed,
      },
      actor,
    );
  assert(Array.isArray(allowedTickets));

  test("validate private", async () => {
    await objectEncoding.validate(
      value,
      objectUrl,
      objectBytes,
      channelPublicIds,
      {
        recipients: allowed,
        allowedTickets,
      },
    );

    for (const [index, recipient] of allowed.entries()) {
      await objectEncoding.validate(
        value,
        objectUrl,
        objectBytes,
        channelPublicIds,
        {
          recipient: recipient,
          allowedTicket: allowedTickets[index],
          allowedIndex: index,
        },
      );
    }
  });

  test("incorrect value", async () => {
    await expect(
      objectEncoding.validate(
        { ...value, extra: "field" },
        objectUrl,
        objectBytes,
        channelPublicIds,
        {
          recipients: allowed,
          allowedTickets,
        },
      ),
    ).rejects.toThrow();
  });

  test("incorrect content address", async () => {
    const url = encodeObjectUrl(
      actor,
      await new StringEncoder().encode(
        STRING_ENCODER_METHOD_BASE64URL,
        randomBytes(),
      ),
    );

    await expect(
      objectEncoding.validate(value, url, objectBytes, channelPublicIds, {
        recipients: allowed,
        allowedTickets,
      }),
    ).rejects.toThrow();
  });

  test("incorrect bytes", async () => {
    const wrongObjectBytes = randomBytes();
    const correctContentAddress = decodeObjectUrl(objectUrl).contentAddress;
    const correctContentAddressBytes = await new StringEncoder().decode(
      correctContentAddress,
    );
    const contentAddresses = new ContentAddresses();
    const contentAddressMethod = await contentAddresses.getMethod(
      correctContentAddressBytes,
    );
    const wrongContentAddressBytes = await contentAddresses.register(
      contentAddressMethod,
      wrongObjectBytes,
    );
    const wrongContentAddress = await new StringEncoder().encode(
      STRING_ENCODER_METHOD_BASE64URL,
      wrongContentAddressBytes,
    );
    const wrongObjectUrl = encodeObjectUrl(actor, wrongContentAddress);

    await expect(
      objectEncoding.validate(
        value,
        wrongObjectUrl,
        wrongObjectBytes,
        channelPublicIds,
        {
          recipients: allowed,
          allowedTickets,
        },
      ),
    ).rejects.toThrow();
  });

  test("incorrect format", async () => {
    const wrongData = {
      not: "the expected format",
    };
    const wrongObjectBytes = encode(wrongData);
    const correctContentAddress = decodeObjectUrl(objectUrl).contentAddress;
    const correctContentAddressBytes = await new StringEncoder().decode(
      correctContentAddress,
    );
    const contentAddresses = new ContentAddresses();
    const contentAddressMethod = await contentAddresses.getMethod(
      correctContentAddressBytes,
    );
    const wrongContentAddressBytes = await contentAddresses.register(
      contentAddressMethod,
      wrongObjectBytes,
    );
    const wrongContentAddress = await new StringEncoder().encode(
      STRING_ENCODER_METHOD_BASE64URL,
      wrongContentAddressBytes,
    );
    const wrongObjectUrl = encodeObjectUrl(actor, wrongContentAddress);
    await expect(
      objectEncoding.validate(
        value,
        wrongObjectUrl,
        wrongObjectBytes,
        channelPublicIds,
        {
          recipients: allowed,
          allowedTickets,
        },
      ),
    ).rejects.toThrow();
  });

  test("missing allowed tickets", async () => {
    await expect(
      objectEncoding.validate(value, objectUrl, objectBytes, channelPublicIds),
    ).rejects.toThrow();
  });

  test("wrong allowed tickets", async () => {
    const wrongAllowedTickets = await Promise.all(
      allowedTickets.map(
        async (ticket) =>
          (
            await new AllowedAttestations().attest(
              ALLOWED_ATTESTATION_METHOD_HMAC_SHA256,
              "did:web:not-the-right.actor",
            )
          ).ticket,
      ),
    );

    await expect(
      objectEncoding.validate(value, objectUrl, objectBytes, channelPublicIds, {
        recipients: allowed,
        allowedTickets: wrongAllowedTickets,
      }),
    ).rejects.toThrow();
  });

  test("wrong recipients", async () => {
    const wrongRecipients = allowed.map((recipient) => recipient + "-wrong");

    await expect(
      objectEncoding.validate(value, objectUrl, objectBytes, channelPublicIds, {
        recipients: wrongRecipients,
        allowedTickets,
      }),
    ).rejects.toThrow();
  });
});
