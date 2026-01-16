import {
  GraffitiErrorCursorExpired,
  GraffitiErrorNotFound,
  GraffitiErrorTooLarge,
} from "@graffiti-garden/api";

const SERVICE_ENDPOINT_PREFIX_HTTPS = "https://";
export function verifyHTTPSEndpoint(endpoint: string): void {
  if (!endpoint.startsWith(SERVICE_ENDPOINT_PREFIX_HTTPS)) {
    throw new Error("Unrecognized storage bucket endpoint type");
  }
}

export async function getAuthorizationEndpoint(
  serviceEndpoint: string,
): Promise<string> {
  verifyHTTPSEndpoint(serviceEndpoint);
  const authUrl = `${serviceEndpoint}/auth`;

  const response = await fetch(authUrl);
  if (!response.ok) {
    throw new Error("Failed to get storage bucket authorization endpoint");
  }
  return await response.text();
}

export class GraffitiErrorUnauthorized extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorUnauthorized";
    Object.setPrototypeOf(this, GraffitiErrorUnauthorized.prototype);
  }
}

export class GraffitiErrorForbidden extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "GraffitiErrorForbidden";
    Object.setPrototypeOf(this, GraffitiErrorForbidden.prototype);
  }
}

export async function fetchWithErrorHandling(
  ...args: Parameters<typeof fetch>
) {
  const response = await fetch(...args);

  if (!response.ok) {
    let errorText: string;
    try {
      errorText = await response.text();
    } catch {
      errorText = response.statusText;
    }

    if (response.status === 401) {
      throw new GraffitiErrorUnauthorized(errorText);
    } else if (response.status === 403) {
      throw new GraffitiErrorForbidden(errorText);
    } else if (response.status === 404) {
      throw new GraffitiErrorNotFound(errorText);
    } else if (response.status === 410) {
      throw new GraffitiErrorCursorExpired(errorText);
    } else if (response.status === 413) {
      throw new GraffitiErrorTooLarge(errorText);
    } else {
      throw new Error(errorText);
    }
  }

  return response;
}
