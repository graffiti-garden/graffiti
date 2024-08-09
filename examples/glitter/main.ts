import { createApp } from "vue";
import Directory from "./components/Directory.vue";
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
  //   path: '/',
  //   Feed
  {
    path: "/directory",
    component: Directory,
  },
  //   path: '/profile/:ID',
  //   props: true,
  //   Profile
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
