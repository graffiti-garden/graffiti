export function abbreviate(value: string) {
  return value.length > 6 ? value.slice(0, 6) + "…" : value;
}

export function did(value: unknown): value is string {
  return typeof value === "string" && /^did:[a-z0-9]+:\S+$/i.test(value);
}

// Reserve Graffiti URIs for their own renderer. Their internal structure can be
// parsed here once that format is defined without changing any callers.
export function graffitiUrl(value: unknown): value is string {
  return typeof value === "string" && /^graffiti:\S+$/i.test(value);
}

export function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function url(value: unknown): value is string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function timestamp(value: unknown, field?: string) {
  let milliseconds: number | undefined;
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    milliseconds = Date.parse(value);
  } else if (
    typeof value === "number" &&
    temporalField(field) &&
    Number.isFinite(value)
  ) {
    milliseconds = Math.abs(value) < 1e11 ? value * 1000 : value;
  }
  if (
    milliseconds === undefined ||
    !Number.isFinite(milliseconds) ||
    milliseconds < Date.UTC(1900, 0, 1) ||
    milliseconds > Date.UTC(2200, 0, 1)
  ) {
    return;
  }
  return new Date(milliseconds);
}

function temporalField(field?: string) {
  const words = field?.replace(/([a-z])([A-Z])/g, "$1 $2");
  return /(?:^|[ _-])(created|updated|published|modified|timestamp|time|date)(?: at)?(?:$|[ _-])/i.test(words ?? "");
}
