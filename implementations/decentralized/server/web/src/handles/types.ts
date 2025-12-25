import type {
  OptionalAlsoKnownAs,
  OptionalServices,
} from "../../../shared/did-schemas";

export interface Handle {
  name: string;
  createdAt: number;
  alsoKnownAs: OptionalAlsoKnownAs;
  services: OptionalServices;
}
