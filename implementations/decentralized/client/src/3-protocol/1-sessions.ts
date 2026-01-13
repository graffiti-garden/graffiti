import {
  type Graffiti,
  type GraffitiLoginEvent,
  type GraffitiLogoutEvent,
  type GraffitiSession,
  type GraffitiSessionInitializedEvent,
} from "@graffiti-garden/api";
import { DecentralizedIdentifiers } from "../1-services/1-dids";
import {
  InitializedEventDetailSchema,
  LoginEventDetailSchema,
  LogoutEventDetailSchema,
  type Authorization,
} from "../1-services/2-authorization";
import { StorageBuckets } from "../1-services/3-storage-buckets";
import type { Inboxes } from "../1-services/4-inboxes";
import type { Service } from "did-resolver";
import { z } from "zod";

export const DID_SERVICE_TYPE_GRAFFITI_INBOX = "GraffitiInbox";
export const DID_SERVICE_TYPE_GRAFFITI_STORAGE_BUCKET = "GraffitiStorageBucket";
export const DID_SERVICE_ID_GRAFFITI_PERSONAL_INBOX = "#graffitiPersonalInbox";
export const DID_SERVICE_ID_GRAFFITI_STORAGE_BUCKET = "#graffitiStorageBucket";
export const DID_SERVICE_ID_GRAFFITI_SHARED_INBOX_PREFIX =
  "#graffitiSharedInbox_";

export class Sessions {
  sessionEvents: Graffiti["sessionEvents"] = new EventTarget();

