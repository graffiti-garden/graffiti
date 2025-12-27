import { createApp } from "vue";
import "@picocss/pico/css/pico.classless.fuchsia.css";
import { createRouter, createWebHistory } from "vue-router";
import { fetchFromSelf, isLoggedIn } from "./globals";
import { RouterView } from "vue-router";
import Navigation from "./Navigation.vue";
import Oauth from "./auth/Oauth.vue";
import Home from "./Home.vue";
import Storage from "./storage/Storage.vue";
import Handles from "./handles/Handles.vue";
import Actors from "./actors/Actors.vue";
import RegisterHandle from "./handles/RegisterHandle.vue";

// See if we are logged in
function checkLoggedInStatus() {
  console.log("hey!");
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
    component: Navigation,
    children: [
      {
        name: "home",
        path: "/",
        component: Home,
      },
      {
        name: "handles",
        path: "/handles",
        component: Handles,
      },
      {
        name: "actors",
        path: "/actors",
        component: Actors,
      },
      {
        name: "register-handle",
        path: "/handles/register",
        component: RegisterHandle,
      },
      {
        name: "storage",
        path: "/storage",
        component: Storage,
        props: {
          type: "bucket",
        },
      },
      {
        name: "indexers",
        path: "/indexers",
        component: Storage,
        props: {
          type: "indexer",
        },
      },
    ],
  },
  { path: "/oauth", component: Oauth },
];
const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(RouterView)
  .use(router)
  .directive("focus", { mounted: (e) => e.focus() })
  .mount("#app");
