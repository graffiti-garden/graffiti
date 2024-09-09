import GraffitiClient from "@graffiti-garden/client-core";

let graffiti: GraffitiClient | undefined = undefined;
export default function useGraffiti(): GraffitiClient {
  if (!graffiti) {
    graffiti = new GraffitiClient();
  }
  return graffiti;
}
