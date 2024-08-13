import { createApp } from "vue";
import Directory from "./components/Directory.vue";
import Feed from "./components/Feed.vue";
import Profile from "./components/Profile.vue";
import Navigation from "./components/Navigation.vue";
import GraffitiPlugin from "@graffiti-garden/client-vue";
import VueClickAway from "vue3-click-away";
import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from "vue-router";
import "./style.css";
// import "https://use.typekit.net/ovj6wxu.css";

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
  history: ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? createWebHashHistory()
    : createWebHistory(),
  routes,
});

createApp(Navigation)
  .use(router)
  .use(GraffitiPlugin)
  .use(VueClickAway)
  .directive("focus", { mounted: (el: HTMLElement) => el.focus() })
  .mount("#app");
