import type { GraffitiMedia } from "@graffiti-garden/api";
import { format, parse } from "content-type";
import { siteStamp, viaSite } from "./provenance.js";
import type { Source } from "./source.js";

const parameter = "graffiti-guard";

/** Stamp the MIME type, leaving file bytes and size untouched. */
export function stampMedia(data: Blob, source: Source): Blob {
  const type = parse(data.type || "application/octet-stream");
  // Blob lowercases its entire type, including parameter values. UTF-8 encoded
  // as lowercase hex preserves case and Unicode in site IDs, names and URLs.
  const bytes = new TextEncoder().encode(JSON.stringify({ "via site": siteStamp(source) }));
  type.parameters[parameter] = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  // Formatting replaces any app-supplied stamp, preserving other parameters.
  // MIME matching ignores parameters, so image/* and exact types still work.
  return data.slice(0, data.size, format(type));
}

/** Read provenance from stored media, then hide our parameter from app/UI Blobs. */
export function readMedia(media: GraffitiMedia) {
  const type = parse(media.data.type);
  const encoded = type.parameters[parameter];
  if (encoded === undefined) return { media, from: undefined };

  // Invalid metadata must fail rather than gaining the permissions of
  // unstamped files. Provenance comes only from the stored MIME parameter.
  if (!/^(?:[0-9a-f]{2})+$/.test(encoded)) throw new TypeError("Invalid media provenance.");
  const bytes = Uint8Array.from(encoded.match(/../g)!, pair => Number.parseInt(pair, 16));
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const from = viaSite({ value });
  if (!from) throw new TypeError("Invalid media provenance.");

  delete type.parameters[parameter];
  return {
    from,
    media: { ...media, data: media.data.slice(0, media.data.size, format(type)) },
  };
}
