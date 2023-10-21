import Ajv2020 from "ajv/dist/2020"
import { sha256Hex } from "../src/util"

const ajv = new Ajv2020()
export const fileReferenceValidate = ajv.compile({
  type: "object",
  properties: {
    type: { const: "FileReference" },
    name: { type: "string" },
    lastModified: { type: "integer" },
    mime: { type: "string" },
    size: { type: "integer" },
    hash: { type: "string" }
  },
  required: ["type", "name", "lastModified", "mime", "size", "hash"]
})
const fileValidate = ajv.compile({
  type: "object",
  properties: {
    type: { const: "File" },
    name: { type: "string" },
    lastModified: { type: "integer" },
    dataURL: { type: "string" }
  },
  required: ["type", "name", "lastModified", "dataURL"]
})

export async function fileLink(file) {
  // Get the data as a URL
  const reader = new FileReader()
  reader.readAsDataURL(file)
  const dataURL = await new Promise(resolve=> {
    reader.onload = e=> resolve(e.target.result)
  })

  // Create a content-addressed hash
  const source = {
    type: 'FileReference',
    name: file.name,
    lastModified: file.lastModified,
    mime: file.type,
    size: file.size,
    hash: await sha256Hex(dataURL)
  }

  const target = {
    type: 'File',
    name: file.name,
    lastModified: file.lastModified,
    dataURL
  }

  return [ source, target ]
}

export function fileLinkCallback(fileReference, callback) {
  // Check that the link is the proper file type
  if (!fileReferenceValidate(fileReference)) {
    throw fileReferenceValidate.errors
  }

  return async function(link) {
    if (!fileValidate(link.target)) {
      throw fileValidate.errors
    }
    const fileObject = link.target 

    if (fileObject.name != fileReference.name) {
      throw "Name mismatch with file reference"
    }
    if (fileObject.lastModified != fileReference.lastModified) {
      throw "Last modified mismatch with file reference"
    }

    // Validate the hash
    if (await sha256Hex(fileObject.dataURL) != fileReference.hash) {
      throw "Hash mismatch with content addressed file reference"
    }

    const response = await fetch(fileObject.dataURL)
    const blob = await response.blob()

    // Validate size and type
    if (blob.size != fileReference.size) {
      throw "Size mismatch with file reference"
    }
    if (blob.type != fileReference.mime) {
      throw "Mimetype mismatch with file reference"
    }

    const file = new File([blob], fileReference.name, {
      type: blob.type,
      lastModified: fileObject.lastModified
    })
    callback(file)
  }
}