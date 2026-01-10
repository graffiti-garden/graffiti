import {
  discovery,
  randomState,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  tokenRevocation,
} from "openid-client";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

const AUTHORIZATION_ENDPOINT_METHOD_PREFIX_OAUTH2 = "oauth2:";
const LOCAL_STORAGE_OAUTH2_KEY = "graffiti-auth-oauth2-data";

export class Authorization {
  eventTarget: EventTarget = new EventTarget();

  constructor() {
    (async () => {
      // Allow listeners to be added first
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Complete the oauth flow
      await this.completeOauth();

      // Send an initialized event
      const initializedEvent: InitializedEvent = new CustomEvent("initialized");
      this.eventTarget.dispatchEvent(initializedEvent);
    })();
  }

  async login(...args: Parameters<typeof this.login_>): Promise<void> {
    try {
      this.login_(...args);
    } catch (e) {
      const error = e instanceof Error ? e : new Error("Unknown error");
      const detail: LoginEvent["detail"] = { loginId: args[1], error };
      this.eventTarget.dispatchEvent(new CustomEvent("login", { detail }));
    }
  }
  protected async login_(
    authorizationEndpoint: string,
    loginId: string,
    serviceEndpoints: string[],
  ): Promise<void> {
    const configuration = await this.getAuthorizationConfiguration(
      authorizationEndpoint,
    );

    const scope = serviceEndpoints.map(encodeURIComponent).join(" ");
    const state = randomState();

    let redirectUri: string;
    let waitForCallback: Promise<void> | undefined = undefined;
    if (typeof window !== "undefined") {
      // If in a browser, prepare for a redirect by
      // storing the configuration, expected state,
      // current URL, and endpoints in local storage
      redirectUri = window.location.href;
      const data: z.infer<typeof OAuth2LoginDataSchema> = {
        loginId,
        redirectUri,
        authorizationEndpoint,
        state,
        serviceEndpoints,
      };
      window.localStorage.setItem(
        LOCAL_STORAGE_OAUTH2_KEY,
        JSON.stringify(data),
      );
    } else {
      // Otherwise, in node, start a local server to receive the callback
      const http = await import("node:http");
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

            throw e;
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
    const redirectTo = buildAuthorizationUrl(configuration, {
      scope,
      redirect_uri: redirectUri,
      state,
    });

    // Either redirect (browser) or print the URL and wait (node)
    if (typeof window !== "undefined") {
      window.location.href = redirectTo.toString();
    } else {
      console.log("Please open the following URL in your browser:");
      console.log(redirectTo.toString());
      await waitForCallback;
    }
  }

  protected async completeOauth() {
    if (typeof window === "undefined") return;

    // Look in local storage to see if we have a pending login
    const data = window.localStorage.getItem(LOCAL_STORAGE_OAUTH2_KEY);
    if (!data) return;

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.error("Invalid OAuth2 login data in local storage.");
      window.localStorage.removeItem(LOCAL_STORAGE_OAUTH2_KEY);
      return;
    }

    const parseResult = OAuth2LoginDataSchema.safeParse(json);
    if (!parseResult.success) {
      console.error(
        "Invalid OAuth2 login data structure in local storage.",
        parseResult.error,
      );
      window.localStorage.removeItem(LOCAL_STORAGE_OAUTH2_KEY);
      return;
    }

    const {
      loginId,
      redirectUri,
      authorizationEndpoint,
      state,
      serviceEndpoints,
    } = parseResult.data;

    try {
      // Make sure that we redirected back to the correct page
      const expectedUrl = new URL(redirectUri);
      const callbackUrl = new URL(window.location.href);
      if (
        expectedUrl.pathname !== callbackUrl.pathname ||
        expectedUrl.hash !== callbackUrl.hash
      )
        return;

      // Make sure it is actually an oauth call
      const params = callbackUrl.searchParams;
      if (!params.has("code") && !params.has("error")) return;

      // Restore the query parameters to the expected URL,
      // removing the code, state, and error parameters
      window.history.replaceState({}, document.title, expectedUrl.toString());
      window.localStorage.removeItem(LOCAL_STORAGE_OAUTH2_KEY);

      const configuration = await this.getAuthorizationConfiguration(
        authorizationEndpoint,
      );

      await this.onCallbackUrl({
        loginId,
        callbackUrl,
        configuration,
        expectedState: state,
        serviceEndpoints,
      });
    } catch (e) {
      const error = e instanceof Error ? e : new Error("Unknown error");
      const detail: LoginEvent["detail"] = { loginId, error };
      this.eventTarget.dispatchEvent(new CustomEvent("login", { detail }));
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
    try {
      this.logout_(authorizationEndpoint, token);
    } catch (e) {
      const error = e instanceof Error ? e : new Error("Unknown error");
      const detail: LogoutEvent["detail"] = { token, error };
      this.eventTarget.dispatchEvent(new CustomEvent("logout", { detail }));
    }
  }
  protected async logout_(
    authorizationEndpoint: string,
    token: string,
  ): Promise<void> {
    const configuration = await this.getAuthorizationConfiguration(
      authorizationEndpoint,
    );
    await tokenRevocation(configuration, token);
    this.eventTarget.dispatchEvent(
      new CustomEvent("logout", { detail: { token } }),
    );
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

export const LoginEventDetailSchema = z
  .object({
    loginId: z.string(),
  })
  .and(
    z.union([
      z.object({ token: z.string(), error: z.undefined().optional() }),
      z.object({ error: z.instanceof(Error) }),
    ]),
  );

export const LogoutEventDetailSchema = z.object({
  token: z.string(),
  error: z.instanceof(Error).optional(),
});

export const InitializedEventDetailSchema = z
  .object({
    error: z.instanceof(Error).optional(),
  })
  .optional()
  .nullable();

export type LoginEvent = CustomEvent<z.infer<typeof LoginEventDetailSchema>>;
export type LogoutEvent = CustomEvent<z.infer<typeof LogoutEventDetailSchema>>;
export type InitializedEvent = CustomEvent<
  z.infer<typeof InitializedEventDetailSchema>
>;

const OAuth2LoginDataSchema = z.object({
  loginId: z.string(),
  redirectUri: z.url(),
  authorizationEndpoint: z.url(),
  state: z.string(),
  serviceEndpoints: z.array(z.url()),
});

async function test() {
  const auth = new Authorization();
  const authorizationEndpoint = "oauth2:https://graffiti.actor";
  auth.eventTarget.addEventListener("initialized", (e) => {
    if (!(e instanceof CustomEvent)) return;
    const parsed = InitializedEventDetailSchema.parse(e.detail);
    if (parsed?.error) {
      console.error("initialization error:", parsed.error);
    } else {
      console.log("initialized");
    }
  });
  auth.eventTarget.addEventListener("login", async (e) => {
    if (!(e instanceof CustomEvent)) return;
    const parsed = LoginEventDetailSchema.parse(e.detail);
    if (parsed.error) {
      console.error("login error:", parsed.error);
    } else {
      console.log("login success:", parsed);
      console.log("logging out...");
      await auth.logout(authorizationEndpoint, parsed.token);
    }
  });
  auth.eventTarget.addEventListener("logout", (e) => {
    if (!(e instanceof CustomEvent)) return;
    const parsed = LogoutEventDetailSchema.parse(e.detail);
    if (parsed.error) {
      console.error("logout error:", parsed.error);
    } else {
      console.log("logout success!");
    }
  });
  await auth.login(authorizationEndpoint, "test-login", []);

  await new Promise((resolve) => setTimeout(resolve, 10000));
}
test();
