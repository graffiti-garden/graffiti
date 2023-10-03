import Ajv2020 from "ajv/dist/2020"
import { sha256Hex } from "./util"

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
          "^[A-Za-z0-9_-]{1,300}$":
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
    },
    oneOf: [{
      properties: {
        addSignature: { type: "string"},
        target: {}
      },
      required: ["addSignature", "target"]
    }, {
      properties: {
        deleteSignature: { type: "string" },
      },
      required: ["deleteSignature"]
    }]
  }]
})

export const addSignaturePayloadValidate = ajv.compile({
  type: "object",
  properties: {
    source: { type: "string" },
    targetHash: { type: "string" },
    salt: { type: "string" }
  },
  required: ['source', 'targetHash', 'salt'],
  additionalProperties: false
})

export default async function routeMessage(message, onHave, onWant, onGive, actorClient) {
  if (!messageSchemaValidate(message)) {
    throw messageSchemaValidate.errors
  }

  if (message.intent == 'have') {
    onHave(message.links)
  } else if (message.intent == 'want') {
    onWant(message.links)
  } else if (message.intent == 'give') {

    let deleting, addSignature, target, deleteActor
    if ('target' in message) {
      deleting = false
      target = message.target
      addSignature = message.addSignature
    } else {
      deleting = true
      const { payload, actor } = await actorClient.verify(message.deleteSignature)
      addSignature = payload
      deleteActor = actor
    }

    const { payload, actor } = await actorClient.verify(addSignature)

    if (!addSignaturePayloadValidate(payload)) {
      throw addSignaturePayloadValidate.errors
    }

    const { source, targetHash, salt } = payload

    if (!deleting) {
      if (targetHash != await sha256Hex(JSON.stringify(target))) {
        throw "Signed hash of target does not match the hash of target"
      }
    } else {
      if (deleteActor != actor) {
        throw "Actor that deletes must match actor that created"
      }
    }

    onGive({
      source,
      target,
      targetHash,
      salt,
      actor,
      deleting,
      message
    })
  }
}