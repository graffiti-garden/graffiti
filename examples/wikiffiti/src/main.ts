import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";

const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;
if (redirect && redirect !== location.href) {
  history.replaceState(null, "", redirect);
}

createApp(App)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiRemote(),
  })
  .mount("#app");

// const routes = [
//   {
//     path: "/",
//     component: Feed,
//   },
//   {
//     path: "/directory",
//     component: Directory,
//   },
//   {
//     path: "/profile/:actorEncoded",
//     props: true,
//     component: Profile,
//   },
// ];

// const router = createRouter({
//   history: createWebHistory(),
//   routes,
// });
