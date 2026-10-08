import { z } from "zod";

const AlsoKnownAsSchema = z.array(z.url());
const ServicesSchema = z.record(
  z.string(),
  z.object({
    type: z.string(),
    endpoint: z.url(),
  }),
);
export const OptionalAlsoKnownAsSchema = z.optional(AlsoKnownAsSchema);
export const OptionalServicesSchema = z.optional(ServicesSchema);
function servicesToDidService(services: z.infer<typeof ServicesSchema>) {
  return Object.entries(services).map(([id, service]) => ({
    id: `#${id}`,
    type: service.type,
    endpoint: service.endpoint,
  }));
}

export type OptionalAlsoKnownAs = z.infer<typeof OptionalAlsoKnownAsSchema>;
export type OptionalServices = z.infer<typeof OptionalServicesSchema>;

export function localNameToDocumentUrl(localName: string, baseHost: string) {
  if (baseHost.startsWith("localhost:")) {
    return `https://${baseHost}/app/handles/handle/${localName}/did.json`;
  } else {
    return `https://${localName}.${baseHost}/.well-known/did.json`;
  }
}
export function localNameToHandle(localName: string, baseHost: string) {
  if (baseHost.startsWith("localhost:")) {
    return `${encodeURIComponent(baseHost)}:app:handles:handle:${localName}`;
  } else {
    return `${localName}.${baseHost}`;
  }
}
export function localNameToDid(localName: string, baseHost: string) {
  return `did:web:${localNameToHandle(localName, baseHost)}`;
}
export function identifierToDid(identifier: string, baseHost: string) {
  return identifier.startsWith("did:web:")
    ? identifier
    : localNameToDid(identifier, baseHost);
}
export function identifierToHandle(identifier: string, baseHost: string) {
  return identifier.startsWith("did:web:")
    ? didToHandle(identifier)
    : localNameToHandle(identifier, baseHost);
}
export function identifierToDocumentUrl(identifier: string, baseHost: string) {
  return identifier.startsWith("did:web:")
    ? didWebToUrl(identifier)
    : localNameToDocumentUrl(identifier, baseHost);
}
export function didToHandle(did: string) {
  const match = did.match(/^did:web:(.+)$/);
  if (!match) {
    throw new Error(`Invalid DID format: ${did}`);
  }
  return match[1];
}
export function didWebToUrl(did: string) {
  const [domain, ...path] = didToHandle(did).split(":");
  const host = domain.match(/^([a-z0-9.-]+)(?:%3A([0-9]+))?$/i);
  const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  const validPath = /^(?:[a-zA-Z0-9._~-]|%[0-9a-fA-F]{2})+$/;
  if (
    !host ||
    !validDomain.test(host[1]) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host[1]) ||
    path.some(
      (part) => !validPath.test(part) || [".", ".."].includes(decodeURIComponent(part)),
    )
  ) {
    throw new Error(`Invalid DID:web value: ${did}`);
  }
  const url = new URL(`https://${host[1]}${host[2] ? `:${host[2]}` : ""}`);
  url.pathname = `/${path.length ? path.join("/") : ".well-known"}/did.json`;
  return url.toString();
}
export function constructDidDocument(args: {
  did: string;
  services: z.infer<typeof OptionalServicesSchema>;
  alsoKnownAs: z.infer<typeof OptionalAlsoKnownAsSchema>;
}) {
  const { did, services, alsoKnownAs } = args;
  return {
    "@context": "https://www.w3.org/ns/did/v1",
    id: did,
    ...(alsoKnownAs ? { alsoKnownAs } : {}),
    ...(services
      ? {
          service: servicesToDidService(services),
        }
      : {}),
  };
}
