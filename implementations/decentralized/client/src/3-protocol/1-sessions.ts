import type {
  Graffiti,
  GraffitiLoginEvent,
  GraffitiLogoutEvent,
  GraffitiSession,
  GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { DecentralizedIdentifiers } from "../1-services/2-dids";
import {
  InitializedEventDetailSchema,
  LoginEventDetailSchema,
  type Authorization,
} from "../1-services/1-authorization";
import { StorageBuckets } from "../1-services/3-storage-buckets";
import type { Inboxes } from "../1-services/4-inboxes";
import type { Service } from "did-resolver";
import {
  readCookie,
  readLocalStorage,
  writeLocalStorage,
  writeCookie,
} from "./browser-storage";
import {
  type infer as infer_,
  extend,
  array,
  string,
  object,
  url,
} from "zod/mini";
import { LoginAttempts, AuthorizationProgressSchema, LOGIN_ATTEMPT_PARAM, type LoginAttempt } from "./login-attempt";
import { GraffitiErrorUnauthorized } from "../1-services/utilities";

export const DID_SERVICE_TYPE_GRAFFITI_INBOX = "GraffitiInbox";
export const DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET = "GraffitiStorageBucket";
export const DID_SERVICE_ID_GRAFFITI_PERSONAL_INBOX = "#graffitiPersonalInbox";
export const DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET = "#graffitiStorageBucket";
export const DID_SERVICE_ID_GRAFFITI_SHARED_INBOX_PREFIX =
  "#graffitiSharedInbox_";

export class Sessions {
  sessionEvents: Graffiti["sessionEvents"] = new EventTarget();
  readonly loginAttempts: LoginAttempts;
  onLoginFinish?: () => void;
  /** Keep a failed attempt open for the UI to retry; otherwise finish with an error. */
  onLoginError?: (attempt: LoginAttempt, error: Error, actor?: string) => void;
  initialAuthorizationNavigation: "assign" | "replace" = "assign";
  // Cookies may end these logins, but cannot silently replace this instance's credentials.
  private browserSessions?: StoredSession[];

  constructor(
    protected readonly services: {
      readonly dids: DecentralizedIdentifiers;
      readonly authorization: Authorization;
      readonly storageBuckets: StorageBuckets;
      readonly inboxes: Inboxes;
    },
  ) {
    this.loginAttempts = new LoginAttempts(this.sessionEvents, (attempt) => {
      services.authorization.endLogin(attempt.id);
      this.onLoginFinish?.();
    });
    let initializationError: Error | undefined;
    const initializedPromise = new Promise<void>((resolve) => {
      this.services.authorization.eventTarget.addEventListener(
        "initialized",
        (e) => {
          if (!(e instanceof CustomEvent)) return;
          const parsed = InitializedEventDetailSchema.safeParse(e.detail);
          if (!parsed.success) return;
          initializationError ??= parsed.data?.error;
          resolve();
        },
      );
    });
    this.services.authorization.eventTarget.addEventListener(
      "login",
      this.onLogin.bind(this),
    );

    // Handle account registration redirect immediately,
    // to prevent SPA routers from hijacking the URL too soon
    let loginPromise: Promise<void> | undefined;
    if (typeof window !== "undefined") {
      const actorEncoded = new URLSearchParams(window.location.search).get(
        "actor",
      );
      // Only an identified redirect resumes an attempt; ordinary loads just restore sessions.
      const attemptId = services.authorization.completingLoginId ??
        (actorEncoded ? new URL(window.location.href).searchParams.get(LOGIN_ATTEMPT_PARAM) : null);
      try {
        if (attemptId) {
          this.loginAttempts.restore(attemptId);
          if (!this.loginAttempts.current) {
            services.authorization.endLogin(attemptId);
            throw new Error("Login expired or missing login attempt. Please start again.");
          }
        }
        if (actorEncoded) {
          // Strip it from the URL
          const url = new URL(window.location.toString());
          url.searchParams.delete("actor");
          url.searchParams.delete(LOGIN_ATTEMPT_PARAM);
          window.history.replaceState({}, "", url.toString());
          // The original app entry was kept when opening account creation or
          // recovery, so OAuth reuses this callback entry.
          let attempt = this.loginAttempts.current;
          // Only start an uncorrelated account return after initialization succeeds.
          loginPromise = initializedPromise.then(() => {
            if (initializationError) {
              if (attempt) this.loginAttempts.finish(attempt, { error: initializationError });
              return;
            }
            attempt ??= this.loginAttempts.begin();
            return this.login(decodeURIComponent(actorEncoded), attempt, "replace");
          }).catch(error => {
            if (attempt) this.handleLoginError(attempt, error);
            else initializationError = error instanceof Error ? error : new Error(String(error));
          });
        }
      } catch (error) {
        initializationError = error instanceof Error ? error : new Error(String(error));
      }
    }

    (async () => {
      // Allow listeners to be added before dispatching events
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Wait for login to complete, if there
      await loginPromise;

      // Announce changed logins before restoring identity. Wrappers can then
      // discard state belonging to the previous login, even for the same actor.
      const previous = parseSessions(readLocalStorage(SESSION_STORAGE_KEY));
      const current = this.loggedInSessions;
      if (typeof window !== "undefined") {
        for (const actor of new Set([...previous, ...current].map(s => s.actor))) {
          if (!sameLogin(previous.find(s => s.actor === actor), current.find(s => s.actor === actor))) {
            this.sessionEvents.dispatchEvent(new CustomEvent("logout", { detail: { actor } }));
          }
        }
        // Save a copy for the next load, when shared cookies may be unavailable.
        writeLocalStorage(SESSION_STORAGE_KEY, JSON.stringify(current));
      }
      // Restore immediately, including offline. A revoked token is discarded
      // when an authenticated operation receives an unauthorized response.
      for (const session of current) {
        const loginEvent: GraffitiLoginEvent = new CustomEvent("login", {
          detail: { session: { actor: session.actor } },
        });
        this.sessionEvents.dispatchEvent(loginEvent);
      }

      await initializedPromise;

      // Send own initialized event
      const initializedEvent: GraffitiSessionInitializedEvent = new CustomEvent(
        "initialized",
        { detail: initializationError ? { error: initializationError } : undefined },
      );
      this.sessionEvents.dispatchEvent(initializedEvent);
    })();
  }

  /** Forget a rejected credential locally; the server already considers it invalid. */
  forget(actor: string) {
    // The rejected request used this instance's credentials, not a newer copy
    // that another tab may have written in the meantime.
    const session = (this.browserSessions ?? this.loggedInSessions).find(s => s.actor === actor);
    if (session) this.updateSession(session, true);
    const logoutEvent: GraffitiLogoutEvent = new CustomEvent("logout", { detail: { actor } });
    this.sessionEvents.dispatchEvent(logoutEvent);
  }

  async login(
    actor: string,
    attempt = this.loginAttempts.begin(),
    initialAuthorizationNavigation: "assign" | "replace" =
      this.initialAuthorizationNavigation,
  ) {
    if (this.loginAttempts.current !== attempt) return;
    try {
      await this.login_(actor, attempt, initialAuthorizationNavigation);
    } catch (error) {
      this.handleLoginError(attempt, error, actor);
    }
  }

  private handleLoginError(attempt: LoginAttempt, error: unknown, actor?: string) {
    if (this.loginAttempts.current !== attempt) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    attempt.authorization = undefined;
    if (this.onLoginError) {
      this.loginAttempts.save(attempt);
      this.onLoginError(attempt, failure, actor);
    } else {
      this.loginAttempts.finish(attempt, {
        error: failure,
        session: actor ? { actor } : undefined,
      });
    }
  }

  protected async login_(
    actor: string,
    attempt: LoginAttempt,
    initialAuthorizationNavigation: "assign" | "replace",
  ) {
    // First look to see if we're already logged in
    const existingSession = this.loggedInSessions.find(
      (session) => session.actor === actor,
    );
    if (existingSession) {
      this.loginAttempts.finish(attempt, { session: { actor } });
      return;
    }

    const actorDocument = await this.services.dids.resolve(actor);

    const services = actorDocument.service;
    if (!services) {
      throw new Error(`No services found in actor document for ${actor}`);
    }

    const storageBucketService = services.find(
      (service) =>
        service.id === DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET &&
        service.type === DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET,
    );
    const personalInboxService = services.find(
      (service) =>
        service.id === DID_SERVICE_ID_GRAFFITI_PERSONAL_INBOX &&
        service.type === DID_SERVICE_TYPE_GRAFFITI_INBOX,
    );
    const sharedInboxServices = services.filter(
      (service) =>
        service.id.match(
          new RegExp(`^${DID_SERVICE_ID_GRAFFITI_SHARED_INBOX_PREFIX}\\d+$`),
        ) && service.type === DID_SERVICE_TYPE_GRAFFITI_INBOX,
    );

    if (
      !personalInboxService ||
      !storageBucketService ||
      sharedInboxServices.length === 0
    ) {
      throw new Error(
        `Required services not found in actor document for ${actor}`,
      );
    }

    // Massage the services into a list of endpoints with types
    const storageBucketEndpoint: string =
      serviceToEndpoint(storageBucketService);
    const personalInboxEndpoint: string =
      serviceToEndpoint(personalInboxService);
    const sharedInboxEndpoints: string[] =
      sharedInboxServices.map(serviceToEndpoint);
    const servicesWithTypes = [
      { endpoint: storageBucketEndpoint, type: "bucket" } as const,
      { endpoint: personalInboxEndpoint, type: "personal-inbox" } as const,
      ...sharedInboxEndpoints.map(
        (endpoint) =>
          ({
            endpoint,
            type: "shared-inbox",
          }) as const,
      ),
    ];

    // Fetch the authorization endpoints for each service
    const servicesWithAuthorizationEndpoints = await Promise.all(
      servicesWithTypes.map(async ({ endpoint, type }) => {
        const authorizationEndpoint = await (type === "bucket"
          ? this.services.storageBuckets.getAuthorizationEndpoint(endpoint)
          : this.services.inboxes.getAuthorizationEndpoint(endpoint));
        return { endpoint, authorizationEndpoint, type };
      }),
    );

    // Group the endpoints according to their authorization endpoints
    const servicesByAuthorizationMap: Map<
      string,
      {
        endpoint: string;
        type: "bucket" | "personal-inbox" | "shared-inbox";
      }[]
    > = new Map();
    servicesWithAuthorizationEndpoints.forEach(
      ({ authorizationEndpoint, endpoint, type }) => {
        if (!servicesByAuthorizationMap.has(authorizationEndpoint)) {
          servicesByAuthorizationMap.set(authorizationEndpoint, []);
        }
        servicesByAuthorizationMap
          .get(authorizationEndpoint)!
          .push({ endpoint, type });
      },
    );
    const servicesByAuthorization = [...servicesByAuthorizationMap.entries()];

    if (this.loginAttempts.current !== attempt) return;
    attempt.authorization = { actor, tokens: [], servicesByAuthorization };
    this.loginAttempts.save(attempt);

    // Start the login process with the first endpoint
    const [firstAuthorizationEndpoint, firstServices] =
      servicesByAuthorization[0];
    await this.services.authorization.login(
      firstAuthorizationEndpoint,
      attempt.id,
      firstServices.map((s) => s.endpoint),
      initialAuthorizationNavigation,
    );
  }

  protected async onLogin(event: unknown) {
    if (!(event instanceof CustomEvent)) return;
    const parsed = LoginEventDetailSchema.safeParse(event.detail);
    if (!parsed.success) return;

    const attempt = this.loginAttempts.current;
    // Authorization identifies the attempt, so a late callback cannot complete
    // a newer attempt for the same actor.
    if (!attempt || parsed.data.loginId !== attempt.id) return;
    try {
      await this.onLogin_(parsed.data, attempt);
    } catch (error) {
      this.handleLoginError(attempt, error, attempt.authorization?.actor);
    }
  }
  protected async onLogin_(
    loginDetail: infer_<typeof LoginEventDetailSchema>,
    attempt: LoginAttempt,
  ) {
    if (loginDetail.error) throw loginDetail.error;
    const token = loginDetail.token;
    const inProgressLogin = attempt.authorization;
    if (!inProgressLogin) throw new Error("No in-progress authorization found");
    const actor = inProgressLogin.actor;

    inProgressLogin.tokens.push(token);

    if (
      inProgressLogin.tokens.length ===
      inProgressLogin.servicesByAuthorization.length
    ) {
      // Build the completed session
      const services = inProgressLogin.servicesByAuthorization.flatMap(
        ([authorizationEndpoint, services], index) =>
          services.map((service) => ({
            token: inProgressLogin.tokens[index],
            serviceEndpoint: service.endpoint,
            authorizationEndpoint,
            type: service.type,
          })),
      );

      const session: StoredSession = {
        ...inProgressLogin,
        storageBucket: services.find((s) => s.type === "bucket")!,
        personalInbox: services.find((s) => s.type === "personal-inbox")!,
        sharedInboxes: services.filter((s) => s.type === "shared-inbox")!,
      };

      // A fresh authorization is a new login even when the actor is unchanged.
      this.sessionEvents.dispatchEvent(new CustomEvent("logout", { detail: { actor } }));
      this.updateSession(session);

      this.loginAttempts.finish(attempt, { session: { actor } });
    } else {
      this.loginAttempts.save(attempt);

      // Continue to the next authorization endpoint
      const [authorizationEndpoint, services] =
        inProgressLogin.servicesByAuthorization[inProgressLogin.tokens.length];
      await this.services.authorization.login(
        authorizationEndpoint,
        attempt.id,
        services.map((s) => s.endpoint),
        "replace",
      );
    }
  }

  async logout(actor: string, options?: Parameters<Graffiti["logout"]>[1]) {
    let detail: GraffitiLogoutEvent["detail"] = { actor, state: options?.state };
    try {
      const sessions = this.loggedInSessions;
      const session = sessions.find(session => session.actor === actor);
      if (!session) throw new Error(`No session found for actor ${actor}`);

      this.updateSession(session, true);
      if (!session.tokens.length) throw new Error("No tokens found in session");

      // Revoke every provider even if one is offline; other sites hold copies of
      // these same tokens. Report failures, rather than claiming a global logout.
      let failure: unknown;
      for (let index = session.tokens.length - 1; index >= 0; index--) {
        const [authorizationEndpoint] = session.servicesByAuthorization[index];
        try {
          await this.services.authorization.logout(authorizationEndpoint, session.tokens[index]);
        } catch (error) {
          if (!(error instanceof GraffitiErrorUnauthorized)) failure ??= error;
        }
      }
      if (failure) throw failure;
    } catch (error) {
      detail = { ...detail, error: error instanceof Error ? error : new Error(String(error)) };
    }
    this.sessionEvents.dispatchEvent(new CustomEvent("logout", { detail }));
  }

  protected get loggedInSessions(): StoredSession[] {
    if (typeof window === "undefined") return loggedInSessions_;
    const shared = readCookie(SESSION_STORAGE_KEY);
    if (!this.browserSessions) {
      this.browserSessions = parseSessions(shared ?? readLocalStorage(SESSION_STORAGE_KEY));
    } else if (shared !== undefined) {
      // Re-read accessible cookies on each operation, so another site's logout
      // takes effect locally. An empty list is authoritative, not a fallback.
      const current = parseSessions(shared);
      const removed = this.browserSessions.filter(s => !current.some(c => sameLogin(s, c)));
      if (removed.length) {
        // End replaced logins; do not switch an open instance to new credentials.
        this.browserSessions = this.browserSessions.filter(s => !removed.includes(s));
        writeLocalStorage(SESSION_STORAGE_KEY, JSON.stringify(current));
        for (const { actor } of removed) {
          this.sessionEvents.dispatchEvent(new CustomEvent("logout", { detail: { actor } }));
        }
      }
    }
    return this.browserSessions;
  }
  private updateSession(session: StoredSession, remove = false) {
    const update = (sessions: StoredSession[]) => remove
      ? sessions.filter(s => !sameLogin(s, session))
      : [...sessions.filter(s => s.actor !== session.actor), session];
    if (typeof window === "undefined") {
      loggedInSessions_ = update(loggedInSessions_);
      return;
    }
    this.browserSessions = update(this.browserSessions ?? this.loggedInSessions);
    // Read each store afresh. An old tab may remove its own revoked token, but
    // must not erase a newer login or another account saved by a different tab.
    const shared = readCookie(SESSION_STORAGE_KEY);
    if (shared !== undefined || !remove) {
      writeCookie(SESSION_STORAGE_KEY, JSON.stringify(update(parseSessions(shared))));
    }
    const local = readLocalStorage(SESSION_STORAGE_KEY);
    writeLocalStorage(SESSION_STORAGE_KEY, JSON.stringify(update(parseSessions(local))));
  }

  resolveSession(session: GraffitiSession): StoredSession {
    const wasKnown = this.browserSessions?.some(s => s.actor === session.actor);
    const resolvedSession = this.loggedInSessions.find(
      (s) => s.actor === session.actor,
    );
    if (!resolvedSession) {
      // Reading the shared cookie already announced a lost, known login.
      if (!wasKnown) this.forget(session.actor);
      throw new Error("Not logged in");
    }
    return resolvedSession;
  }
}
let loggedInSessions_: StoredSession[] = [];

const SESSION_STORAGE_KEY = "graffiti-sessions-logged-in";
const ServiceSessionSchema = object({
  token: string(),
  serviceEndpoint: url(),
  authorizationEndpoint: url(),
});

const StoredSessionSchema = extend(AuthorizationProgressSchema, {
  storageBucket: ServiceSessionSchema,
  personalInbox: ServiceSessionSchema,
  sharedInboxes: array(ServiceSessionSchema),
});

type StoredSession = infer_<typeof StoredSessionSchema>;

function parseSessions(data?: string): StoredSession[] {
  try { return array(StoredSessionSchema).parse(JSON.parse(data ?? "[]")); }
  catch { return []; }
}

function sameLogin(a?: StoredSession, b?: StoredSession) {
  return !!a && !!b && a.actor === b.actor &&
    JSON.stringify([a.servicesByAuthorization, a.tokens]) === JSON.stringify([b.servicesByAuthorization, b.tokens]);
}

function serviceToEndpoint(service: Service): string {
  if (typeof service.serviceEndpoint === "string")
    return service.serviceEndpoint;
  throw new Error(`Service endpoint for ${service.id} is not a string`);
}
