import { createApp, provide, reactive, ref } from "vue";
import Directory from "./components/Directory.vue";
import Feed from "./components/Feed.vue";
import Profile from "./components/Profile.vue";
import Navigation from "./components/Navigation.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiPouchDB } from "@graffiti-garden/implementation-pouchdb";
import VueClickAway from "vue3-click-away";
import { createRouter, createWebHistory } from "vue-router";
import "./style.css";

const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;
if (redirect && redirect !== location.href) {
  history.replaceState(null, "", redirect);
}

const routes = [
  {
    path: "/",
    component: Feed,
  },
  {
    path: "/directory",
    component: Directory,
  },
  {
    path: "/profile/:actorEncoded",
    props: true,
    component: Profile,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Horrible, I know
// this is just for testing
const one = "Sandbank8803";
const two = "hb#&6CQBx!ua%q";
const three = "tracker.graffiti.garden";
const four = "graffiti";

createApp(Navigation)
  .use(router)
  .use(GraffitiPlugin, {
    useGraffiti: () =>
      new GraffitiPouchDB({
        pouchDBOptions: {
          name: `https://${encodeURIComponent(one)}:${encodeURIComponent(two)}@${three}/${four}`,
        },
      }),
  })
  .use(VueClickAway)
  .directive("focus", { mounted: (el: HTMLElement) => el.focus() })
  .mount("#app");
