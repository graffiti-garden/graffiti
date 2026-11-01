import type { Permission } from "./db.js";

/** Durable permissions are scoped to a requesting site, never to data shape. */
export function matches(permission: Permission, match: Permission["match"]) {
  return permission.match.site === match.site;
}

export function latestDecision(
  permissions: readonly Permission[],
  match: Permission["match"],
) {
  return permissions
    .filter((permission) => matches(permission, match))
    .sort((left, right) =>
      right.createdAt - left.createdAt ||
      Number(right.decision === "deny") - Number(left.decision === "deny")
    )[0]?.decision;
}
