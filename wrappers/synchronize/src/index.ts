import { Graffiti } from "@graffiti-garden/api";
import Ajv from "ajv-draft-04";
import { GraffitiLocalSessionManager } from "./session-manager";
import { GraffitiLocalDatabase, type GraffitiLocalOptions } from "./database";
import { GraffitiSynchronize } from "./synchronize";
import { locationToUri, uriToLocation } from "./utilities";

export type { GraffitiLocalOptions };

/**
 * A local implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * based on [PouchDB](https://pouchdb.com/). PouchDb will automatically persist data in a local
 * database, either in the browser or in Node.js.
 * It can also be configured to work with an external [CouchDB](https://couchdb.apache.org/) server,
 * although using it with a remote server will not be secure.
 */
export class GraffitiLocal extends Graffiti {
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

  constructor(options?: GraffitiLocalOptions) {
    super();

    const sessionManagerLocal = new GraffitiLocalSessionManager();
    this.login = sessionManagerLocal.login.bind(sessionManagerLocal);
    this.logout = sessionManagerLocal.logout.bind(sessionManagerLocal);
    this.sessionEvents = sessionManagerLocal.sessionEvents;

    const ajv = new Ajv({ strict: false });
    const graffitiPouchDbBase = new GraffitiLocalDatabase(options, ajv);
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
