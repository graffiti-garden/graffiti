export function joinSchema(object: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Join"] },
          object: { type: "string", enum: [object] },
          actor: { type: "string" },
        },
        required: ["type", "object"],
      },
    },
  } as const;
}

export function followSchema(webId: string, object?: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Follow"] },
          object: {
            type: "string",
            ...(object ? { enum: [object] } : {}),
          },
          actor: { type: "string", enum: [webId] },
        },
        required: ["type", "object"],
      },
      webId: { type: "string", enum: [webId] },
    },
  } as const;
}

export function profileSchema(webId: string) {
  return {
    properties: {
      value: {
        properties: {
          type: { enum: ["Profile"] },
          name: { type: "string" },
          describes: { type: "string", enum: [webId] },
        },
        required: ["type", "name"],
      },
    },
  } as const;
}

export function noteSchema(inReplyTo?: string) {
  return {
    properties: {
      value: {
        properties: {
          content: { type: "string" },
          createdAt: { type: "string" },
          at: {
            type: "array",
            items: { type: "string" },
          },
          inReplyTo: {
            type: "string",
            ...(inReplyTo ? { enum: [inReplyTo] } : {}),
          },
        },
        required: ["content", "createdAt"],
      },
    },
  } as const;
}
