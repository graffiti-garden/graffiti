import { FileKind, fromMime } from "human-filetypes";

export function mediaLabels(type: unknown) {
  const kind = fromMime(
    String(type || "application/octet-stream").toLowerCase().trim(),
  );
  const item =
    kind === FileKind.Unknown || kind === FileKind.Application ? "file" : kind;
  return {
    item,
    remember: `Allow For All ${
      item === "file" ? "Files" : `${capitalize(item)} Files`
    }`,
  };
}

export function formatBytes(size: unknown) {
  if (typeof size !== "number" || !Number.isFinite(size)) return "Unknown";
  if (size < 1024) return `${size} ${size === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unit = units.shift()!;
  while (value >= 1024 && units.length) {
    value /= 1024;
    unit = units.shift()!;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
}

function capitalize(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}
