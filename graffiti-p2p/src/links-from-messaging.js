import Ajv2020 from "ajv/dist/2020"
import { sha256Hex } from "./util"
import stringify from 'fast-json-stable-stringify'
import { verify } from "./actor-client-wrapper"

const ajv = new Ajv2020()
export const messageSchemaValidate = ajv.compile({
  type: "object",
  unevaluatedProperties: false,
  required: ["intent"],
  oneOf: [{
    properties: {
      intent: { enum: ["have", "want"] },
      links: {
        type: "object",
        patternProperties: {
          // actor + targetHash + salt
          ".*":
          // is not deleted?
          { type: "boolean" }
        },
        minProperties: 1,
        additionalProperties: false
      },
    },
    required: ["links"]
  }, {
    properties: {
      intent: { const: "give" },
      signature: { type: "string" },
      source: {},
      target: {}
    },
    required: ["intent", "signature", "source"]
  }]
})

export const signaturePayloadValidate = ajv.compile({
  type: "object",
  properties: {
    sourceHash: {
      type: "string",
      minLength: 64,
      maxLength: 64
    },
    targetHash: {
      type: "string",
      minLength: 64,
      maxLength: 64
    },
    salt: {
      type: "string",
      maxLength: 36
    },
    deleted: { type: "boolean" }
  },
  required: ['sourceHash', 'targetHash', 'salt', 'deleted'],
  additionalProperties: false
})

export default async function routeMessage(message, onHave, onWant, onGive, actorClient) {
  if (!messageSchemaValidate(message)) {
    throw messageSchemaValidate.errors
  }

  if (message.intent == 'have') {
    await onHave(message.links)
  } else if (message.intent == 'want') {
    await onWant(message.links)
  } else if (message.intent == 'give') {
    const { signature, source, target } = message

    const { payload, actor } = await verify(actorClient, signature)

    if (!signaturePayloadValidate(payload)) {
      throw signaturePayloadValidate.errors
    }

    const { sourceHash, targetHash, salt, deleted } = payload

    if (sourceHash != await sha256Hex(stringify(source))) {
      throw "Signed hash of source does not match hash of source"
    }

    if (deleted) {
      if (target != undefined) {
        throw "Cannot include target in a deletion"
      }
    } else {
      if (targetHash != await sha256Hex(stringify(target))) {
        throw "Signed hash of target does not match the hash of target"
      }
    }

    await onGive({
      source,
      target,
      sourceHash,
      targetHash,
      salt,
      actor,
      deleted,
      signature
    })
  }
}