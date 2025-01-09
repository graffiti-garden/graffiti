import { it, expect, describe } from "vitest";
import { GraffitiErrorInvalidUri, type GraffitiFactory } from "../src/index";

export const graffitiLocationTests = (useGraffiti: GraffitiFactory) => {
  describe("URI and location conversion", () => {
    it("location to uri and back", async () => {
      const graffiti = useGraffiti();
      const location = {
        name: "12345",
        actor: "https://example.com/actor",
        source: "https://example.com/source",
      };
      const uri = graffiti.locationToUri(location);
      const location2 = graffiti.uriToLocation(uri);
      expect(location).toEqual(location2);
    });

    it("collision resistance", async () => {
      const graffiti = useGraffiti();
      const location1 = {
        name: "12345",
        actor: "https://example.com/actor",
        source: "https://example.com/source",
      };
      for (const prop of ["name", "actor", "source"] as const) {
        const location2 = { ...location1, [prop]: "something else" };
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
