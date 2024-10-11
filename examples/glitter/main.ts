import { createApp, provide, reactive, ref } from "vue";
import Directory from "./components/Directory.vue";
import Feed from "./components/Feed.vue";
import Profile from "./components/Profile.vue";
import Navigation from "./components/Navigation.vue";
import GraffitiPlugin from "@graffiti-garden/client-vue";
import VueClickAway from "vue3-click-away";
import { createRouter, createWebHistory } from "vue-router";
import "./style.css";
import "@graffiti-garden/client-vue/dist/style.css";

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
  .use(router)
  .use(GraffitiPlugin, {
    registerSolidSession: {
      onSessionRestore: (href: string) => {
        const url = new URL(href);
        router.replace(url.pathname + url.search + url.hash);
      },
    },
  })
  .use(VueClickAway)
  .directive("focus", { mounted: (el: HTMLElement) => el.focus() })
  .mount("#app");
