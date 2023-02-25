export function processLocalSchema(schema) {
  // Always include time stamps
  for (const property of ['published', 'updated']) {
    if (propertyDNE(property, schema)) {
      schema.required.push(property)
    }
  }

  // There *isn't* an attribution
  // (so we can assume all objects are made by their creator)
  // and the objects are *not* private
  // (to avoid publicly commenting on something private)
  for (const property of ['attributedTo', 'bto', 'bcc']) {
    if (propertyDNE(property, schema)) {
      schema.properties[property] = false
    }
  }
}

export function processUpdate(object) {
  // Always add time stamps
  object.updated = new Date().toISOString()
  if (!('published' in object)) {
    object.published = object.updated
  }
}

function propertyDNE(property, schema) {
  return !(property in schema.properties) &&
         !schema.required.includes(property)
}

export const globalSchema = {
  type: 'object',
  required: ['id', 'tag', 'actor', 'type'],
  properties: {
    type: { type: 'string' },
    content: { type: 'string' },
    name: { type: 'string' },
    summary: { type: 'string' },
  }
}
// TODO
// do the rest of the AP spec
//actor: { type: 'link' },
//attachment: { ref: 'links' },
//attributedTo: { ref: 'links' },
//bcc: { ref: 'links' },
//bto: { ref: 'links' },
//cc: { ref: 'links' },
//image: { ref: 'links' },
//inReplyTo: { ref: 'links' },
//tag: { type: 'stringarray' },
//target: { type: 'links' },
//to: { ref: 'links' },
//url: { ref: 'links' },
//mediaType: { type: 'string' },
//published: { type: 'date' },
//updated: { type: 'date' },
//subject: { type: 'links' },
//relationship: { type: 'string' },
//describes: { type: 'links' },
//order: { type: 'logoot' }
