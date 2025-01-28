import { Graffiti } from "@graffiti-garden/api";
import Ajv from "ajv-draft-04";
import { GraffitiSessionManagerLocal } from "./session-manager-local";
import { GraffitiPouchDBBase, type GraffitiPouchDBOptions } from "./database";
import { GraffitiSynchronize } from "./synchronize";
import { locationToUri, uriToLocation } from "./utilities";

export type { GraffitiPouchDBOptions };

export {
  GraffitiPouchDBBase,
  GraffitiSynchronize,
  GraffitiSessionManagerLocal,
};
export * from "./utilities";

/**
 * An implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * based on [PouchDB](https://pouchdb.com/). By default, PouchDb stores data in a local
 * database, either in the browser or in Node.js, but it can be configured to
 * use a remote database instead.
 */
export class GraffitiPouchDB extends Graffiti {
  locationToUri = locationToUri;
  uriToLocation = uriToLocation;

  login: Graffiti["login"];
  logout: Graffiti["logout"];
  sessionEvents: Graffiti["sessionEvents"];
  put: Graffiti["put"];
  get: Graffiti["get"];
  patch: Graffiti["patch"];
  delete: Graffiti["delete"];
  discover: Graffiti["discover"];
  synchronize: Graffiti["synchronize"];
  listChannels: Graffiti["listChannels"];
  listOrphans: Graffiti["listOrphans"];

  constructor(options?: GraffitiPouchDBOptions) {
    super();

    const sessionManagerLocal = new GraffitiSessionManagerLocal();
    this.login = sessionManagerLocal.login.bind(sessionManagerLocal);
    this.logout = sessionManagerLocal.logout.bind(sessionManagerLocal);
    this.sessionEvents = sessionManagerLocal.sessionEvents;

    const ajv = new Ajv({ strict: false });
    const graffitiPouchDbBase = new GraffitiPouchDBBase(options, ajv);
    const graffitiSynchronize = new GraffitiSynchronize(
      graffitiPouchDbBase,
      ajv,
    );

    this.put = graffitiSynchronize.put.bind(graffitiSynchronize);
    this.get = graffitiSynchronize.get.bind(graffitiSynchronize);
    this.patch = graffitiSynchronize.patch.bind(graffitiSynchronize);
    this.delete = graffitiSynchronize.delete.bind(graffitiSynchronize);
    this.discover = graffitiSynchronize.discover.bind(graffitiSynchronize);
    this.synchronize =
      graffitiSynchronize.synchronize.bind(graffitiSynchronize);
    this.listChannels =
      graffitiPouchDbBase.listChannels.bind(graffitiPouchDbBase);
    this.listOrphans =
      graffitiPouchDbBase.listOrphans.bind(graffitiPouchDbBase);
  }
}
