import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiLocalObjects } from "@graffiti-garden/implementation-local/objects";

/** A real Graffiti Local database, isolated and removed after each test. */
export async function localGraffiti() {
  const directory = await mkdtemp(join(tmpdir(), "graffiti-realtime-"));
  const options = {
    pouchDBOptions: { name: join(directory, "db") },
    continueBuffer: 0,
  };
  return {
    graffiti: new GraffitiLocal(options),
    async dispose() {
      await (await new GraffitiLocalObjects(options).db).destroy();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
