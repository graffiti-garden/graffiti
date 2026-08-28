import { mediaMatch } from "../permissions.js";

export async function mediaRequest(
  graffiti: any,
  method: string,
  args: any[],
) {
  const url = method === "postMedia" ? undefined : args[0];
  const media =
    method === "postMedia"
      ? args[0]
      : await graffiti.getMedia(url, method === "getMedia" ? args[1] : {}, args.at(-1));
  const subject = {
    kind: "media",
    ...(url ? { url } : {}),
    type: media.data?.type || "application/octet-stream",
    size: media.data?.size ?? 0,
    ...(typeof media.data?.name === "string" ? { name: media.data.name } : {}),
    ...(typeof media.actor === "string" ? { actor: media.actor } : {}),
    ...(media.allowed !== undefined ? { allowed: media.allowed } : {}),
  };
  return {
    subject,
    preview: { media },
    createMatch: () => mediaMatch(subject),
  };
}
