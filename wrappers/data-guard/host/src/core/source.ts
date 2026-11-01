import type { GraffitiSession } from "@graffiti-garden/api";
import type { GraffitiMethod } from "./graffiti.js";
import { sessionArgumentIndex, type GuardSourceSegment } from "../../../client/src/source.js";

export type Source = {
  key: string;
  origin: string;
  path: GuardSourceSegment[];
};

export function actorFromArgs(args: readonly unknown[], method: GraffitiMethod) {
  return sessionFromArgs(args, method)?.actor;
}

export function sourceFromContext(origin: string, context: unknown) {
  return sourceFromPath(
    origin,
    isRecord(context) ? context.source : undefined,
  );
}

export function sourceLabel(source: Source) {
  const origin = (() => {
    try {
      return new URL(source.origin).host;
    } catch {
      return source.origin;
    }
  })();
  return [origin, ...source.path.map(({ name }) => name)].join(" › ");
}

function sourceFromPath(origin: string, value: unknown): Source {
  const path = value === undefined ? [] : parsePath(value);
  return {
    key: JSON.stringify([origin, ...path.map(({ id }) => id)]),
    origin,
    path,
  };
}

function parsePath(value: unknown) {
  if (!Array.isArray(value)) throw new TypeError("Invalid guard source path.");
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      item.id.length === 0 ||
      typeof item.name !== "string" ||
      item.name.length === 0
    ) {
      throw new TypeError("Invalid guard source segment.");
    }
    if (item.url !== undefined && typeof item.url !== "string") {
      throw new TypeError("Invalid guard source URL.");
    }
    return {
      id: item.id,
      name: item.name,
      ...(item.url !== undefined ? { url: item.url } : {}),
    };
  });
}

function hasActor(value: unknown): value is {
  actor: string;
} {
  return isRecord(value) && typeof value.actor === "string";
}

export function sessionFromArgs(args: readonly unknown[], method: GraffitiMethod) {
  // A sessionless schema may contain an `actor` property. Check the API slot,
  // not the last supplied argument, before attributing a request to an actor.
  const index = sessionArgumentIndex[method];
  const session = index === undefined ? undefined : args[index];
  return hasActor(session) ? session : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function snapshotSession(session: GraffitiSession | undefined) {
  if (!session) return undefined;
  // These fields belong to the guard, not the underlying implementation.
  const { source: _source, guardSites: _sites, ...forwarded } = session as
    GraffitiSession & { source?: unknown; guardSites?: unknown };
  return forwarded;
}
