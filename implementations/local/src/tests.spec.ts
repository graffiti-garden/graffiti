import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiMediaTests,
} from "@graffiti-garden/api/tests";
import { GraffitiLocal } from "./index";

const useGraffiti = () => new GraffitiLocal();
const useSession1 = () => ({ actor: "did:example:someone" });
const useSession2 = () => ({ actor: "did:example:someoneelse" });

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
graffitiDiscoverTests(useGraffiti, useSession1, useSession2);
graffitiMediaTests(useGraffiti, useSession1, useSession2);
