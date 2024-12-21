import { type JTDDataType } from "ajv/dist/core";
import type { Operation as JSONPatchOperation } from "fast-json-patch";

/**
 * Objects are the atomic unit in Graffiti that can represent both data (*e.g.* a social media post or profile)
 * and activities (*e.g.* a like or follow).
 * Objects are created and modified by a single {@link actor | `actor`}.
 *
 * Most of an object's content is stored in its {@link value | `value`} property, which can be any JSON
 * object. However, we recommend using properties from the
 * [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)
 * or properties that emerge in the Graffiti [folksonomy](https://en.wikipedia.org/wiki/Folksonomy)
 * to promote interoperability.
 *
 * The {@link name | `name`}, {@link actor | `actor`}, and {@link source | `source`}
 * properties together uniquely describe the {@link GraffitiLocation | object's location}
 * and can be {@link Graffiti.locationToUri | converted to a globally unique URI}.
 *
 * The {@link channels | `channels`} and {@link allowed | `allowed`} properties
 * enable the object's creator to shape the visibility of and access to their object.
 *
 * The {@link tombstone | `tombstone`} and {@link lastModified | `lastModified`} properties are for
 * caching and synchronization.
 */
export interface GraffitiObjectBase {
  /**
   * The object's content as freeform JSON. We recommend using properties from the
   * [Activity Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/)
   * or properties that emerge in the Graffiti [folksonomy](https://en.wikipedia.org/wiki/Folksonomy)
   * to promote interoperability.
   */
  value: {};

  /**
   * An array of URIs the creator associates with the object. Objects can only be found by querying
   * one of the object's channels using the
   * {@link Graffiti.discover} method. This allows creators to express the intended audience of their object
   * which helps to prevent [context collapse](https://en.wikipedia.org/wiki/Context_collapse) even
   * in the highly interoperable ecosystem that Graffiti envisions. For example, channel URIs may be:
   * - A user's own {@link actor | `actor`} URI. Putting an object in this channel is a way to broadcast
   * the object to the user's followers, like posting a tweet.
   * - The URI of a Graffiti post. Putting an object in this channel is a way to broadcast to anyone viewing
   * the post, like commenting on a tweet.
   * - A URI representing a topic. Putting an object in this channel is a way to broadcast to anyone interested
   * in that topic, like posting in a subreddit.
   */
  channels: string[];

  /**
   * An optional array of {@link actor | `actor`} URIs that the creator allows to access the object.
   * If no `allowed` array is provided, the object can be accessed by anyone (so long as they
   * also know the right {@link channels | `channel` } to look in). An object can always be accessed by its creator, even if
   * the `allowed` array is empty.
   *
   * The `allowed` array is not revealed to users other than the creator, like
   * a BCC email. A user may choose to add a `to` property to the object's {@link value | `value`} to indicate
   * other recipients, however this is not enforced by Graffiti and may not accurately reflect the actual `allowed` array.
   *
   * `allowed` can be combined with {@link channels | `channels`}. For example, to send someone a direct message
   * the sender should put their object in the channel of the recipient's {@link actor | `actor`} URI to notify them of the message and also add
   * the recipient's {@link actor | `actor`} URI to the `allowed` array to prevent others from seeing the message.
   */
  allowed?: string[];

  /**
   * The URI of the `actor` that {@link Graffiti.put | created } the object. This `actor` also has the unique permission to
   * {@link Graffiti.patch | modify} or {@link Graffiti.delete | delete} the object.
   *
   * We borrow the term actor from the ActivityPub because
   * [like in ActivityPub](https://www.w3.org/TR/activitypub/#h-note-0)
   * there is not necessarily a one-to-one mapping between actors and people/users.
   * Multiple people can share the same actor or one person can have multiple actors.
   * Actors can also be bots.
   *
   * In Graffiti, actors are always globally unique URIs which
   * allows them to also function as {@link channels | `channels`}.
   */
  actor: string;

  /**
   * A name for the object. This name is not globally unique but it is unique when
   * combined with the {@link actor | `actor`} and {@link source | `source`}.
   * Often times it is not specified by the user and randomly generated during {@link Graffiti.put | creation}.
   * If an object is created with the same `name`, `actor`, and `source` as an existing object,
   * the existing object will be replaced with the new object.
   */
  name: string;

  /**
   * The URI of the source that stores the object. In some decentralized implementations,
   * it can represent the server or [pod](https://en.wikipedia.org/wiki/Solid_(web_decentralization_project)#Design)
   * that a user has delegated to store their objects. In others it may represent the distributed
   * storage network that the object is stored on.
   */
  source: string;

  /**
   * The time the object was last modified. This is used for caching and synchronization.
   * It can also be used to sort objects in a user interface but in many cases it would be better to
   * use a `createdAt` property in the object's {@link value | `value`} to indicate when the object was created
   * rather than when it was modified.
   */
  lastModified: Date;

  /**
   * A boolean indicating whether the object has been deleted.
   * Depending on implementation, objects stay available for some time after deletion to allow for synchronization.
   */
  tombstone: boolean;
}

