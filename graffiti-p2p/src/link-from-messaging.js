import Ajv from "ajv"
import { sha256Hex } from "./util"

const ajv = new Ajv()
export const messageSchemaValidate = ajv.compile({
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["have", "want", "give"]
    },
    clocks: {
      type: "object",
      patternProperties: {
        // actor plus target hash
        "^[A-Za-z0-9_-]{1,300}$":
        // Clock
        { type: "integer" }
      },
      minProperties: 1,
      additionalProperties: false
    },
    signature: { type: "string" },
    target: {},
  },
  required: ['intent'],
  additionalProperties: false,
  if: {
    properties: {
      intent: { const: "give" },
    }
  },
  then: {
    required: ["signature"]
  },
  else: {
    required: ["clocks"]
  },
})

export const signaturePayloadValidate = ajv.compile({
  type: "object",
  properties: {
    source: { type: "string" },
    targetHash: { type: "string" },
    clock: { type: "integer" },
    isDelete: { type: "boolean" }
  },
  required: ['source', 'targetHash', 'clock', 'isDelete'],
  additionalProperties: false
})

export default async function routeMessage(message, onHave, onWant, onGive, actorClient) {
  if (!messageSchemaValidate(message)) {
    throw messageSchemaValidate.errors
  }

  if (message.intent == 'have') {
    onHave(message.clocks)
  } else if (message.intent == 'want') {
    onWant(message.clocks)
  } else if (message.intent == 'give') {
    const { signature } = message

    const { payload, actor } = await actorClient.verify(signature)

    if (!signaturePayloadValidate(payload)) {
      throw signaturePayloadValidate.errors
    }

    const { source, targetHash, clock, isDelete } = payload

    console.log("one")
    const target = message.target
    if (isDelete) {
      if (target != undefined) {
        throw "Target can't be included when object is deleted"
      }
    } else {
      if (target == undefined) {
        throw "Target must be included when object is not deleted"
      }
      if (targetHash != await sha256Hex(JSON.stringify(target))) {
        throw "Signed hash of target does not match the hash of target"
      }
    }
    console.log("two")

    onGive({
      source,
      target,
      targetHash,
      signature,
      actor,
      clock,
      isDelete
    })
  }
}