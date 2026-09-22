import type { GraffitiSession } from "@graffiti-garden/api";
import type { GraffitiMethod } from "./graffiti.js";
import type { Source } from "./source.js";

export type Permission = {
  id: string;
  source: Source;
  actor: string;
  method: GraffitiMethod;
  decision: "allow" | "deny";
  match:
    | { kind: "object"; url: string }
    | {
        kind: "object";
        /** The request data used to derive what counts as similar. */
        example: unknown;
      }
    | { kind: "media"; url: string }
    | {
        kind: "media";
        /** File metadata used to derive what counts as similar. */
        example: { type: string; size: number; name?: string };
      }
    | { kind: "logout" };
  createdAt: number;
};

export type SiteBlock = {
  id: string;
  source: Source;
  actor: string;
  createdAt: number;
};

export type Request = {
  id: string;
  source: Source;
  actor: string;
  method: GraffitiMethod;
  subject: unknown;
};

export interface GuardRuleRepository {
  load(source: Source, session: GraffitiSession): Promise<void>;
  isSourceBlocked(source: Source, actor: string): Promise<boolean>;
  blockSource(source: Source, actor: string): Promise<SiteBlock>;
  unblockSource(key: string, actor?: string): Promise<void>;
  permissions(
    source: Source,
    actor: string,
    method: GraffitiMethod,
  ): Promise<Permission[]>;
  remember(
    permission: Omit<Permission, "id" | "createdAt">,
  ): Promise<Permission>;
  ensurePermission(
    permission: Omit<Permission, "id" | "createdAt" | "decision">,
  ): Promise<Permission>;
  revoke(id: string, actor?: string): Promise<void>;
  snapshot(): Promise<{ permissions: Permission[]; siteBlocks: SiteBlock[] }>;
  destroy(): Promise<void>;
}

export class GuardDB {
  private readonly rules: GuardRuleRepository;
  private readonly pendingRequests = new Map<string, boolean>();

  constructor(repository?: GuardRuleRepository) {
    this.rules = repository ?? new MemoryRuleRepository();
  }

  load(source: Source, session: GraffitiSession) {
    return this.rules.load(source, session);
  }

  isSourceBlocked(source: Source, actor = "") {
    return this.rules.isSourceBlocked(source, actor);
  }

  blockSource(source: Source, actor = "") {
    return this.rules.blockSource(source, actor);
  }

  unblockSource(key: string, actor?: string) {
    return this.rules.unblockSource(key, actor);
  }

  permissions(source: Source, actor: string, method: Permission["method"]) {
    return this.rules.permissions(source, actor, method);
  }

  async request(
    source: Source,
    actor: string,
    method: Request["method"],
    subject: unknown,
  ) {
    const request = newRequest(source, actor, method, subject);
    this.pendingRequests.set(request.id, false);
    return request;
  }

  async deny(request: Request) {
    this.authorizeRequest(request.id, false);
  }

  async allow(request: Request) {
    this.authorizeRequest(request.id, true);
  }

  async grant(
    request: Request,
    permission: Omit<Permission, "id" | "createdAt" | "decision">,
  ) {
    return this.remember(request, { ...permission, decision: "allow" }, true);
  }

  async block(
    request: Request,
    permission: Omit<Permission, "id" | "createdAt" | "decision">,
  ) {
    return this.remember(request, { ...permission, decision: "deny" }, false);
  }

  private async remember(
    request: Request,
    permission: Omit<Permission, "id" | "createdAt">,
    allowed: boolean,
  ) {
    if (!this.pendingRequests.has(request.id)) {
      throw new Error(`Unknown guard request ${request.id}.`);
    }
    const record = await this.rules.remember(permission);
    this.authorizeRequest(request.id, allowed);
    return record;
  }

  ensurePermission(
    permission: Omit<Permission, "id" | "createdAt" | "decision">,
  ) {
    return this.rules.ensurePermission(permission);
  }

  async finish(
    request: Request,
    implicitPermission?: Omit<
      Permission,
      "id" | "createdAt" | "decision"
    >,
  ) {
    const authorized = this.pendingRequests.get(request.id);
    if (authorized === undefined) return;
    if (!authorized) {
      throw new Error(`Guard request ${request.id} was not authorized.`);
    }
    this.pendingRequests.delete(request.id);
    if (implicitPermission) {
      await this.rules.ensurePermission(implicitPermission);
    }
  }

  revoke(id: string, actor?: string) {
    return this.rules.revoke(id, actor);
  }

  rulesSnapshot() {
    return this.rules.snapshot();
  }

  async destroy() {
    this.pendingRequests.clear();
    await this.rules.destroy();
  }

  private authorizeRequest(id: string, allowed: boolean) {
    if (!this.pendingRequests.has(id)) {
      throw new Error(`Unknown guard request ${id}.`);
    }
    if (allowed) this.pendingRequests.set(id, true);
    else this.pendingRequests.delete(id);
  }
}

class MemoryRuleRepository implements GuardRuleRepository {
  private readonly permissionsById = new Map<string, Permission>();
  private readonly blocksById = new Map<string, SiteBlock>();
  private write = Promise.resolve();

  async load(_source: Source, _session: GraffitiSession) {}

  async isSourceBlocked(source: Source, actor: string) {
    return [...this.blocksById.values()].some(
      (block) =>
        block.source.key === source.key && (!actor || block.actor === actor),
    );
  }

  async blockSource(source: Source, actor: string) {
    const existing = [...this.blocksById.values()].find(
      (block) => block.source.key === source.key && block.actor === actor,
    );
    if (existing) return existing;
    const block = {
      id: crypto.randomUUID(),
      source,
      actor,
      createdAt: Date.now(),
    };
    this.blocksById.set(block.id, block);
    return block;
  }

  async unblockSource(key: string, actor?: string) {
    for (const [id, block] of this.blocksById) {
      if (block.source.key === key && (!actor || block.actor === actor)) {
        this.blocksById.delete(id);
      }
    }
  }

  async permissions(source: Source, actor: string, method: GraffitiMethod) {
    return [...this.permissionsById.values()].filter(
      (permission) =>
        permission.source.key === source.key &&
        permission.actor === actor &&
        permission.method === method,
    );
  }

  async remember(permission: Omit<Permission, "id" | "createdAt">) {
    const record = { ...permission, id: crypto.randomUUID(), createdAt: Date.now() };
    this.permissionsById.set(record.id, record);
    return record;
  }

  ensurePermission(
    permission: Omit<Permission, "id" | "createdAt" | "decision">,
  ) {
    const result = this.write.then(async () => {
      const existing = [...this.permissionsById.values()].find(
        (candidate) =>
          candidate.source.key === permission.source.key &&
          candidate.actor === permission.actor &&
          candidate.method === permission.method &&
          candidate.decision === "allow" &&
          JSON.stringify(candidate.match) === JSON.stringify(permission.match),
      );
      return existing ?? this.remember({ ...permission, decision: "allow" });
    });
    this.write = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async revoke(id: string) {
    this.permissionsById.delete(id);
    this.blocksById.delete(id);
  }

  async snapshot() {
    return {
      permissions: [...this.permissionsById.values()],
      siteBlocks: [...this.blocksById.values()],
    };
  }

  async destroy() {
    this.permissionsById.clear();
    this.blocksById.clear();
  }
}

function newRequest(
  source: Source,
  actor: string,
  method: Request["method"],
  subject: unknown,
): Request {
  return {
    id: crypto.randomUUID(),
    source,
    actor,
    method,
    subject,
  };
}
