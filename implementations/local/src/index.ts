import { Graffiti, type GraffitiSession } from "@graffiti-garden/api";
import { GraffitiLocalSessionManager } from "./session-manager.js";
import {
  GraffitiLocalDatabase,
  type GraffitiLocalOptions,
} from "./database.js";

export type { GraffitiLocalOptions };

/**
 * A local implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * based on [PouchDB](https://pouchdb.com/). PouchDb will automatically persist data in a local
 * database, either in the browser or in Node.js.
 * It can also be configured to work with an external [CouchDB](https://couchdb.apache.org/) server,
 * although using it with a remote server will not be secure.
 */
export class GraffitiLocal extends Graffiti {
  protected sessionManagerLocal = new GraffitiLocalSessionManager();
  login = this.sessionManagerLocal.login.bind(this.sessionManagerLocal);
  logout = this.sessionManagerLocal.logout.bind(this.sessionManagerLocal);
  sessionEvents = this.sessionManagerLocal.sessionEvents;

  put: Graffiti["put"];
  get: Graffiti["get"];
  patch: Graffiti["patch"];
  delete: Graffiti["delete"];
  discover: Graffiti["discover"];
  recoverOrphans: Graffiti["recoverOrphans"];
  channelStats: Graffiti["channelStats"];
  continueObjectStream: Graffiti["continueObjectStream"];

  constructor(options?: GraffitiLocalOptions) {
    super();

    const graffitiPouchDbBase = new GraffitiLocalDatabase(options);

    this.put = graffitiPouchDbBase.put.bind(graffitiPouchDbBase);
    this.get = graffitiPouchDbBase.get.bind(graffitiPouchDbBase);
    this.patch = graffitiPouchDbBase.patch.bind(graffitiPouchDbBase);
    this.delete = graffitiPouchDbBase.delete.bind(graffitiPouchDbBase);
    this.discover = graffitiPouchDbBase.discover.bind(graffitiPouchDbBase);
    this.recoverOrphans =
      graffitiPouchDbBase.recoverOrphans.bind(graffitiPouchDbBase);
    this.channelStats =
      graffitiPouchDbBase.channelStats.bind(graffitiPouchDbBase);
    this.continueObjectStream =
      graffitiPouchDbBase.continueObjectStream.bind(graffitiPouchDbBase);
  }
}

function myFunction<T extends boolean>(
  flag: T,
): T extends true ? string : number {
  if (!flag) {
    return "Hello" as T extends true ? string : number;
  } else {
    return 42 as T extends true ? string : number;
  }
}
// Usage
const a = myFunction(false); // Type is number
const b = myFunction(true); // Type is string