/**
 * This type constrains the {@link GraffitiObjectBase} type to adhere to a
 * particular [JSON schema](https://json-schema.org/).
 * This allows for static type-checking of an object's {@link GraffitiObjectBase.value | `value`}
 * which is otherwise a freeform JSON object.
 *
 * Schema-aware objects are returned by {@link Graffiti.get} and {@link Graffiti.discover}.
 */
export type GraffitiObject<Schema> = GraffitiObjectBase & JTDDataType<Schema>;

/**
 * This is a subset of properties from {@link GraffitiObjectBase} that uniquely
 * identify an object's location: {@link GraffitiObjectBase.actor | `actor`},
 * {@link GraffitiObjectBase.name | `name`}, and {@link GraffitiObjectBase.source | `source`}.
 * Attempts to create an object with the same `actor`, `name`, and `source`
 * as an existing object will replace the existing object (see {@link Graffiti.put}).
 *
 * This location can be converted to
 * a globally unique URI using {@link Graffiti.locationToUri}.
 */
export type GraffitiLocation = Pick<
  GraffitiObjectBase,
  "actor" | "name" | "source"
>;

/**
 * This object is a subset of {@link GraffitiObjectBase} that a user must construct locally before calling {@link Graffiti.put}.
 * This local copy does not require system-generated properties and may be statically typed with
 * a [JSON schema](https://json-schema.org/) to prevent creating erroneous objects (like {@link GraffitiObject}).
 *
 * This local object must have a {@link GraffitiObjectBase.value | `value`} and {@link GraffitiObjectBase.channels | `channels`}
 * and may optionally have an {@link GraffitiObjectBase.allowed | `allowed`} property.
 *
 * It may also contain any of the {@link GraffitiLocation } properties: {@link GraffitiObjectBase.actor | `actor`},
 * {@link GraffitiObjectBase.name | `name`}, and {@link GraffitiObjectBase.source | `source`}.
 * However these properties are not always required since they can usually be inferred by the system
 * during object creation, depending on the implementation.
 *
 * This object does not need a {@link GraffitiObjectBase.lastModified | `lastModified`} or {@link GraffitiObjectBase.tombstone | `tombstone`}
 * property since these are automatically generated by the Graffiti system.
 */
export type GraffitiPutObject<Schema> = Pick<
  GraffitiObjectBase,
  "value" | "channels" | "allowed"
> &
  Partial<GraffitiLocation> &
  JTDDataType<Schema>;

/**
 * This object contains information that
 * {@link GraffitiObjectBase.source | `source`}s can
 * use to verify that a user has permission to operate a
 * particular {@link GraffitiObjectBase.actor | `actor`}.
 * The object is required of most {@link Graffiti} methods.
 *
 *
 * At a minimum the `session` object must contain the
 * {@link GraffitiSessionBase.actor | `actor`} URI the user wants to authenticate with.
 * However it is likely that the `session` object will contain other
 * implementation-specific properties.
 * For example, a Solid implementation might include a
 * [`fetch`](https://docs.inrupt.com/developer-tools/api/javascript/solid-client-authn-browser/functions.html#fetch)
 * function. A distributed implementation may include
 * a cryptographic signature.
 */
export interface GraffitiSessionBase {
  /**
   * The {@link GraffitiObjectBase.actor | `actor`} a user wants to authenticate with.
   */
  actor: string;
  /**
   * Other implementation-specific properties go here.
   */
  [key: string]: any;
}

/**
 * Implementation-specific options that can be passed to
 *
 */
export interface GraffitiOptionsBase {
  [key: string]: any;
}

/**
 * This is the format for patches that modify {@link GraffitiObjectBase} objects
 * using the {@link Graffiti.patch} method. The patches must
 * be a series of [JSON Patch](https://jsonpatch.com) operations.
 * Patches can only be applied to the
 * {@link GraffitiObjectBase.value | `value`}, {@link GraffitiObjectBase.channels | `channels`},
 * and {@link GraffitiObjectBase.allowed | `allowed`} properties since the other
 * properties either describe the object's location or are automatically generated.
 */
export interface GraffitiPatch {
  /**
   * An array of [JSON Patch](https://jsonpatch.com) operations to
   * modify the object's {@link GraffitiObjectBase.value | `value`}. The resulting
   * `value` must still be a JSON object.
   */
  value?: JSONPatchOperation[];

  /**
   * An array of [JSON Patch](https://jsonpatch.com) operations to
   * modify the object's {@link GraffitiObjectBase.channels | `channels`}. The resulting
   * `channels` must still be an array of strings.
   */
  channels?: JSONPatchOperation[];

  /**
   * An array of [JSON Patch](https://jsonpatch.com) operations to
   * modify the object's {@link GraffitiObjectBase.allowed | `allowed`} property. The resulting
   * `allowed` property must still be an array of strings or `undefined`.
   */
  allowed?: JSONPatchOperation[];
}

export type GraffitiFeed<T> = AsyncGenerator<
  | {
      error: false;
      value: T;
    }
  | {
      error: true;
      value: Error;
      source: string;
    },
  void,
  void
>;
