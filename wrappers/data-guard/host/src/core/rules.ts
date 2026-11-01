import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { shallowReactive } from "vue";
import type { GuardDB, Permission, SiteBlock } from "./db.js";
import { matches } from "./permissions.js";
import { siteStamp } from "./provenance.js";
import { sourceFromContext, type Source } from "./source.js";

export type StoredRuleValue = {
  action: "Remember permission";
  "confirm with guard": true;
  "via site": ReturnType<typeof siteStamp>;
  published: number;
  site: Pick<Source, "origin" | "path">;
  rule:
    | {
        method: Permission["method"];
        decision: "allow" | "deny";
        match: Permission["match"];
      }
    | { kind: "site-block" };
};

export type AccessRule =
  | { kind: "permission"; permission: Permission }
  | { kind: "site-block"; block: SiteBlock };

/** An audit can show a rule from either site's perspective. */
export function ruleSites(rule: AccessRule): string[] {
  return rule.kind === "permission"
    ? [rule.permission.source.key, rule.permission.match.site]
    : [rule.block.source.key];
}

export function ruleChannel(kind: "site" | "actor", id: string) {
  return `guard:permissions:${kind}:${id}`;
}

export function ruleSchema(actor: string): JSONSchema {
  // Filter at discovery; rulesFromObjects validates the payload before use.
  return {
    properties: {
      actor: { const: actor },
      value: {
        type: "object",
        required: ["action", "confirm with guard"],
        properties: {
          action: { const: "Remember permission" },
          "confirm with guard": { const: true },
        },
      },
    },
  } as JSONSchema;
}

export function rulesFromObjects(
  objects: readonly GraffitiObject<{}>[],
  actor: string,
  expectedSource?: Source,
) {
  // Discovery schemas narrow the search. Validate again here before a stored
  // object is allowed to become an authorization rule.
  const rules: AccessRule[] = [];
  for (const object of objects) {
    if (object.actor !== actor) continue;
    if (!isRecord(object.value)) continue;
    const value = object.value as Partial<StoredRuleValue>;
    if (
      value.action !== "Remember permission" ||
      value["confirm with guard"] !== true ||
      typeof value.published !== "number" ||
      !isRecord(value.site) ||
      typeof value.site.origin !== "string" ||
      !Array.isArray(value.site.path) ||
      !isRecord(value.rule)
    ) {
      continue;
    }
    let source: Source;
    try {
      source = sourceFromContext(value.site.origin, { source: value.site.path });
    } catch { continue; }
    if (expectedSource && source.key !== expectedSource.key) continue;
    const rule = value.rule as Record<string, unknown>;
    if (
      isPermissionMethod(rule.method) &&
      (rule.decision === "allow" || rule.decision === "deny") &&
      isPermissionMatch(rule.match)
    ) {
      rules.push({
        kind: "permission",
        permission: {
          id: object.url,
          source,
          actor: object.actor,
          method: rule.method,
          decision: rule.decision,
          match: rule.match,
          createdAt: value.published,
        },
      });
    } else if (rule.kind === "site-block") {
      rules.push({
        kind: "site-block",
        block: {
          id: object.url,
          source,
          actor: object.actor,
          createdAt: value.published,
        },
      });
    }
  }
  return rules;
}

/** One discovery per actor/site. Vue supplies updates; writes queue per scope. */
export type RuleScope = {
  key: string;
  source: Source;
  actor: string;
  session: GraffitiSession;
  rules: AccessRule[];
  ready: Promise<void>;
  resolveReady: () => void;
  write: Promise<void>;
};

export class GraffitiRuleStore implements GuardDB {
  readonly scopes = shallowReactive<RuleScope[]>([]);
  readonly state = shallowReactive({ active: false });
  private graffiti?: Graffiti;

  constructor(private readonly guardSource: Source) {}

  activate() {
    this.state.active = true;
  }

  connect(graffiti: Graffiti) {
    this.graffiti = graffiti;
  }

  async load(source: Source, session: GraffitiSession) {
    const scope = this.scope(source, session);
    await scope.ready;
  }

  update(scope: RuleScope, objects: readonly GraffitiObject<{}>[], loaded: boolean) {
    if (!loaded) return;
    scope.rules = rulesFromObjects(objects, scope.actor, scope.source);
    scope.resolveReady(); // Resolving again on later updates is harmless.
  }

  async permissions(source: Source, actor: string, method: Permission["method"]) {
    const scope = this.loadedScope(source, actor);
    await scope.ready;
    return scope.rules
      .filter((rule): rule is Extract<AccessRule, { kind: "permission" }> =>
        rule.kind === "permission" && rule.permission.method === method,
      )
      .map(({ permission }) => permission);
  }

  async isSourceBlocked(source: Source, actor: string) {
    const scope = this.loadedScope(source, actor);
    await scope.ready;
    return scope.rules.some((rule) => rule.kind === "site-block");
  }

