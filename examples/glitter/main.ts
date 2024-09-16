import { createApp, provide, reactive, ref } from "vue";
import Directory from "./components/Directory.vue";
// import Feed from "./components/Feed.vue";
import Profile from "./components/Profile.vue";
import Navigation from "./components/Navigation.vue";
import GraffitiPlugin, {
  type GraffitiSession,
} from "@graffiti-garden/client-vue";
import VueClickAway from "vue3-click-away";
import { createRouter, createWebHistory } from "vue-router";
import {
  getDefaultSession,
  handleIncomingRedirect,
} from "@inrupt/solid-client-authn-browser";
import "./style.css";

const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;
if (redirect && redirect !== location.href) {
  history.replaceState(null, "", redirect);
}

const solidSession = getDefaultSession();
const session = ref<GraffitiSession>({
  pods: ["http://localhost:3000"],
});
function handleSolidSession() {
  if (solidSession.info.isLoggedIn && solidSession.info.webId) {
    session.value = {
      ...session.value,
      webId: solidSession.info.webId,
      fetch: solidSession.fetch,
      pod: "http://localhost:3000",
    };
  } else {
    session.value = {
      pods: session.value.pods,
    };
  }
}
solidSession.events.on("login", handleSolidSession);
solidSession.events.on("logout", handleSolidSession);
solidSession.events.on("sessionRestore", (href: string) => {
  handleSolidSession();
  const url = new URL(href);
  router.replace(url.pathname + url.search + url.hash);
});
handleIncomingRedirect({ restorePreviousSession: true });

const routes = [
  // {
  //   path: "/",
  //   component: Feed,
  // },
  {
    // path: "/directory",
    path: "/",
    component: Directory,
  },
  {
    path: "/profile/:webIdEncoded",
    props: true,
    component: Profile,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(Navigation)
  .provide("graffitiSession", session)
  .use(router)
  .use(GraffitiPlugin)
  .use(VueClickAway)
  .directive("focus", { mounted: (el: HTMLElement) => el.focus() })
  .mount("#app");
