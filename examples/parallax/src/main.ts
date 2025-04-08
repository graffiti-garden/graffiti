import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import Chat from "./Chat.vue";
import AllChats from "./AllChats.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";

const redirect = sessionStorage.redirect;
delete sessionStorage.redirect;
if (redirect && redirect !== location.href) {
  history.replaceState(null, "", redirect);
}

const routes = [
  {
    path: "/chat/:channel",
    name: "chat",
    component: Chat,
    props: true,
  },
  {
    path: "/",
    component: AllChats,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(App)
  .use(GraffitiPlugin, {
    graffiti: new GraffitiRemote(),
  })
  .directive("focus", { mounted: (e) => e.focus() })
  .use(router)
  .mount("#app");
