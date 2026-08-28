import { normalizeObject, objectMatch } from "../permissions.js";

export async function objectRequest(
  graffiti: any,
  method: string,
  args: any[],
) {
  return prepareObjectRequest(
    method === "post"
      ? args[0]
      : await graffiti.get(args[0], {}, args.at(-1)),
  );
}

/** Prepare an object already returned by Graffiti without fetching it again. */
export function prepareObjectRequest(value: any) {
  const object = normalizeObject(value);
  return {
    subject: { kind: "object", object },
    createMatch: () => objectMatch(object),
  };
}
