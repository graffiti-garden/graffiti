import { it, expect } from "vitest";
import type { UseGraffiti } from "../src/index";

export const locationTests = (useGraffiti: UseGraffiti) => {
  it("url and location", async () => {
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
};
