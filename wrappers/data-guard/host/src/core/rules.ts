import type {
  Graffiti,
  GraffitiObject,
  GraffitiSession,
  JSONSchema,
} from "@graffiti-garden/api";
import { shallowReactive } from "vue";
import type { Permission, SiteBlock } from "./db.js";
import type { GraffitiMethod } from "./graffiti.js";
import type { Source } from "./source.js";

export type StoredRuleValue = {
  published: number;
  site: {
    origin: string;
    path: { id: string; name: string }[];
  };
  rule:
    | {
        method: GraffitiMethod;
        decision: "allow" | "deny";
        match: Permission["match"];
      }
    | { kind: "site-block" };
};

export type AccessRule =
  | { kind: "permission"; permission: Permission }
  | { kind: "site-block"; block: SiteBlock };

export function ruleSchema(actor: string): JSONSchema {
  return {
    properties: {
      actor: { const: actor },
      value: {
        type: "object",
        required: ["published", "site", "rule"],
        properties: {
          published: { type: "number" },
          site: {
            type: "object",
            required: ["origin", "path"],
            properties: {
              origin: { type: "string" },
              path: {
                type: "array",
                items: {
                  type: "object",
                  required: ["id", "name"],
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
          rule: {
            anyOf: [
              {
                type: "object",
                required: ["method", "decision", "match"],
                properties: {
                  method: {
                    enum: [
                      "post",
                      "get",
                      "delete",
                      "postMedia",
                      "getMedia",
                      "deleteMedia",
                      "logout",
                    ],
                  },
                  decision: { enum: ["allow", "deny"] },
                  match: {
                    anyOf: [
                      {
                        type: "object",
                        required: ["kind", "url"],
                        properties: {
                          kind: { const: "object" },
                          url: { type: "string" },
                        },
                      },
                      {
                        type: "object",
                        required: ["kind", "example"],
                        properties: {
                          kind: { const: "object" },
                          example: {},
                        },
                      },
                      {
                        type: "object",
                        required: ["kind", "url"],
                        properties: {
                          kind: { const: "media" },
                          url: { type: "string" },
                        },
                      },
                      {
                        type: "object",
                        required: ["kind", "example"],
                        properties: {
                          kind: { const: "media" },
                          example: {
                            type: "object",
                            required: ["type", "size"],
                            properties: {
                              type: { type: "string" },
                              size: { type: "number" },
                              name: { type: "string" },
                            },
                          },
                        },
                      },
                      {
                        type: "object",
                        required: ["kind"],
                        properties: { kind: { const: "logout" } },
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                required: ["kind"],
                properties: { kind: { const: "site-block" } },
              },
            ],
          },
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
  const rules: AccessRule[] = [];
  for (const object of objects) {
    if (object.actor !== actor) continue;
    if (!isRecord(object.value)) continue;
    const value = object.value as Partial<StoredRuleValue>;
    if (
      typeof value.published !== "number" ||
      !isRecord(value.site) ||
      typeof value.site.origin !== "string" ||
      !Array.isArray(value.site.path) ||
      !isRecord(value.rule)
    ) {
      continue;
    }
    const path = value.site.path.filter(
      (item): item is { id: string; name: string } =>
        Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.name === "string",
        ),
    );
    if (path.length !== value.site.path.length) continue;
    const source = {
      key: JSON.stringify([value.site.origin, ...path.map(({ id }) => id)]),
      origin: value.site.origin,
      path,
    };
    if (expectedSource && source.key !== expectedSource.key) continue;
    const rule = value.rule as Record<string, unknown>;
    if (
      isGraffitiMethod(rule.method) &&
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

export type RuleScope = {
  key: string;
  source: Source;
  actor: string;
  session: GraffitiSession;
  rules: AccessRule[];
  ready: Promise<void>;
  resolveReady: () => void;
  loaded: boolean;
  write: Promise<void>;
};

export class GraffitiRuleStore {
  readonly scopes = shallowReactive<RuleScope[]>([]);
  readonly state = shallowReactive({ active: false });
  private graffiti?: Graffiti;

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
    scope.rules = rulesFromObjects(objects, scope.actor, scope.source);
    if (loaded && !scope.loaded) {
      scope.loaded = true;
      scope.resolveReady();
    }
  }

  async permissions(source: Source, actor: string, method: GraffitiMethod) {
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
      return stored.permission;
    });
  }

  async ensurePermission(
    permission: Omit<Permission, "id" | "createdAt" | "decision">,
  ) {
    const scope = this.loadedScope(permission.source, permission.actor);
    return this.enqueue(scope, async () => {
      const existing = scope.rules.find(
        (rule): rule is Extract<AccessRule, { kind: "permission" }> =>
          rule.kind === "permission" &&
          rule.permission.method === permission.method &&
          rule.permission.decision === "allow" &&
          JSON.stringify(rule.permission.match) === JSON.stringify(permission.match),
      );
      if (existing) return existing.permission;
      return this.rememberNow(scope, { ...permission, decision: "allow" });
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
    for (const candidate of this.scopes) {
      candidate.rules = candidate.rules.filter((rule) => ruleId(rule) !== id);
    }
  }

  async unblockSource(key: string, actor?: string) {
    const blocks = this.scopes.flatMap((scope) =>
      scope.rules.filter(
        (rule): rule is Extract<AccessRule, { kind: "site-block" }> =>
          rule.kind === "site-block" &&
          rule.block.source.key === key &&
          (!actor || rule.block.actor === actor),
      ),
    );
    await Promise.all(blocks.map(({ block }) => this.revoke(block.id, block.actor)));
  }

  async all() {
    await Promise.all(this.scopes.map(({ ready }) => ready));
    return uniqueRules(this.scopes.flatMap(({ rules }) => rules));
  }

  async snapshot() {
    const rules = await this.all();
    return {
      permissions: rules
        .filter((rule): rule is Extract<AccessRule, { kind: "permission" }> =>
          rule.kind === "permission",
        )
        .map(({ permission }) => permission),
      siteBlocks: rules
        .filter((rule): rule is Extract<AccessRule, { kind: "site-block" }> =>
          rule.kind === "site-block",
        )
        .map(({ block }) => block),
    };
  }

  async destroy() {
    this.scopes.splice(0);
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
      loaded: false,
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
          published: Date.now(),
          site: {
            origin: scope.source.origin,
            path: scope.source.path,
          },
          rule,
        },
        channels: [scope.source.key, scope.actor],
        allowed: [],
      },
      scope.session,
    );
  }

  private async rememberNow(
    scope: RuleScope,
    permission: Omit<Permission, "id" | "createdAt">,
  ) {
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
    return stored.permission;
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

function uniqueRules(rules: AccessRule[]) {
  return [
    ...new Map(rules.map((rule) => [ruleId(rule), rule])).values(),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGraffitiMethod(value: unknown): value is GraffitiMethod {
  return [
    "post",
    "get",
    "delete",
    "postMedia",
    "getMedia",
    "deleteMedia",
    "logout",
  ].includes(value as string);
}

function isPermissionMatch(value: unknown): value is Permission["match"] {
  if (!isRecord(value)) return false;
  if (value.kind === "logout") return true;
  if (value.kind !== "object" && value.kind !== "media") return false;
  if (typeof value.url === "string") return true;
  if (value.kind === "object") return "example" in value;
  if (!("example" in value)) return false;
  return (
    isRecord(value.example) &&
    typeof value.example.type === "string" &&
    typeof value.example.size === "number" &&
    (value.example.name === undefined || typeof value.example.name === "string")
  );
}
