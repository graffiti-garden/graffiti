import type { GraffitiArgs } from "../graffiti.js";
import { discoverMatch, normalizeQuery } from "../permissions.js";

export function discoveryRequest(args: GraffitiArgs<"discover">) {
  const [channels, schema] = args;
  const subject = normalizeQuery(channels, schema);
  return {
    subject,
    createMatch: (answer: any) => discoverMatch(subject, answer),
  };
}
