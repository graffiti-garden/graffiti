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
export class GraffitiLocal
  implements
    Omit<
      Graffiti,
      | "postMedia"
      | "getMedia"
      | "deleteMedia"
      | "actorToHandle"
      | "handleToActor"
    >
{
  protected sessionManagerLocal = new GraffitiLocalSessionManager();
  login = this.sessionManagerLocal.login.bind(this.sessionManagerLocal);
  logout = this.sessionManagerLocal.logout.bind(this.sessionManagerLocal);
  sessionEvents = this.sessionManagerLocal.sessionEvents;
  protected graffitiPouchDbBase: GraffitiLocalDatabase;

  post: Graffiti["post"];
  get: Graffiti["get"];
  delete: Graffiti["delete"];
  discover: Graffiti["discover"];
  continueDiscover: Graffiti["continueDiscover"];

  constructor(options?: GraffitiLocalOptions) {
    this.graffitiPouchDbBase = new GraffitiLocalDatabase(options);

    this.post = this.graffitiPouchDbBase.post.bind(this.graffitiPouchDbBase);
    this.get = this.graffitiPouchDbBase.get.bind(this.graffitiPouchDbBase);
    this.delete = this.graffitiPouchDbBase.delete.bind(
      this.graffitiPouchDbBase,
    );
    this.discover = this.graffitiPouchDbBase.discover.bind(
      this.graffitiPouchDbBase,
    );
    this.continueDiscover = this.graffitiPouchDbBase.continueDiscover.bind(
      this.graffitiPouchDbBase,
    );
  }
}
