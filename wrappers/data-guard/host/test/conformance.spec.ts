import {
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { afterAll } from "vitest";
import { MemoryRules } from "./memory-rules.js";
import { Guard } from "../src/core/guard.js";
import { GuardedGraffiti } from "../src/core/graffiti.js";

const implementation = new GraffitiLocal();
const database = new MemoryRules();
const guard = new Guard(
  implementation,
  database,
  "https://example.com",
  async () => ({ allow: true, remember: false }),
);
const graffiti = new GuardedGraffiti(implementation, guard);

afterAll(() => database.destroy());

const useGraffiti = () => graffiti;
const useSession1 = () => ({ actor: "did:example:someone" });
const useSession2 = () => ({ actor: "did:example:someoneelse" });

// Object conformance asserts exact value equality, while the guard deliberately
// adds `value["via site"]`. Focused guard tests cover object and discovery behavior.
graffitiMediaTests(useGraffiti, useSession1, useSession2);
