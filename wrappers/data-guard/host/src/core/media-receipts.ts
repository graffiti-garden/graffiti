import {
  GraffitiErrorNotFound,
  type Graffiti,
  type GraffitiMedia,
  type GraffitiPostMedia,
  type GraffitiSession,
} from "@graffiti-garden/api";
import { siteStamp, viaSite, type SiteProvenance } from "./provenance.js";
import type { Source } from "./source.js";

const RECEIPT_ADDENDUM = "graffiti.guard.receipt";
const RECEIPT_KIND = "media-receipt";

/** Graffiti URL addendums begin at the first literal ? or #. */
export function parseMediaReceiptUrl(url: string) {
  // Other URL schemes may use either character in their canonical URL.
  if (!url.startsWith("graffiti:")) {
    return { canonicalUrl: url, forwardUrl: url, receiptUrl: undefined };
  }
  const boundary = url.search(/[?#]/);
  const canonicalUrl = boundary === -1 ? url : url.slice(0, boundary);
  const layers = boundary === -1 ? [] : url.slice(boundary).match(/[?#][^?#]*/g) ?? [];
  let receiptUrl: string | undefined;
  const otherLayers: string[] = [];
  for (const layer of layers) {
    const segment = layer.slice(1);
    if (!segment.startsWith(RECEIPT_ADDENDUM + "=")) {
      if (segment === RECEIPT_ADDENDUM) {
        throw new TypeError("Invalid media receipt addendum.");
      }
      otherLayers.push(layer);
      continue;
    }
    if (receiptUrl !== undefined) {
      throw new TypeError("Duplicate media receipt addendum.");
    }
    const encoded = segment.slice(RECEIPT_ADDENDUM.length + 1);
    if (!encoded) throw new TypeError("Empty media receipt addendum.");
    receiptUrl = decodeURIComponent(encoded);
  }
  return {
    canonicalUrl,
    // Remove only our layer; another wrapper may need its own addendum.
    forwardUrl: canonicalUrl + otherLayers.join(""),
    receiptUrl,
  };
}

/** Append our layer without interpreting addendums belonging to other wrappers. */
export function appendMediaReceiptUrl(url: string, receiptUrl: string) {
  if (!receiptUrl) throw new TypeError("Empty media receipt URL.");
  if (!url.startsWith("graffiti:")) {
    throw new TypeError("Cannot add a receipt to an unknown URL scheme.");
  }
  if (parseMediaReceiptUrl(url).receiptUrl !== undefined) {
    throw new TypeError("Duplicate media receipt addendum.");
  }
  return `${url}?${RECEIPT_ADDENDUM}=${encodeURIComponent(receiptUrl)}`;
}

/** This marker belongs to the guard and is never writable through ordinary app posts. */
export function isMediaReceiptObject(object: unknown): boolean {
  if (!isRecord(object) || !isRecord(object.value)) return false;
  const guard = object.value._guard;
  return isRecord(guard) && guard.kind === RECEIPT_KIND;
}

/**
 * Called only after the underlying media upload succeeds. A receipt is required
 * before its URL can be returned to the app. On failure, remove the upload if
 * possible so a retry does not leave a second file behind.
 */
export async function postMediaReceipt(
  graffiti: Graffiti,
  mediaUrl: string,
  media: GraffitiPostMedia,
  source: Source,
  session: GraffitiSession,
): Promise<string> {
  try {
    if (!mediaUrl.startsWith("graffiti:")) {
      throw new TypeError("Cannot decorate a media URL with an unknown scheme.");
    }
    const { canonicalUrl } = parseMediaReceiptUrl(mediaUrl);
    const receipt = await graffiti.post(
      {
        value: {
          mediaUrl: canonicalUrl,
          "via site": siteStamp(source),
          _guard: { kind: RECEIPT_KIND },
        },
        channels: [],
        ...(media.allowed !== undefined ? { allowed: media.allowed } : {}),
      },
      session,
    );
    if (receipt.actor !== session.actor) {
      throw new TypeError("Media receipt actor differs from the upload actor.");
    }
    return appendMediaReceiptUrl(mediaUrl, receipt.url);
  } catch (error) {
    try {
      await graffiti.deleteMedia(mediaUrl, session);
    } catch (cleanupError) {
      console.error("Failed to remove media after its provenance receipt failed.", cleanupError);
    }
    throw new Error("Media upload failed because its provenance receipt could not be saved.", {
      cause: error,
    });
  }
}

/**
 * A receipt proves source, not authority to read or delete. The caller must
 * authorize the media operation separately; the underlying implementation
 * receives the URL with its other wrappers' addendums still attached. Only
 * fetch the linked receipt; missing provenance never triggers discovery.
 */
export async function resolveMediaReceipt(
  graffiti: Graffiti,
  decoratedUrl: string,
  media: Pick<GraffitiMedia, "actor" | "allowed">,
  session?: GraffitiSession | null,
): Promise<SiteProvenance | undefined> {
  const { canonicalUrl, receiptUrl } = parseMediaReceiptUrl(decoratedUrl);
  if (!receiptUrl) return undefined;
  try {
    const receipt = await graffiti.get(receiptUrl, {}, session);
    if (!isMediaReceiptObject(receipt) ||
        receipt.value.mediaUrl !== canonicalUrl ||
        receipt.actor !== media.actor ||
        !sameVisibility(receipt.allowed, media.allowed)) return undefined;
    return viaSite(receipt);
  } catch (error) {
    if (error instanceof GraffitiErrorNotFound) return undefined;
    throw error;
  }
}

function sameVisibility(
  left?: string[] | null,
  right?: string[] | null,
) {
  if (left == null || right == null) return left == null && right == null;
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((actor, index) => actor === sortedRight[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