  constructor(
    protected readonly services: {
      readonly dids: DecentralizedIdentifiers;
      readonly authorization: Authorization;
      readonly storageBuckets: StorageBuckets;
      readonly inboxes: Inboxes;
    },
  ) {
    const initializedPromise = new Promise<void>((resolve) => {
      this.services.authorization.eventTarget.addEventListener(
        "initialized",
        (e) => {
          if (!(e instanceof CustomEvent)) return;
          const parsed = InitializedEventDetailSchema.safeParse(e.detail);
          if (!parsed.success) return;
          const error = parsed.data?.error;
          if (error) console.log(error);
          resolve();
        },
      );
    });
    this.services.authorization.eventTarget.addEventListener(
      "login",
      this.onLogin.bind(this),
    );
    this.services.authorization.eventTarget.addEventListener(
      "logout",
      this.onLogout.bind(this),
    );

    (async () => {
      // Allow listeners to be added before dispatching events
      await new Promise((resolve) => setTimeout(resolve, 0));

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
      );
      this.sessionEvents.dispatchEvent(initializedEvent);
    })();
  }

  protected inProgressLogin: z.infer<typeof InProgressSchema> | undefined =
    undefined;
  protected inProgressLogout: z.infer<typeof InProgressSchema> | undefined =
    undefined;

  async login(actor: string) {
    try {
      await this.login_(actor);
    } catch (e) {
      const loginEvent: GraffitiLoginEvent = new CustomEvent("login", {
        detail: {
          error: e instanceof Error ? e : new Error(String(e)),
          session: { actor },
        },
      });
      this.sessionEvents.dispatchEvent(loginEvent);
    }
  }
  protected async login_(actor: string) {
    // First look to see if we're already logged in
    const existingSession = this.loggedInSessions.find(
      (session) => session.actor === actor,
    );
    if (existingSession) {
      this.sessionEvents.dispatchEvent(
        new CustomEvent("login", { detail: { session: { actor } } }),
      );
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

    const session: GraffitiSession = { actor };

    const inProgressLogin: z.infer<typeof InProgressSchema> = {
      ...session,
      tokens: [],
      servicesByAuthorization,
    };

    if (typeof window !== "undefined") {
      // Store the in-progress session in localStorage
      window.localStorage.setItem(
        LOCAL_STORAGE_IN_PROGRESS_LOGIN_KEY,
        JSON.stringify(inProgressLogin),
      );
    } else {
      this.inProgressLogin = inProgressLogin;
    }

    // Start the login process with the first endpoint
    const [firstAuthorizationEndpoint, firstServices] =
      servicesByAuthorization[0];
    await this.services.authorization.login(
      firstAuthorizationEndpoint,
      actor,
      firstServices.map((s) => s.endpoint),
    );
  }

  protected async onLogin(event: unknown) {
    if (!(event instanceof CustomEvent)) return;
    const parsed = LoginEventDetailSchema.safeParse(event.detail);
    if (!parsed.success) return;

    const actor = parsed.data.loginId;

    try {
      await this.onLogin_(parsed.data);
    } catch (e) {
      const LoginEvent: GraffitiLoginEvent = new CustomEvent("login", {
        detail: {
          error: e instanceof Error ? e : new Error(String(e)),
          session: { actor },
        },
      });
      this.sessionEvents.dispatchEvent(LoginEvent);
    }
  }
  protected async onLogin_(
    loginDetail: z.infer<typeof LoginEventDetailSchema>,
  ) {
    if (loginDetail.error) throw loginDetail.error;

    const token = loginDetail.token;
    const actor = loginDetail.loginId;

    // Lookup the in-progress session
    let inProgressLogin: z.infer<typeof InProgressSchema>;
    if (typeof window !== "undefined") {
      const inProgressLoginString = window.localStorage.getItem(
        LOCAL_STORAGE_IN_PROGRESS_LOGIN_KEY,
      );
      if (!inProgressLoginString) {
        throw new Error("No in-progress login found");
      }

      const json = JSON.parse(inProgressLoginString);
      inProgressLogin = InProgressSchema.parse(json);
    } else {
      if (!this.inProgressLogin) {
        throw new Error("No in-progress login found");
      }
      inProgressLogin = this.inProgressLogin;
    }

    if (inProgressLogin.actor !== actor) {
      throw new Error("Actor mismatch in login response - concurrent logins?");
    }

    inProgressLogin.tokens.push(token);

    if (
      inProgressLogin.tokens.length ===
      inProgressLogin.servicesByAuthorization.length
    ) {
      // Login complete!
      if (typeof window === "undefined") {
        this.inProgressLogin = undefined;
      } else {
        window.localStorage.removeItem(LOCAL_STORAGE_IN_PROGRESS_LOGIN_KEY);
      }

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

      // Return the completed session
      const loginEvent: GraffitiLoginEvent = new CustomEvent("login", {
        detail: { session: { actor } },
      });
      this.sessionEvents.dispatchEvent(loginEvent);
    } else {
      // Store the in progress and continue
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LOCAL_STORAGE_IN_PROGRESS_LOGIN_KEY,
          JSON.stringify(inProgressLogin),
        );
      } else {
        this.inProgressLogin = inProgressLogin;
      }

      // Continue to the next authorization endpoint
      const [authorizationEndpoint, services] =
        inProgressLogin.servicesByAuthorization[inProgressLogin.tokens.length];
      await this.services.authorization.login(
        authorizationEndpoint,
        actor,
        services.map((s) => s.endpoint),
      );
    }
  }

  async logout(actor: string) {
    try {
      await this.logout_(actor);
    } catch (e) {
      const logoutEvent: GraffitiLogoutEvent = new CustomEvent("logout", {
        detail: {
          error: e instanceof Error ? e : new Error(String(e)),
          actor,
        },
      });
      this.sessionEvents.dispatchEvent(logoutEvent);
    }
  }
  protected async logout_(actor: string) {
    const session = this.loggedInSessions.find(
      (session) => session.actor === actor,
    );
    if (!session) {
      throw new Error(`No session found for actor ${actor}`);
    }

    // Remove the session(s)
    this.loggedInSessions = this.loggedInSessions.filter(
      (session) => session.actor !== actor,
    );

    // Begin the logout
    const token = session.tokens.pop();
    if (!token) {
      throw new Error("No tokens found in session");
    }
    // Store the in progress logout
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        LOCAL_STORAGE_IN_PROGRESS_LOGOUT_KEY,
        JSON.stringify(session),
      );
    } else {
      this.inProgressLogout = session;
    }
    const [authorizationEndpoint, _] =
      session.servicesByAuthorization[session.tokens.length];
    await this.services.authorization.logout(
      authorizationEndpoint,
      actor,
      token,
    );
  }

  protected async onLogout(event: unknown) {
    if (!(event instanceof CustomEvent)) return;
    const parsed = LogoutEventDetailSchema.safeParse(event.detail);
    if (!parsed.success) return;

    const actor = parsed.data.logoutId;

    try {
      await this.onLogout_(parsed.data);
    } catch (e) {
      const logoutEvent: GraffitiLogoutEvent = new CustomEvent("logout", {
        detail: {
          error: e instanceof Error ? e : new Error(String(e)),
          actor,
        },
      });
      this.sessionEvents.dispatchEvent(logoutEvent);
    }
  }
  protected async onLogout_(
    logoutDetail: z.infer<typeof LogoutEventDetailSchema>,
  ) {
    if (logoutDetail.error) throw logoutDetail.error;

    const actor = logoutDetail.logoutId;

    // Lookup the in-progress session
    let inProgressLogout: z.infer<typeof InProgressSchema>;
    if (typeof window !== "undefined") {
      const inProgressLogoutString = window.localStorage.getItem(
        LOCAL_STORAGE_IN_PROGRESS_LOGOUT_KEY,
      );
      if (!inProgressLogoutString) {
        throw new Error("No in-progress logout found");
      }

      const json = JSON.parse(inProgressLogoutString);
      inProgressLogout = InProgressSchema.parse(json);
    } else {
      if (!this.inProgressLogout) {
        throw new Error("No in-progress logout found");
      }
      inProgressLogout = this.inProgressLogout;
    }

    if (inProgressLogout.actor !== actor) {
      throw new Error(
        "Actor mismatch in logout response - concurrent logouts?",
      );
    }

    const token = inProgressLogout.tokens.pop();
    if (!token) {
      // Logout complete
      if (typeof window === "undefined") {
        this.inProgressLogout = undefined;
      } else {
        window.localStorage.removeItem(LOCAL_STORAGE_IN_PROGRESS_LOGOUT_KEY);
      }

      const logoutEvent: GraffitiLogoutEvent = new CustomEvent("logout", {
        detail: { actor },
      });
      this.sessionEvents.dispatchEvent(logoutEvent);
    } else {
      // Store the in progress and continue
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          LOCAL_STORAGE_IN_PROGRESS_LOGOUT_KEY,
          JSON.stringify(inProgressLogout),
        );
      } else {
        this.inProgressLogout = inProgressLogout;
      }

      // Continue to the next authorization endpoint
      const [authorizationEndpoint, _] =
        inProgressLogout.servicesByAuthorization[
          inProgressLogout.tokens.length
        ];
      await this.services.authorization.logout(
        authorizationEndpoint,
        actor,
        token,
      );
    }
  }

  protected loggedInSessions_: StoredSession[] = [];
  protected get loggedInSessions(): StoredSession[] {
    if (typeof window === "undefined") return this.loggedInSessions_;

    const data = window.localStorage.getItem(
      LOCAL_STORAGE_LOGGED_IN_SESSIONS_KEY,
    );
    if (!data) return [];

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.error("Error parsing stored session data");
      window.localStorage.removeItem(LOCAL_STORAGE_LOGGED_IN_SESSIONS_KEY);
      return [];
    }

    const parsed = z.array(StoredSessionSchema).safeParse(json);
    if (!parsed.success) {
      console.error("Stored session data is invalid");
      window.localStorage.removeItem(LOCAL_STORAGE_LOGGED_IN_SESSIONS_KEY);
      return [];
    }
    return parsed.data;
  }
  protected set loggedInSessions(sessions: StoredSession[]) {
    if (typeof window === "undefined") {
      this.loggedInSessions_ = sessions;
      return;
    }

    window.localStorage.setItem(
      LOCAL_STORAGE_LOGGED_IN_SESSIONS_KEY,
      JSON.stringify(sessions),
    );
  }

  resolveSession(session: GraffitiSession): StoredSession | undefined {
    return this.loggedInSessions.find((s) => s.actor === session.actor);
  }
}

