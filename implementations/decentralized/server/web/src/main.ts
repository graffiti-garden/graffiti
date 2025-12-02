import { createApp } from "vue";
import "@picocss/pico/css/pico.classless.fuchsia.css";
import { createRouter, createWebHistory } from "vue-router";
import { fetchFromAPI, isLoggedIn } from "./globals";
import { RouterView } from "vue-router";
import Navigation from "./Navigation.vue";
import Oauth from "./auth/Oauth.vue";
import Home from "./Home.vue";
import Storage from "./storage/Storage.vue";
import Actors from "./Actors.vue";

// See if we are logged in
function checkLoggedInStatus() {
  fetchFromAPI("webauthn/logged-in")
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
        path: "/",
        component: Home,
      },
      {
        path: "/actors",
        component: Actors,
      },
      {
        path: "/storage",
        component: Storage,
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
