export type Source = {
  key: string;
  origin: string;
  path: { id: string; name: string }[];
};

export function sourceFromArgs(origin: string, args: readonly unknown[]) {
  const session = sessionFromArgs(args);
  return sourceFromPath(origin, session?.source);
}

export function actorFromArgs(args: readonly unknown[]) {
  return sessionFromArgs(args)?.actor;
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
    return { id: item.id, name: item.name };
  });
}

function hasActor(value: unknown): value is {
  actor: string;
  source?: unknown;
} {
  return isRecord(value) && typeof value.actor === "string";
}

function sessionFromArgs(args: readonly unknown[]) {
  const session = args.at(-1);
  return hasActor(session) ? session : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
