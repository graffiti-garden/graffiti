import {
  GraffitiErrorNotAcceptable,
  GraffitiErrorTooLarge,
  isMediaAcceptable,
  type Graffiti,
  type JSONSchema,
} from "@graffiti-garden/api";
import {
  decodeObjectUrl,
  encodeObjectUrl,
  decodeMediaUrl,
  encodeMediaUrl,
  blobToBase64,
  base64ToBlob,
} from "./utilities";

const MEDIA_OBJECT_SCHEMA = {
  properties: {
    value: {
      properties: {
        dataBase64: { type: "string" },
        type: { type: "string" },
        size: { type: "number" },
      },
      required: ["dataBase64", "type", "size"],
    },
  },
} as const satisfies JSONSchema;

export class GraffitiLocalMedia {
  protected db: Pick<Graffiti, "post" | "get" | "delete">;

  constructor(db: Pick<Graffiti, "post" | "get" | "delete">) {
    this.db = db;
  }

  postMedia: Graffiti["postMedia"] = async (...args) => {
    const [media, session] = args;

    const dataBase64 = await blobToBase64(media.data);
    const type = media.data.type;

    const { url } = await this.db.post<typeof MEDIA_OBJECT_SCHEMA>(
      {
        value: {
          dataBase64,
          type,
          size: media.data.size,
        },
        channels: [],
        allowed: media.allowed,
      },
      session,
    );

    const { actor, id } = decodeObjectUrl(url);
    return encodeMediaUrl(actor, id);
  };

  getMedia: Graffiti["getMedia"] = async (...args) => {
    const [mediaUrl, accept, session] = args;
    const { actor, id } = decodeMediaUrl(mediaUrl);
    const objectUrl = encodeObjectUrl(actor, id);

    const object = await this.db.get<typeof MEDIA_OBJECT_SCHEMA>(
      objectUrl,
      MEDIA_OBJECT_SCHEMA,
      session,
    );

    const { dataBase64, type, size } = object.value;

    if (accept?.maxBytes && size > accept.maxBytes) {
      throw new GraffitiErrorTooLarge("File size exceeds limit");
    }

    // Make sure it adheres to requirements.accept
    if (accept?.types) {
      if (!isMediaAcceptable(type, accept.types)) {
        throw new GraffitiErrorNotAcceptable(
          `Unacceptable media type, ${type}`,
        );
      }
    }

    const data = await base64ToBlob(dataBase64);
    if (data.size !== size || data.type !== type) {
      throw new Error("Invalid data");
    }

    return {
      data,
      actor: object.actor,
      allowed: object.allowed,
    };
  };

  deleteMedia: Graffiti["deleteMedia"] = async (...args) => {
    const [mediaUrl, session] = args;
    const { actor, id } = decodeMediaUrl(mediaUrl);
    const objectUrl = encodeObjectUrl(actor, id);

    await this.db.delete(objectUrl, session);
  };
}
