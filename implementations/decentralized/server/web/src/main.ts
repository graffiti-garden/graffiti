import { createApp, watch } from "vue";
import "@picocss/pico/css/pico.classless.fuchsia.css";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import { isLoggedIn, refreshAccounts } from "./globals";
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
      {
        name: "home",
        path: "/",
        component: () => import("./Home.vue"),
        meta: { title: "A Graffiti Provider" },
      },
      {
        name: "create",
        path: "/create",
        component: () => import("./CreateIdentity.vue"),
        meta: { title: "Create a Graffiti identity" },
      },
      {
        name: "replace-handle",
        path: "/handles/replace",
        component: () => import("./handles/ReplaceHandle.vue"),
        meta: { title: "Replace handle" },
      },
      {
        name: "replace-actor",
        path: "/actors/replace",
        component: () => import("./actors/ReplaceActor.vue"),
        meta: { title: "Actor setup" },
      },
    ],
  },
  {
    name: "add-account",
    path: "/add-account",
    component: () => import("./auth/LoginGuard.vue"),
    meta: { title: "Add account" },
  },
  {
    path: "/forgot-handle",
    component: () => import("./auth/ForgotHandle.vue"),
    meta: { title: "Forgot your handle?" },
  },
  {
    path: "/oauth",
    component: () => import("./auth/Oauth.vue"),
    meta: { title: "Authorize access" },
  },
];
const router = createRouter({
  history: createWebHistory(),
  routes,
});
function updateTitle() {
  const route = router.currentRoute.value;
  const title =
    route.name === "home" && isLoggedIn.value === false
      ? "Welcome to Graffiti"
      : route.meta.title;
  document.title = title ? `${title} · Graffiti Provider` : "Graffiti Provider";
}
router.afterEach(updateTitle);
watch(isLoggedIn, updateTitle);

createApp(RouterView)
  .use(router)
  .directive("focus", { mounted: (e) => e.focus() })
  .directive("scroll-into-view", {
    mounted: (e) => e.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    }),
  })
  .mount("#app");
