import {
  discovery,
  randomState,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  tokenRevocation,
} from "openid-client";
import {
  type infer as infer_,
  string,
  url,
  array,
  object,
  optional,
  nullable,
  instanceof as instanceof_,
  undefined as undefined_,
  intersection,
  union,
} from "zod/mini";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

const AUTHORIZATION_ENDPOINT_METHOD_PREFIX_OAUTH2 = "oauth2:";
const SESSION_STORAGE_OAUTH2_KEY = "graffiti-auth-oauth2-data";

export class Authorization {
  eventTarget: EventTarget = new EventTarget();
  private activeLoginId?: string;
  readonly completingLogin: boolean;

  constructor() {
    // Extract oauth redirect synchronously so the route
    // can be changed before any SPA routers (e.g. vue router)
    // start messing with things
    const oauthPromise = this.completeOauth();
    // completeOauth() is intentionally not async. If the oauth
    // returns a promise rather than undefined it means it is completing a login
    this.completingLogin = oauthPromise !== undefined;

    (async () => {
      // Allow listeners to be added first
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Complete the oauth flow
      await oauthPromise;

      // Send an initialized event
      const initializedEvent: InitializedEvent = new CustomEvent("initialized");
      this.eventTarget.dispatchEvent(initializedEvent);
    })();
  }

