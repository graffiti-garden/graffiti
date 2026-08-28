import {
  Graffiti,
  GraffitiErrorForbidden,
  type GraffitiObjectStream,
} from "@graffiti-garden/api";
import type { Guard } from "./guard.js";

export type GraffitiMethod = {
  [Key in keyof Graffiti]: Graffiti[Key] extends (...args: never[]) => unknown
    ? Key
    : never;
}[keyof Graffiti] & string;

export type GraffitiArgs<Method extends GraffitiMethod> =
  Graffiti[Method] extends (...args: infer Args) => unknown ? Args : never;

type Method = (...args: unknown[]) => unknown;

/** A Graffiti implementation that delegates every protected call through a Guard. */
// @ts-expect-error Abstract methods are supplied dynamically by the proxy.
export class GuardedGraffiti extends Graffiti {
  readonly sessionEvents: EventTarget;

  constructor(
    private readonly graffiti: Graffiti,
    private readonly guard: Guard,
  ) {
    super();
    this.sessionEvents = graffiti.sessionEvents;
    const implementation: object = graffiti;
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (Reflect.has(target, property)) {
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }
        const value = Reflect.get(implementation, property);
        if (typeof value !== "function") return value;
        // Reflection loses Graffiti's method/argument relationship. Restore it
        // once here so the rest of the guard can retain the API's types.
        const method = String(property) as GraffitiMethod;
        const implementationMethod = value as Method;
        if (method === "discover" || method === "continueDiscover") {
          return (...args: unknown[]) =>
            this.stream(
              implementationMethod,
              args as
                | GraffitiArgs<"discover">
                | GraffitiArgs<"continueDiscover">,
            );
        }
        return (...args: unknown[]) =>
          this.call(
            method,
            implementationMethod,
            args as GraffitiArgs<typeof method>,
          );
      },
    });
  }

  private async call<CallMethod extends GraffitiMethod>(
    method: CallMethod,
    implementation: Method,
    args: GraffitiArgs<CallMethod>,
  ) {
    const request = await this.guard.authorize(method, args);
    let value: unknown;
    try {
      value = await implementation.apply(this.graffiti, args);
    } catch (error) {
      await this.recordAudit(() => this.guard.fail(request, error));
      throw error;
    }
    await this.recordAudit(() => this.guard.succeed(request, value));
    return value;
  }

  private stream(
    implementation: Method,
    args: GraffitiArgs<"discover"> | GraffitiArgs<"continueDiscover">,
  ): GraffitiObjectStream<{}> {
    const self = this;
    return (async function* () {
      // Queries and cursors need no permission. Only private objects crossing
      // this stream boundary are authorized and audited.
      const stream = implementation.apply(
        self.graffiti,
        args,
      ) as GraffitiObjectStream<{}>;
      let complete = false;
      try {
        while (true) {
          const next = await stream.next();
          if (next.done) {
            complete = true;
            return next.value;
          }
          const result = next.value;
          if (
            !result.error &&
            !result.tombstone &&
            result.object?.allowed != null
          ) {
            try {
              const request = await self.guard.authorizeDiscovered(
                args,
                result.object,
              );
              await self.recordAudit(() =>
                self.guard.succeed(request, result.object),
              );
            } catch (error) {
              if (!(error instanceof GraffitiErrorForbidden)) throw error;
              yield { error, origin: guardOrigin() };
              continue;
            }
          }
          yield result;
        }
      } finally {
        if (!complete) {
          await stream.return({ cursor: "" });
        }
      }
    })();
  }

  private async recordAudit(record: () => Promise<void>) {
    try {
      await record();
    } catch (error) {
      // The Graffiti call has already completed, so an audit failure must not
      // misreport its outcome and encourage a duplicate retry.
      console.error("Failed to finalize the Graffiti guard audit record.", error);
    }
  }
}

function guardOrigin() {
  return typeof window === "undefined"
    ? "graffiti-guard:"
    : window.location.origin;
}
