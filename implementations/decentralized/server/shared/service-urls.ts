export function serviceIdToUrl(id: string, type: string, baseHost: string) {
  const code = type === "inbox" ? "i" : "s";
  return `gf:${code}:https://${baseHost}/${code}/${id}`;
}
