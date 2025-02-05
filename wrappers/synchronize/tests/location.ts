import { it, expect, describe } from "vitest";
import type { Graffiti } from "@graffiti-garden/api";
import { GraffitiErrorInvalidUri } from "@graffiti-garden/api";
import { randomString } from "./utils";

export const graffitiLocationTests = (
  useGraffiti: () => Pick<Graffiti, "locationToUri" | "uriToLocation">,
) => {
  describe.concurrent("URI and location conversion", () => {
    it("location to uri and back", async () => {
      const graffiti = useGraffiti();
      const location = {
        name: randomString(),
        actor: randomString(),
        source: randomString(),
      };
      const uri = graffiti.locationToUri(location);
      const location2 = graffiti.uriToLocation(uri);
      expect(location).toEqual(location2);
    });

    it("collision resistance", async () => {
      const graffiti = useGraffiti();
      const location1 = {
        name: randomString(),
        actor: randomString(),
        source: randomString(),
      };
      for (const prop of ["name", "actor", "source"] as const) {
        const location2 = { ...location1, [prop]: randomString() };
        const uri1 = graffiti.locationToUri(location1);
        const uri2 = graffiti.locationToUri(location2);
        expect(uri1).not.toEqual(uri2);
      }
    });

    it("random URI should not be a valid location", async () => {
      const graffiti = useGraffiti();
      expect(() => graffiti.uriToLocation("")).toThrow(GraffitiErrorInvalidUri);
    });
  });
};
