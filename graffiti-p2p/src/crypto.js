import * as jose from 'jose'
import Ajv from "ajv"
import { encoder, decoder, sha256Uint8, sha256Hex } from './util'

const ajv = new Ajv()
const valueSchemaValidate = ajv.compile({
  type: "object",
  properties: {
    context: {
      type: "array",
      items: { type: "string" }
    },
    actor: false,
    path: false,
    id: false
  },
})
const unsignedSchemaValidate = ajv.compile({
  type: "object",
  properties: {
    updated: { type: "number" },
    pathHash: { type: "string" },
    encryptedValue: { type: "string" },
    encryptedContexts: {
      type: "object",
      patternProperties: {
        ".*": { type: "string" }
      }
    }
  },
  required: ["updated", "pathHash", "encryptedValue", "encryptedContexts"],
  additionalProperties: false,
})

export async function encrypt(value, password) {
  return new jose.CompactEncrypt(encoder.encode(value))
      .setProtectedHeader({
        alg: 'dir',
        enc: 'A128CBC-HS256',
      }).encrypt(await sha256Uint8('key:'+password))
}

export async function decrypt(encrypted, password) {
  const { plaintext } =
    await jose.compactDecrypt(encrypted, await sha256Uint8('key:'+password))
  return decoder.decode(plaintext)
}

export async function sign(value, actor, path, actorClient) {
  if (!valueSchemaValidate(value)) {
    throw valueSchemaValidate.errors
  }

  const unsigned = {
    updated: Date.now(),
    pathHash: await sha256Hex(path),
    // Encrypt the list of contexts and the value by the context
    encryptedValue: await encrypt(JSON.stringify(value), path),
    encryptedContexts:
      Object.assign({},
        ...await Promise.all(
          (value.context ?? []).map(async context=> ({
            [await sha256Hex(context)]: await encrypt(path, context)
          }))
        )
      )
  }

  const signed = await actorClient.sign(unsigned, actor)

  return { signed, updated: unsigned.updated, pathHash: unsigned.pathHash }
}

export async function verify(signed, actorClient, { path, contextPath, signedHash }) {
  if (signedHash && await sha256Hex(signed) != signedHash) {
    throw 'signed message does not match hash'
  }

  // Verify the JWT and the signature
  const { payload: unsigned, actor } = await actorClient.verify(signed)

  if (!unsignedSchemaValidate(unsigned)) {
    throw unsignedSchemaValidate.errors
  }

  if (contextPath) {
    const hashContextPath = await sha256Hex(contextPath)
    if (hashContextPath in unsigned.encryptedContexts) {
      path = await decrypt(unsigned.encryptedContexts[hashContextPath], contextPath)
    }
  }

  let value = null
  if (path) {
    if (unsigned.pathHash != await sha256Hex(path)) {
      throw `Signed path does not match given path, ${path}`
    }

    const decrypted = await decrypt(unsigned.encryptedValue, path)
    value = JSON.parse(decrypted)
    if (!valueSchemaValidate(value)) {
      throw valueSchemaValidate.errors
    }

    // Make sure all of the contexts have hash paths
    if (value.context) {
      value.context.forEach(async context=> {
        const hashedContext = await sha256Hex(context)
        if (!(hashedContext in unsigned.encryptedContexts)) {
          throw `context ${context} is not included among encrypted contexts`
        }

        const decryptedPath =
        await decrypt(unsigned.encryptedContexts[hashedContext], context)
        if (decryptedPath != path) {
          throw `decrypted path ${decryptedPath} does not equal path ${path}`
        }
      })
    }
  }

  return { updated: unsigned.updated, pathHash: unsigned.pathHash, signedHash, actor, path, value }
}