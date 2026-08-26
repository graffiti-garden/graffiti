import { normalizeObject, objectMatch } from "../permissions.js";

export async function objectRequest(
  graffiti: any,
  method: string,
  args: any[],
) {
  const object =
    method === "post"
      ? normalizeObject(args[0])
      : normalizeObject(await graffiti.get(args[0], {}, args.at(-1)));
  return {
    subject: { kind: "object", object },
    createMatch: (answer: any) => objectMatch(object, answer),
  };
}
