import { createApp } from "vue";
import "@picocss/pico/css/pico.classless.fuchsia.css";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import { fetchFromSelf, isLoggedIn } from "./globals";
import "./style.css";

// See if we are logged in
function checkLoggedInStatus() {
  fetchFromSelf("/app/webauthn/logged-in")
    .then(() => {
      isLoggedIn.value = true;
    })
    .catch(() => {
      // Any 401 will automatically set isLoggedIn to false,
      // but if its a different error, retry after 1 second
      if (isLoggedIn.value === undefined) {
        setTimeout(() => {
          checkLoggedInStatus();
        }, 1000);
      }
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
        name: "handles",
        path: "/handles",
        component: () => import("./handles/Handles.vue"),
      },
      {
        name: "actors",
        path: "/actors",
        component: () => import("./actors/Actors.vue"),
      },
      {
        name: "register-handle",
        path: "/handles/register",
        component: () => import("./handles/RegisterHandle.vue"),
        props: {
          onRegister: () => router.push({ name: "handles" }),
          onCancel: () => router.push({ name: "handles" }),
        },
      },
      {
        name: "storage",
        path: "/storage",
        component: () => import("./storage/Storage.vue"),
        props: { type: "bucket" },
      },
      {
        name: "inboxes",
        path: "/inboxes",
        component: () => import("./storage/Storage.vue"),
        props: { type: "inbox" },
      },
    ],
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