  async login(...args: Parameters<typeof this.login_>): Promise<void> {
    this.activeLoginId = args[1];
    try {
      await this.login_(...args);
    } catch (e) {
      if (this.activeLoginId !== args[1]) return;
      const error = e instanceof Error ? e : new Error("Unknown error");
      const detail: LoginEvent["detail"] = { loginId: args[1], error };
      this.eventTarget.dispatchEvent(new CustomEvent("login", { detail }));
    }
  }
  protected async login_(
    authorizationEndpoint: string,
    loginId: string,
    serviceEndpoints: string[],
    navigation: "assign" | "replace",
  ): Promise<void> {
    const configuration = await this.getAuthorizationConfiguration(
      authorizationEndpoint,
    );

    if (this.activeLoginId !== loginId) return;

    const scope = serviceEndpoints.map(encodeURIComponent).join(" ");
    const state = randomState();

    let redirectUri: string;
    let waitForCallback: Promise<void> | undefined = undefined;
    if (typeof window !== "undefined") {
      // If in a browser, prepare for a redirect by
      // storing the configuration, expected state,
      // current URL, and endpoints in session storage
      redirectUri = window.location.href;
      const data: infer_<typeof OAuth2LoginDataSchema> = {
        loginId,
        redirectUri,
        authorizationEndpoint,
        state,
        serviceEndpoints,
      };
      window.sessionStorage.setItem(
        SESSION_STORAGE_OAUTH2_KEY,
        JSON.stringify(data),
      );
    } else {
      // Otherwise, in node, start a local server to receive the callback
      const http = await import("node:http").catch((e) => {
        throw new Error(
          "Unrecognized environment: cannot find window or node:http",
        );
      });
      const server = http.createServer();

      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "::1", resolve);
        });
      } catch (e) {
        try {
          server.close();
        } catch {}
        throw new Error("Failed to start local oauth callback server.");
      }

      const address = server.address();
      if (!address) {
        try {
          server.close();
        } catch {}
        throw new Error("Failed to get local oauth callback server address.");
      }
      redirectUri =
        typeof address === "string"
          ? `http://${address}`
          : `http://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${address.port}`;

      // Wait for a callback request
      waitForCallback = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            try {
              server.close();
            } catch {}
            reject("Oauth callback timed out.");
          },
          5 * 60 * 1000, // 5 minutes
        );

        const sockets = new Set<Socket>();
        server.on("connection", (socket: Socket) => {
          sockets.add(socket);
          socket.on("close", () => {
            sockets.delete(socket);
          });
        });

        // Set up the actual request handler
        const onRequest = async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const callbackUrl = new URL(req.url ?? "/", redirectUri);
            await this.onCallbackUrl({
              loginId,
              callbackUrl,
              configuration,
              expectedState: state,
              serviceEndpoints,
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "text/plain");
            res.end("You may now close this window.");
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain");
            res.end("Error processing OAuth callback.");

            reject(e);
          } finally {
            clearTimeout(timeout);
            server.off("request", onRequest);

            for (const socket of sockets) {
              socket.destroy();
            }

            server.close(() => resolve());
          }
        };

        server.on("request", onRequest);
      });
    }

    // Construct the authorization URL
    const redirectUriStripped = new URL(redirectUri);
    redirectUriStripped.hash = "";
    redirectUriStripped.search = "";

    const redirectTo = buildAuthorizationUrl(configuration, {
      scope,
      redirect_uri: redirectUriStripped.toString(),
      state,
    });

    // Either redirect (browser) or print the URL and wait (node)
    if (typeof window !== "undefined") {
      if (navigation === "assign") {
        window.location.assign(redirectTo.toString());
      } else {
        window.location.replace(redirectTo.toString());
      }
    } else {
      console.log("Please open the following URL in your browser:");
      console.log(redirectTo.toString());
      await waitForCallback;
    }
  }

  endLogin(loginId: string) {
    if (this.activeLoginId !== loginId) return;
    this.activeLoginId = undefined;
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_STORAGE_OAUTH2_KEY);
  }

  protected completeOauth() {
    if (typeof window === "undefined") return;

    // Look in session storage to see if we have a pending login
    const data = window.sessionStorage.getItem(SESSION_STORAGE_OAUTH2_KEY);
    if (!data) return;

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.error("Invalid OAuth2 login data in session storage.");
      window.sessionStorage.removeItem(SESSION_STORAGE_OAUTH2_KEY);
      return;
    }

    const parseResult = OAuth2LoginDataSchema.safeParse(json);
    if (!parseResult.success) {
      console.error(
        "Invalid OAuth2 login data structure in session storage.",
        parseResult.error,
      );
      window.sessionStorage.removeItem(SESSION_STORAGE_OAUTH2_KEY);
      return;
    }

    const {
      loginId,
      redirectUri,
      authorizationEndpoint,
      state,
      serviceEndpoints,
    } = parseResult.data;
    this.activeLoginId = loginId;

    try {
      // Make sure that we redirected back to the correct page
      const expectedUrl = new URL(redirectUri);
      const callbackUrl = new URL(window.location.href);
      if (expectedUrl.pathname !== callbackUrl.pathname) return;
      // Make sure it is actually an oauth call
      const params = callbackUrl.searchParams;
      if (!params.has("code") && !params.has("error")) return;

      // Restore the hash and query parameters to the expected URL,
      // removing the code, state, and error parameters
      window.history.replaceState({}, document.title, expectedUrl.toString());
      window.sessionStorage.removeItem(SESSION_STORAGE_OAUTH2_KEY);

      return new Promise<void>((resolve) => setTimeout(resolve, 0))
        .then(() => this.getAuthorizationConfiguration(authorizationEndpoint))
        .then((configuration) =>
          this.onCallbackUrl({
            loginId,
            callbackUrl,
            configuration,
            expectedState: state,
            serviceEndpoints,
          }),
        )
        .catch((e) => {
          if (this.activeLoginId !== loginId) return;
          const error = e instanceof Error ? e : new Error("Unknown error");
          const detail: LoginEvent["detail"] = { loginId, error };
          this.eventTarget.dispatchEvent(new CustomEvent("login", { detail }));
        });
    } catch (e) {
      console.error(e);
    }
  }

  protected async onCallbackUrl(args: {
    loginId: string;
    callbackUrl: URL;
    configuration: any;
    expectedState: string;
    serviceEndpoints: string[];
  }) {
    const {
      loginId,
      callbackUrl,
      configuration,
      expectedState,
      serviceEndpoints,
    } = args;

    const response = await authorizationCodeGrant(configuration, callbackUrl, {
      expectedState,
    });

    if (this.activeLoginId !== loginId) return;
    const token = response.access_token;
    const scope = response.scope;
    const grantedEndpoints =
      scope?.split(" ").map(decodeURIComponent) || serviceEndpoints;

    // Make sure granted endpoints cover the requested endpoints
    if (
      !serviceEndpoints.every((endpoint) => grantedEndpoints.includes(endpoint))
    ) {
      throw new Error("Not all requested service endpoints were granted.");
    }

    // Send a logged in event
    const loginEvent: LoginEvent = new CustomEvent("login", {
      detail: {
        loginId,
        token,
      },
    });
    this.eventTarget.dispatchEvent(loginEvent);
  }

  async logout(authorizationEndpoint: string, token: string): Promise<void> {
    const configuration = await this.getAuthorizationConfiguration(authorizationEndpoint);
    await tokenRevocation(configuration, token);
  }

  protected async getAuthorizationConfiguration(
    authorizationEndpoint: string,
  ): Promise<any> {
    // Parse the authorization endpoint
    if (
      !authorizationEndpoint.startsWith(
        AUTHORIZATION_ENDPOINT_METHOD_PREFIX_OAUTH2,
      )
    ) {
      throw new Error(
        `Unrecognized authorization endpoint method: ${authorizationEndpoint}`,
      );
    }
    const issuer = authorizationEndpoint.slice(
      AUTHORIZATION_ENDPOINT_METHOD_PREFIX_OAUTH2.length,
    );

    // Look up the oauth configuration
    let issuerUrl: URL;
    try {
      issuerUrl = new URL(issuer);
    } catch (e) {
      throw new Error("Invalid issuer URL.");
    }

    return await discovery(issuerUrl, "graffiti-client");
  }
}

export const LoginEventDetailSchema = intersection(
  object({
    loginId: string(),
  }),
  union([
    object({ token: string(), error: optional(undefined_()) }),
    object({ error: instanceof_(Error) }),
  ]),
);

export const InitializedEventDetailSchema = optional(
  nullable(
    object({
      error: optional(instanceof_(Error)),
    }),
  ),
);

export type LoginEvent = CustomEvent<infer_<typeof LoginEventDetailSchema>>;
export type InitializedEvent = CustomEvent<
  infer_<typeof InitializedEventDetailSchema>
>;

const OAuth2LoginDataSchema = object({
  loginId: string(),
  redirectUri: url(),
  authorizationEndpoint: url(),
  state: string(),
  serviceEndpoints: array(url()),
});
