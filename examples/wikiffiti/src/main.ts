import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Nav from "./Nav.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";

const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;
if (redirect && redirect !== location.href) {
  history.replaceState(null, "", redirect);
}

const routes = [
  {
    path: "/wiki/:channel",
    component: App,
    props: true,
  },
  {
    path: "/",
    redirect: "/wiki/wikiffiti",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(Nav)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiRemote(),
  })
  .use(router)
  .mount("#app");
