import {
  Graffiti,
  type GraffitiSession,
  GraffitiRuntimeTypes,
} from "@graffiti-garden/api";
import { GraffitiLocalIdentity } from "./identity";
import { GraffitiLocalObjects, type GraffitiLocalOptions } from "./objects";
import { GraffitiLocalMedia } from "./media";

export type { GraffitiLocalOptions };

/**
 * A local implementation of the [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html)
 * based on [PouchDB](https://pouchdb.com/). PouchDb will automatically persist data in a local
 * database, either in the browser or in Node.js.
 * It can also be configured to work with an external [CouchDB](https://couchdb.apache.org/) server,
 * although using it with a remote server will not be secure.
 */
export class GraffitiLocal extends GraffitiRuntimeTypes {
  constructor(options?: GraffitiLocalOptions) {
    const graffiti = new GraffitiLocal_(options);
    super(graffiti);
  }
}

class GraffitiLocal_ implements Graffiti {
  protected graffitiLocalIdentity = new GraffitiLocalIdentity();
  login = this.graffitiLocalIdentity.login.bind(this.graffitiLocalIdentity);
  logout = this.graffitiLocalIdentity.logout.bind(this.graffitiLocalIdentity);
  handleToActor = this.graffitiLocalIdentity.handleToActor.bind(
    this.graffitiLocalIdentity,
  );
  actorToHandle = this.graffitiLocalIdentity.actorToHandle.bind(
    this.graffitiLocalIdentity,
  );
  sessionEvents = this.graffitiLocalIdentity.sessionEvents;

  protected graffitiLocalObjects: GraffitiLocalObjects;
  post: Graffiti["post"];
  get: Graffiti["get"];
  delete: Graffiti["delete"];
  discover: Graffiti["discover"];
  continueDiscover: Graffiti["continueDiscover"];

  protected graffitiLocalMedia: GraffitiLocalMedia;
  postMedia: Graffiti["postMedia"];
  getMedia: Graffiti["getMedia"];
  deleteMedia: Graffiti["deleteMedia"];

  constructor(options?: GraffitiLocalOptions) {
    this.graffitiLocalObjects = new GraffitiLocalObjects(options);
    this.post = this.graffitiLocalObjects.post.bind(this.graffitiLocalObjects);
    this.get = this.graffitiLocalObjects.get.bind(this.graffitiLocalObjects);
    this.delete = this.graffitiLocalObjects.delete.bind(
      this.graffitiLocalObjects,
    );
    this.discover = this.graffitiLocalObjects.discover.bind(
      this.graffitiLocalObjects,
    );
    this.continueDiscover = this.graffitiLocalObjects.continueDiscover.bind(
      this.graffitiLocalObjects,
    );

    this.graffitiLocalMedia = new GraffitiLocalMedia(this.graffitiLocalObjects);
    this.postMedia = this.graffitiLocalMedia.postMedia.bind(
      this.graffitiLocalMedia,
    );
    this.getMedia = this.graffitiLocalMedia.getMedia.bind(
      this.graffitiLocalMedia,
    );
    this.deleteMedia = this.graffitiLocalMedia.deleteMedia.bind(
      this.graffitiLocalMedia,
    );
  }
}
