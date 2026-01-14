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

export function handleNameToHandle(handleName: string, baseHost: string) {
  if (baseHost.startsWith("localhost:")) {
    return `${baseHost}/app/handles/handle/${handleName}`;
  } else {
    return `${handleName}.${baseHost}`;
  }
}
export function handleNameToDid(handleName: string, baseHost: string) {
  return `did:web:${handleNameToHandle(handleName, baseHost)}`;
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
