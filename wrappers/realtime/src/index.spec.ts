import { afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiLocalObjects } from "@graffiti-garden/implementation-local/objects";
import { graffitiCRUDTests, graffitiDiscoverTests, graffitiMediaTests } from "@graffiti-garden/api/tests";
import { GraffitiRealtime } from "./index.js";

// The normal API must also work without WebRTC, including anonymous reads.
const directory = await mkdtemp(join(tmpdir(), "graffiti-realtime-api-"));
const options = { pouchDBOptions: { name: join(directory, "db") }, continueBuffer: 0 };
const instances: GraffitiRealtime[] = [];
const useGraffiti = () => {
  const graffiti = new GraffitiRealtime(new GraffitiLocal(options));
  instances.push(graffiti);
  return graffiti;
};
const alice = () => ({ actor: "did:example:alice" });
const bob = () => ({ actor: "did:example:bob" });
graffitiCRUDTests(useGraffiti, alice, bob);
graffitiDiscoverTests(useGraffiti, alice, bob);
graffitiMediaTests(useGraffiti, alice, bob);
afterAll(async () => {
  await Promise.all(instances.map(instance => instance.close()));
  await (await new GraffitiLocalObjects(options).db).destroy();
  await rm(directory, { recursive: true, force: true });
});
