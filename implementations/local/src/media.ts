import {
  GraffitiErrorNotAcceptable,
  GraffitiErrorTooLarge,
  isMediaAcceptable,
  type Graffiti,
  type JSONSchema,
} from "@graffiti-garden/api";
import { blobToBase64, base64ToBlob } from "./utilities";

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

    return url;
  };

  getMedia: Graffiti["getMedia"] = async (...args) => {
    const [mediaUrl, accept, session] = args;

    const object = await this.db.get<typeof MEDIA_OBJECT_SCHEMA>(
      mediaUrl,
      MEDIA_OBJECT_SCHEMA,
      session,
    );

    const { dataBase64, type, size } = object.value;

    if (accept?.maxBytes !== undefined && size > accept.maxBytes) {
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

    // Use the separately stored type, not the data URL's MIME header: fetching
    // that header normalizes parameters, and quoted commas look like delimiters.
    // Base64 contains no commas, so the last comma always starts our payload.
    const payload = dataBase64.slice(dataBase64.lastIndexOf(",") + 1);
    const data = await base64ToBlob(`data:;base64,${payload}`);
    if (data.size !== size) {
      throw new Error("Invalid data");
    }

    return {
      // Preserve the exact MIME type and parameters saved at upload.
      data: data.slice(0, data.size, type),
      actor: object.actor,
      allowed: object.allowed,
    };
  };

  deleteMedia: Graffiti["deleteMedia"] = async (...args) => {
    const [mediaUrl, session] = args;

    await this.db.delete(mediaUrl, session);
  };
}
