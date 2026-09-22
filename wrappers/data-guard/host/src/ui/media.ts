import { FileKind, fromMime, mimeData } from "human-filetypes";

const documentTypes = new Set(["text/html", "application/xhtml+xml"]);

export function mediaLabels(type: unknown) {
  const mime = String(type || "application/octet-stream").toLowerCase().trim();
  const kind = fromMime(mime);
  const item =
    documentTypes.has(mime)
      ? FileKind.Document
      : kind === FileKind.Unknown || kind === FileKind.Application
        ? "file"
        : kind;
  return {
    item,
    description:
      mimeData[mime]?.label ?? (item === "file" ? "Unrecognized file" : `${capitalize(item)} file`),
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
