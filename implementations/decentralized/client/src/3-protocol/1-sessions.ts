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
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
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

      for (const session of this.loggedInSessions) {
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

      // Store the completed session
      const sessions = this.loggedInSessions;
      sessions.push(session);
      this.loggedInSessions = sessions;

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

      this.loggedInSessions = sessions.filter(session => session.actor !== actor);
      if (!session.tokens.length) throw new Error("No tokens found in session");

      // Revocation does not redirect, so each logout keeps its progress in this call.
      for (let index = session.tokens.length - 1; index >= 0; index--) {
        const [authorizationEndpoint] = session.servicesByAuthorization[index];
        await this.services.authorization.logout(authorizationEndpoint, session.tokens[index]);
      }
    } catch (error) {
      // Unauthorized errors can be treated as successful logouts.
      if (!(error instanceof GraffitiErrorUnauthorized)) {
        detail = { ...detail, error: error instanceof Error ? error : new Error(String(error)) };
      }
    }
    this.sessionEvents.dispatchEvent(new CustomEvent("logout", { detail }));
  }

  protected get loggedInSessions(): StoredSession[] {
    if (typeof window === "undefined") return loggedInSessions_;

    const data = getBrowserStorageItem(COOKIE_LOGGED_IN_SESSIONS_KEY);
    if (!data) return [];

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.error("Error parsing stored session data");
      removeBrowserStorageItem(COOKIE_LOGGED_IN_SESSIONS_KEY);
      return [];
    }

    const parsed = array(StoredSessionSchema).safeParse(json);
    if (!parsed.success) {
      console.error("Stored session data is invalid");
      removeBrowserStorageItem(COOKIE_LOGGED_IN_SESSIONS_KEY);
      return [];
    }
    return parsed.data;
  }
  protected set loggedInSessions(sessions: StoredSession[]) {
    if (typeof window === "undefined") {
      loggedInSessions_ = sessions;
      return;
    }

    setBrowserStorageItem(
      COOKIE_LOGGED_IN_SESSIONS_KEY,
      JSON.stringify(sessions),
    );
  }

  resolveSession(session: GraffitiSession): StoredSession {
    const resolvedSession = this.loggedInSessions.find(
      (s) => s.actor === session.actor,
    );
    if (!resolvedSession) {
      const logoutEvent: GraffitiLogoutEvent = new CustomEvent("logout", {
        detail: { actor: session.actor },
      });
      this.sessionEvents.dispatchEvent(logoutEvent);
      throw new Error("Not logged in");
    }
    return resolvedSession;
  }
}
let loggedInSessions_: StoredSession[] = [];

const COOKIE_LOGGED_IN_SESSIONS_KEY = "graffiti-sessions-logged-in";
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

function serviceToEndpoint(service: Service): string {
  if (typeof service.serviceEndpoint === "string")
    return service.serviceEndpoint;
  throw new Error(`Service endpoint for ${service.id} is not a string`);
}
