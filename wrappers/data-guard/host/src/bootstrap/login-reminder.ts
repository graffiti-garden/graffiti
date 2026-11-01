import { getLocalStorage } from "./storage_access.js";

/** A hint to offer cookie access again, never proof of identity or site consent. */
export function createLoginReminder(origin: string) {
  // Keep the site's original storage even if storage access later installs a
  // shared handle. Safari must be able to read this hint before cookie access.
  const storage = getLocalStorage();
  const key = `graffiti-guard:remember-login:${origin}`;
  let remembered = false;
  try {
    remembered = storage?.getItem(key) === "1";
  } catch { /* Storage restrictions must not prevent anonymous browsing. */ }

  return {
    remembered,
    /** Attach only after storage access, so a skipped prompt keeps the reminder. */
    track(sessionEvents: EventTarget) {
      const actors = new Set<string>();
      const update = (event: Event) => {
        if (!(event instanceof CustomEvent) || event.detail?.error) return;
        if (event.type === "login") {
          const session = event.detail.session;
          // Site logout is also delivered as a login with updated site paths.
          if (session.guardSites?.length) actors.add(session.actor);
          else actors.delete(session.actor);
        } else if (event.type === "logout") {
          actors.delete(event.detail.actor);
        }
        // Initialization with no approved accounts clears an expired reminder.
        try {
          if (actors.size) storage?.setItem(key, "1");
          else storage?.removeItem(key);
        } catch { /* Remembering is optional; the actual login still works. */ }
      };
      for (const type of ["login", "logout", "initialized"]) {
        sessionEvents.addEventListener(type, update);
      }
    },
  };
}
