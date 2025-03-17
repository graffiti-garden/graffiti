import type { GraffitiSolidOIDCSessionManagerOptions } from "../types";
import { GraffitiLocalSessionManager } from "@graffiti-garden/implementation-local/session-manager";
// TODO: actually use solid for node version
// import { getSessionFromStorage } from "@inrupt/solid-client-authn-node";

export type { GraffitiSolidOIDCSessionManagerOptions };
export { GraffitiLocalSessionManager as GraffitiSolidOIDCSessionManager };
