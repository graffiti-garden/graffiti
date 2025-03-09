import {
  graffitiCRUDTests,
  graffitiDiscoverTests,
  graffitiOrphanTests,
  graffitiChannelStatsTests,
} from "@graffiti-garden/api/tests";
import { GraffitiLocal } from "./index";

const useGraffiti = () => new GraffitiLocal();
const useSession1 = () => ({ actor: "someone" });
const useSession2 = () => ({ actor: "someoneelse" });

graffitiCRUDTests(useGraffiti, useSession1, useSession2);
graffitiDiscoverTests(useGraffiti, useSession1, useSession2);
graffitiOrphanTests(useGraffiti, useSession1, useSession2);
graffitiChannelStatsTests(useGraffiti, useSession1, useSession2);
