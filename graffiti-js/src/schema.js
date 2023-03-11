export default {
  type: 'object',
  properties: {
    //id: { $ref: "#/definitions/objectURI" },
    //actor: { $ref: "#/definitions/actorURI" },
    //published: { $ref: "#/definitions/ISODate" },
    //updated: { $ref: "#/definitions/ISODate" },
    bto: { $ref: "#/definitions/actorArray" },
    bcc: { $ref: "#/definitions/actorArray" },
    type: { type: 'string' },
    content: { type: 'string' },
    name: { type: 'string' },
    summary: { type: 'string' },
    mediaType: { type: 'string' },
  },
  definitions: {
    actorArray: {
      type: "array",
      items: {
        type: "string"
      }
    }
  }
}

// TODO
// do the rest of the AP spec
//actor: { type: 'link' },
//attachment: { ref: 'links' },
//attributedTo: { ref: 'links' },
//cc: { ref: 'links' },
//image: { ref: 'links' },
//inReplyTo: { ref: 'links' },
//tag: { type: 'stringarray' },
//target: { type: 'links' },
//to: { ref: 'links' },
//url: { ref: 'links' },
//published: { type: 'date' },
//updated: { type: 'date' },
//subject: { type: 'links' },
//relationship: { type: 'string' },
//describes: { type: 'links' },
//order: { type: 'logoot' }
