import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { afterAll } from "vitest";
import { GuardDB } from "../src/core/db.js";
import { Guard } from "../src/core/guard.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";

const implementation = new GraffitiLocal();
const database = new GuardDB("guard-conformance");
const guard = new Guard(
  implementation,
  database,
  "https://example.com",
  async () => ({ remember: false }),
);
const graffiti = new GuardedGraffiti(implementation, guard);

afterAll(() => database.destroy());

const useGraffiti = () => graffiti;
const useSession1 = () => ({ actor: "did:example:someone" });
const useSession2 = () => ({ actor: "did:example:someoneelse" });

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
graffitiDiscoverTests(useGraffiti, useSession1, useSession2);
graffitiMediaTests(useGraffiti, useSession1, useSession2);
