import { Graffiti } from "@graffiti-garden/api";
import Ajv from "ajv-draft-04";
import { SessionManagerLocal } from "./session-manager-local";
import { GraffitiPouchDBBase, type GraffitiPouchDBOptions } from "./database";
import { GraffitiSynchronize } from "./sync";
import { locationToUri, uriToLocation } from "./utilities";

export type { GraffitiPouchDBOptions };

/**
 * An implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * based on [PouchDB](https://pouchdb.com/). By default, PouchDb stores data in a local
 * database, either in the browser or in Node.js, but it can be configured to
 * use a remote database instead.
 */
export class GraffitiPouchDB extends Graffiti {
  protected readonly ajv = new Ajv({ strict: false });

  protected readonly sessionManagerLocal = new SessionManagerLocal();
  login = this.sessionManagerLocal.login;
  logout = this.sessionManagerLocal.logout;
  sessionEvents = this.sessionManagerLocal.sessionEvents;

  locationToUri = locationToUri;
  uriToLocation = uriToLocation;

  protected readonly graffitiPouchDbBase: GraffitiPouchDBBase;
  protected readonly graffitiSynchronize: GraffitiSynchronize;

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

    this.graffitiPouchDbBase = new GraffitiPouchDBBase(this.ajv, options);
    this.graffitiSynchronize = new GraffitiSynchronize(
      this.ajv,
      this.graffitiPouchDbBase,
    );

    this.put = this.graffitiSynchronize.put;
    this.get = this.graffitiSynchronize.get;
    this.patch = this.graffitiSynchronize.patch;
    this.delete = this.graffitiSynchronize.delete;
    this.discover = this.graffitiSynchronize.discover;
    this.synchronize = this.graffitiSynchronize.synchronize;
    this.listChannels = this.graffitiPouchDbBase.listChannels;
    this.listOrphans = this.graffitiPouchDbBase.listOrphans;
  }
}
