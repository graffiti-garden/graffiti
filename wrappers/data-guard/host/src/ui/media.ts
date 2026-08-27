import { FileKind, fromMime, mimeData } from "human-filetypes";

export function mediaLabels(type: unknown) {
  const mime = String(type || "application/octet-stream").toLowerCase().trim();
  const kind = fromMime(mime);
  const item =
    kind === FileKind.Unknown || kind === FileKind.Application ? "file" : kind;
  return {
    item,
    description:
      mimeData[mime]?.label ?? (item === "file" ? "Unrecognized file" : `${capitalize(item)} file`),
    remember: `Allow For All ${
      item === "file" ? "Unrecognized Files" : `${capitalize(item)} Files`
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
