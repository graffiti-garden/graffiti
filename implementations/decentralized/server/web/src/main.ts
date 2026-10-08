import { createApp } from "vue";
import "@picocss/pico/css/pico.classless.fuchsia.css";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import { refreshAccounts } from "./globals";
import "./style.css";

// See if we are logged in
function checkLoggedInStatus() {
  refreshAccounts().catch(() => {
    // If the function errors, retry every second, its likely a network disconnection
    setTimeout(checkLoggedInStatus, 1000);
  });
}
checkLoggedInStatus();

const routes = [
  {
    path: "/",
    component: () => import("./Navigation.vue"),
    children: [
      { name: "home", path: "/", component: () => import("./Home.vue") },
      {
        name: "create",
        path: "/create",
        component: () => import("./CreateIdentity.vue"),
      },
      {
        name: "replace-handle",
        path: "/handles/replace",
        component: () => import("./handles/ReplaceHandle.vue"),
      },
      {
        name: "replace-actor",
        path: "/actors/replace",
        component: () => import("./actors/ReplaceActor.vue"),
      },
    ],
  },
  {
    name: "add-account",
    path: "/add-account",
    component: () => import("./auth/LoginGuard.vue"),
  },
  { path: "/oauth", component: () => import("./auth/Oauth.vue") },
];
const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(RouterView)
  .use(router)
  .directive("focus", { mounted: (e) => e.focus() })
  .directive("scroll-into-view", {
    mounted: (e) => e.scrollIntoView({ behavior: "smooth" }),
  })
  .mount("#app");
