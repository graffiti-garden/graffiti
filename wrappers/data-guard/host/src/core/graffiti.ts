import { Graffiti, type GraffitiObjectStream } from "@graffiti-garden/api";
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
        // A cursor is itself the capability to continue a discovery, so a
        // continuation bypasses the guard entirely.
        if (method === "continueDiscover") {
          return implementationMethod.bind(implementation);
        }
        if (method === "discover") {
          return (...args: unknown[]) =>
            this.stream(
              implementationMethod,
              args as GraffitiArgs<"discover">,
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
    await this.recordAudit(() => this.guard.succeed(request, method, value));
    return value;
  }

  private stream(
    implementation: Method,
    args: GraffitiArgs<"discover">,
  ): GraffitiObjectStream<{}> {
    const self = this;
    return (async function* () {
      const request = await self.guard.authorize("discover", args);
      const stream = implementation.apply(
        self.graffiti,
        args,
      ) as GraffitiObjectStream<{}>;
      let complete = false;
      try {
        while (true) {
          let next;
          try {
            next = await stream.next();
          } catch (error) {
            complete = true;
            await self.recordAudit(() => self.guard.fail(request, error));
            throw error;
          }
          if (next.done) {
            complete = true;
            await self.recordAudit(() =>
              self.guard.succeed(request, "discover", next.value),
            );
            return next.value;
          }
          yield next.value;
        }
      } finally {
        if (!complete) {
          try {
            await stream.return({ cursor: "" });
          } finally {
            await self.recordAudit(() =>
              self.guard.fail(
                request,
                new Error("Discovery was aborted before completion."),
              ),
            );
          }
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