  async remember(
    permission: Omit<Permission, "id" | "createdAt">,
  ): Promise<Permission> {
    const scope = this.loadedScope(permission.source, permission.actor);
    return this.enqueue(scope, async () => {
      const previous = scope.rules.flatMap((rule) =>
        rule.kind === "permission" &&
        rule.permission.method === permission.method &&
        matches(rule.permission, permission.match)
          ? [rule.permission.id]
          : [],
      );
      const object = await this.post(scope, {
        method: permission.method,
        decision: permission.decision,
        match: permission.match,
      });
      const stored = rulesFromObjects([object], scope.actor, scope.source)[0];
      if (!stored || stored.kind !== "permission") {
        throw new Error("Graffiti returned an invalid permission object.");
      }
      this.add(scope, stored);
      // Save the replacement before deleting known older decisions. Revoking
      // an allow must remove that object, not depend on finding a newer deny.
      for (const id of previous) await this.revoke(id, permission.actor);
      return stored.permission;
    });
  }

  async blockSource(source: Source, actor: string) {
    const scope = this.loadedScope(source, actor);
    return this.enqueue(scope, async () => {
      const existing = scope.rules.find(
        (rule): rule is Extract<AccessRule, { kind: "site-block" }> =>
          rule.kind === "site-block",
      );
      if (existing) return existing.block;
      const object = await this.post(scope, { kind: "site-block" });
      const stored = rulesFromObjects([object], scope.actor, scope.source)[0];
      if (!stored || stored.kind !== "site-block") {
        throw new Error("Graffiti returned an invalid site block object.");
      }
      this.add(scope, stored);
      return stored.block;
    });
  }

  async revoke(id: string, actor?: string) {
    const scope = this.scopes.find(
      (candidate) =>
        (!actor || candidate.actor === actor) &&
        candidate.rules.some((rule) => ruleId(rule) === id),
    );
    if (!scope) throw new Error("Permission is not loaded.");
    const graffiti = this.requireGraffiti();
    await graffiti.delete(id, scope.session);
    // Parsing assigns each policy to exactly one actor and requesting site.
    scope.rules = scope.rules.filter(rule => ruleId(rule) !== id);
  }

  private scope(source: Source, session: GraffitiSession) {
    const key = `${session.actor}\n${source.key}`;
    const existing = this.scopes.find((scope) => scope.key === key);
    if (existing) {
      existing.session = session;
      return existing;
    }
    let resolveReady = () => {};
    const ready = new Promise<void>((resolve) => (resolveReady = resolve));
    const scope = shallowReactive<RuleScope>({
      key,
      source,
      actor: session.actor,
      session,
      rules: [],
      ready,
      resolveReady,
      write: Promise.resolve(),
    });
    this.scopes.push(scope);
    return scope;
  }

  private loadedScope(source: Source, actor: string) {
    const scope = this.scopes.find(
      (candidate) => candidate.actor === actor && candidate.source.key === source.key,
    );
    if (!scope) throw new Error("Permissions for this site have not loaded.");
    return scope;
  }

  private async post(scope: RuleScope, rule: StoredRuleValue["rule"]) {
    return this.requireGraffiti().post(
      {
        value: {
          action: "Remember permission",
          // The person's Remember choice already confirmed this write. Stamp
          // the guard as its creator, not the site this rule grants access to.
          "confirm with guard": true,
          "via site": siteStamp(this.guardSource),
          published: Date.now(),
          site: {
            origin: scope.source.origin,
            path: scope.source.path,
          },
          rule,
        },
        channels: [
          ruleChannel("site", scope.source.key),
          ruleChannel("actor", scope.actor),
        ],
        allowed: [],
      },
      scope.session,
    );
  }

  private add(scope: RuleScope, rule: AccessRule) {
    if (!scope.rules.some((candidate) => ruleId(candidate) === ruleId(rule))) {
      scope.rules = [...scope.rules, rule];
    }
  }

  private enqueue<T>(scope: RuleScope, operation: () => Promise<T>) {
    const result = scope.write.then(operation);
    scope.write = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private requireGraffiti() {
    if (!this.graffiti) throw new Error("Graffiti permission storage is not ready.");
    return this.graffiti;
  }
}

export function ruleId(rule: AccessRule) {
  return rule.kind === "permission" ? rule.permission.id : rule.block.id;
}

export function ruleActor(rule: AccessRule) {
  return rule.kind === "permission" ? rule.permission.actor : rule.block.actor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPermissionMethod(value: unknown): value is Permission["method"] {
  return value === "get" || value === "delete";
}

function isPermissionMatch(value: unknown): value is Permission["match"] {
  if (!isRecord(value)) return false;
  return value.kind === "site" && typeof value.site === "string";
}
