import { Graffiti } from "@graffiti-garden/api";
import type { GraffitiSolidOIDCInterfaceOptions } from "../types";
import { getSessionFromStorage } from "@inrupt/solid-client-authn-node";

export type { GraffitiSolidOIDCInterfaceOptions };

export class GraffitiSolidOIDCInterface
  implements Pick<Graffiti, "login" | "sessionEvents">
{
  constructor(options?: GraffitiSolidOIDCInterfaceOptions) {}
  sessionEvents: Graffiti["sessionEvents"] = new EventTarget();
  login: Graffiti["login"] = async () => {};
  logout: Graffiti["logout"] = async () => {};
}
