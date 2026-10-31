import type { GraffitiLoginEvent } from "@graffiti-garden/api";
import { array, enum as enum_, object, optional, string, tuple, url, type infer as infer_ } from "zod/mini";

const LOGIN_ATTEMPT_KEY = "graffiti-login-attempt";

/** One explicit login, including retries and redirects; never a restored session. */
export class LoginAttempts {
  current: LoginAttempt | undefined;
  onError?: (attempt: LoginAttempt, error: Error, actor?: string) => void;

  constructor(
    private events: EventTarget,
    private onComplete?: (attempt: LoginAttempt) => void,
  ) {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(LOGIN_ATTEMPT_KEY);
    if (saved) {
      try { this.current = LoginAttemptSchema.parse(JSON.parse(saved)); }
      catch { window.sessionStorage.removeItem(LOGIN_ATTEMPT_KEY); }
    }
  }

  begin(requestId?: string): LoginAttempt {
    if (this.current) throw new Error("A login is already in progress");
    this.current = { id: crypto.randomUUID(), requestId };
    return this.current;
  }

  save(attempt: LoginAttempt) {
    if (this.current !== attempt) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(LOGIN_ATTEMPT_KEY, JSON.stringify(attempt));
    }
  }

  /** Clear the current attempt without emitting a login result. */
  discard() {
    this.current = undefined;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
    }
  }

  complete(
    attempt: LoginAttempt,
    detail: GraffitiLoginEvent["detail"],
  ) {
    if (this.current !== attempt) return;
    this.discard();
    this.onComplete?.(attempt);
    this.events.dispatchEvent(new CustomEvent("login", {
      detail: {
        ...detail,
        requestId: attempt.requestId,
      },
    }));
  }

  fail(attempt: LoginAttempt, error: unknown, actor?: string) {
    if (this.current !== attempt) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    attempt.authorization = undefined;
    if (this.onError) {
      this.save(attempt);
      this.onError(attempt, failure, actor);
    } else {
      this.complete(attempt, {
        error: failure,
        session: actor ? { actor } : undefined,
      });
    }
  }

}

// Each authorization endpoint maps to its services (buckets and inboxes).
const ServicesByAuthorizationSchema = array(
  tuple([
    url(), // Authorization endpoint
    array(
      object({
        endpoint: url(), // Service endpoint
        type: enum_(["bucket", "personal-inbox", "shared-inbox"]),
      }),
    ),
  ]),
);

export const AuthorizationProgressSchema = object({
  actor: url(),
  // tokens[i] authorizes the services in servicesByAuthorization[i].
  tokens: array(string()),
  servicesByAuthorization: ServicesByAuthorizationSchema,
});

const LoginAttemptSchema = object({
  id: string(),
  requestId: optional(string()),
  authorization: optional(AuthorizationProgressSchema),
});

export type LoginAttempt = infer_<typeof LoginAttemptSchema>;