const LOCAL_STORAGE_IN_PROGRESS_LOGIN_KEY = "graffiti-login-in-progress";
const LOCAL_STORAGE_IN_PROGRESS_LOGOUT_KEY = "graffiti-logout-in-progress";
const LOCAL_STORAGE_LOGGED_IN_SESSIONS_KEY = "graffiti-sessions-logged-in";

const GraffitiSessionSchema = z.object({
  actor: z.url(),
});

const ServiceSessionSchema = z.object({
  token: z.string(),
  serviceEndpoint: z.url(),
  authorizationEndpoint: z.url(),
});

const ServicesByAuthorizationSchema = z.array(
  z.tuple([
    z.url(), // Authorization endpoint
    z.array(
      z.object({
        endpoint: z.url(), // Service endpoint
        type: z.enum(["bucket", "personal-inbox", "shared-inbox"]),
      }),
    ),
  ]),
);

const InProgressSchema = GraffitiSessionSchema.extend({
  tokens: z.array(z.string()),
  servicesByAuthorization: ServicesByAuthorizationSchema,
});

const StoredSessionSchema = InProgressSchema.extend({
  storageBucket: ServiceSessionSchema,
  personalInbox: ServiceSessionSchema,
  sharedInboxes: z.array(ServiceSessionSchema),
});

type StoredSession = z.infer<typeof StoredSessionSchema>;

function serviceToEndpoint(service: Service): string {
  if (typeof service.serviceEndpoint === "string")
    return service.serviceEndpoint;
  throw new Error(`Service endpoint for ${service.id} is not a string`);
}
