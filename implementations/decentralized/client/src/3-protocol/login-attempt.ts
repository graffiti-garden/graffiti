import type { GraffitiLoginEvent } from "@graffiti-garden/api";
import { array, enum as enum_, object, optional, string, tuple, url, type infer as infer_ } from "zod/mini";

import { PendingLoginStorage } from "../1-services/pending-login-storage";

const pendingAttempts = new PendingLoginStorage("graffiti-pending-attempt:");
export const LOGIN_ATTEMPT_PARAM = "graffitiLoginAttempt";

/** One explicit login, including retries and redirects; never a restored session. */
export class LoginAttempts {
  current: LoginAttempt | undefined;

  constructor(
    private events: EventTarget,
    private onFinish?: (attempt: LoginAttempt) => void,
  ) {}

  restore(id: string) {
    const parsed = LoginAttemptSchema.safeParse(pendingAttempts.load(id));
    if (parsed.success && parsed.data.id === id) this.current = parsed.data;
  }

  returnUrl(attempt: LoginAttempt) {
    const url = new URL(window.location.href);
    url.searchParams.set(LOGIN_ATTEMPT_PARAM, attempt.id);
    return url.toString();
  }

  begin(state?: string): LoginAttempt {
    if (this.current) throw new Error("A login is already in progress");
    this.current = { id: crypto.randomUUID(), state };
    return this.current;
  }

  save(attempt: LoginAttempt) {
    if (this.current !== attempt) return;
    pendingAttempts.save(attempt.id, attempt);
  }

  finish(
    attempt: LoginAttempt,
    detail: GraffitiLoginEvent["detail"],
  ) {
    if (this.current !== attempt) return;
    pendingAttempts.remove(attempt.id);
    this.current = undefined;
    this.onFinish?.(attempt);
    this.events.dispatchEvent(new CustomEvent("login", {
      detail: {
        ...detail,
        state: attempt.state,
      },
    }));
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
  state: optional(string()),
  authorization: optional(AuthorizationProgressSchema),
});

export type LoginAttempt = infer_<typeof LoginAttemptSchema>;
