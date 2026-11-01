import { GraffitiGuarded } from "@graffiti-garden/wrapper-data-guard";

export const createGraffiti = () => new GraffitiGuarded({
  hostUrl: "https://localhost:5184/",
});
export const graffiti = createGraffiti();
