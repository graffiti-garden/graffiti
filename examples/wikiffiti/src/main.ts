import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Nav from "./Nav.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;
if (redirect && redirect !== location.href) {
  history.replaceState(null, "", redirect);
}

const graffiti = new GraffitiDecentralized();

const routes = [
  {
    path: "/wiki/:name",
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

createApp(Nav).use(GraffitiPlugin, { graffiti }).use(router).mount("#app");
