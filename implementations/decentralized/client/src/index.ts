import { Graffiti, GraffitiRuntimeTypes } from "@graffiti-garden/api";
import {
  GraffitiDecentralized as GraffitiDecentralized_,
  type GraffitiDecentralizedOptions,
} from "./3-protocol/4-graffiti";

/**
 * A decentralized implementation of the
 * [Graffiti API](https://api.graffiti.garden/classes/Graffiti.html).
 */
export class GraffitiDecentralized extends GraffitiRuntimeTypes {
  constructor(options?: GraffitiDecentralizedOptions) {
    const graffiti: Graffiti = new GraffitiDecentralized_(options);
    super(graffiti);
  }
}
