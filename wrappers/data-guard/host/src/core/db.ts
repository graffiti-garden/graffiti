import type { GraffitiSession } from "@graffiti-garden/api";
import type { GraffitiMethod } from "./graffiti.js";
import type { Source } from "./source.js";

export type Permission = {
  id: string;
  source: Source;
  actor: string;
  method: "get" | "delete";
  decision: "allow" | "deny";
  /** Only site is used for matching; name is a display label. */
  match: { kind: "site"; site: string; name?: string };
  createdAt: number;
};

export type SiteBlock = {
  id: string;
  source: Source;
  actor: string;
  createdAt: number;
};

export type Request = {
  source: Source;
  actor: string;
  method: GraffitiMethod;
  subject: unknown;
  mode?: "confirm" | "read" | "delete" | "logout";
  originSite?: Permission["match"];
};

/** Persistence needed by authorization; the Vue-backed store implements this. */
export interface GuardDB {
  load(source: Source, session: GraffitiSession): Promise<void>;
  isSourceBlocked(source: Source, actor: string): Promise<boolean>;
  blockSource(source: Source, actor: string): Promise<SiteBlock>;
  permissions(source: Source, actor: string, method: Permission["method"]): Promise<Permission[]>;
  remember(permission: Omit<Permission, "id" | "createdAt">): Promise<Permission>;
}
