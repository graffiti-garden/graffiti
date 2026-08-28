import type { Graffiti } from "@graffiti-garden/api";
import { GraffitiRuntimeTypes } from "@graffiti-garden/wrapper-runtime-types";
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
