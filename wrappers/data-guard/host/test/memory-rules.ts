import type { GraffitiSession } from "@graffiti-garden/api";
import type { GuardDB, Permission, SiteBlock } from "../src/core/db.js";
import { matches } from "../src/core/permissions.js";
import type { Source } from "../src/core/source.js";

/** In-memory fixture for permission decisions; production uses GraffitiRuleStore. */
export class MemoryRules implements GuardDB {
  private grants: Permission[] = [];
  private blocks: SiteBlock[] = [];

  async load(_source: Source, _session: GraffitiSession) {}

  async permissions(source: Source, actor: string, method: Permission["method"]) {
    return this.grants.filter(permission => permission.source.key === source.key &&
      permission.actor === actor && permission.method === method);
  }

  async remember(permission: Omit<Permission, "id" | "createdAt">) {
    this.grants = this.grants.filter(previous => !(previous.source.key === permission.source.key &&
      previous.actor === permission.actor && previous.method === permission.method &&
      matches(previous, permission.match)));
    const stored = { ...permission, id: crypto.randomUUID(), createdAt: Date.now() };
    this.grants.push(stored);
    return stored;
  }

  async isSourceBlocked(source: Source, actor: string) {
    return this.blocks.some(block => block.source.key === source.key && block.actor === actor);
  }

  async blockSource(source: Source, actor: string) {
    const existing = this.blocks.find(block => block.source.key === source.key && block.actor === actor);
    if (existing) return existing;
    const block = { id: crypto.randomUUID(), source, actor, createdAt: Date.now() };
    this.blocks.push(block);
    return block;
  }

  async revoke(id: string) {
    this.grants = this.grants.filter(permission => permission.id !== id);
    this.blocks = this.blocks.filter(block => block.id !== id);
  }

  async rulesSnapshot() {
    return { permissions: this.grants, siteBlocks: this.blocks };
  }

  async destroy() {
    this.grants = [];
    this.blocks = [];
  }
}
