import Graffiti from "../src/index";

declare global {
  interface Window {
    gf: Graffiti;
  }
}

window.gf = new Graffiti({
  byoStorage: {
    authentication: {
      clientId: "h4bnq16igcef7tg",
    },
    onLoginStateChange(loginState) {
      const loginEl = document.getElementById("storage-login");
      if (loginEl) {
        loginEl.textContent = loginState
          ? "Log out of storage"
          : "Log in to storage";
      }
    },
  },
  actorManager: {
    onChosenActor(actorURI) {
      const actorEl = document.getElementById("actor-id");
      if (actorEl) {
        actorEl.textContent = actorURI;
      }
    },
  },
});
