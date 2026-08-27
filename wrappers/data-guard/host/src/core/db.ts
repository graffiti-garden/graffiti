import { deleteDB, openDB, type DBSchema } from "idb";
import type { GraffitiMethod } from "./graffiti.js";
import type { Source } from "./source.js";

export type Permission = {
  id: string;
  source: Source;
  actor: string;
  method: GraffitiMethod;
  match:
    | { kind: "object"; url: string }
    | {
        kind: "object";
        schema: unknown;
        channels: string[] | "any";
        allowed: string[] | "any";
      }
    | {
        kind: "discover";
        schema: unknown;
        channels: string[] | "any";
      }
    | { kind: "media"; url: string }
    | {
        kind: "media";
        mediaType: string;
        allowed: string[] | "any";
      }
    | { kind: "logout" };
  createdAt: number;
};

export type Request = {
  id: string;
  source: Source;
  actor: string;
  method: GraffitiMethod;
  subject: unknown;
  createdAt: number;
  undoOf?: string;
};

export type RequestResult = {
  authorization:
    | { allowed: false; at: number }
    | {
        allowed: true;
        at: number;
        permission?: { id: string; created: boolean };
      };
  execution?:
    | { ok: true; at: number; value?: unknown }
    | { ok: false; at: number; error: string };
};

interface GuardDatabase extends DBSchema {
  permissions: {
    key: string;
    value: Permission;
    indexes: { source: string };
  };
  requests: {
    key: string;
    value: { request: Request; result?: RequestResult };
    indexes: { source: string; created: number; undo: string };
  };
}

export class GuardDB {
  private readonly database;

  constructor(private readonly name = "graffiti-guard") {
    this.database = openDB<GuardDatabase>(name, 1, {
      upgrade(db) {
        const permissions = db.createObjectStore("permissions", {
          keyPath: "id",
        });
        permissions.createIndex("source", "source.key");
        const requests = db.createObjectStore("requests", {
          keyPath: "request.id",
        });
        requests.createIndex("source", "request.source.key");
        requests.createIndex("created", "request.createdAt");
        requests.createIndex("undo", "request.undoOf");
      },
    });
  }

  async permissions(
    source: Source,
    actor: string,
    method: Permission["method"],
  ) {
    return (await (await this.database).getAllFromIndex(
      "permissions",
      "source",
      source.key,
    )).filter(
      (permission) =>
        permission.actor === actor && permission.method === method,
    );
  }

  async request(
    source: Source,
    actor: string,
    method: Request["method"],
    subject: unknown,
    undoOf?: string,
  ) {
    const request = newRequest(source, actor, method, subject, undoOf);
    await (await this.database).add("requests", { request });
    return request;
  }

  async recovery(
    source: Source,
    actor: string,
    method: Request["method"],
    subject: unknown,
    undoOf: string,
  ) {
    const db = await this.database;
    const transaction = db.transaction("requests", "readwrite");
    const store = transaction.objectStore("requests");
    // The transaction serializes this check-and-add across guard tabs.
    if ((await store.index("undo").getKey(undoOf)) !== undefined) {
      await transaction.done;
      throw new Error("This request has already been recovered.");
    }
    const request = newRequest(source, actor, method, subject, undoOf);
    await store.add({ request });
    await transaction.done;
    return request;
  }

  async deny(request: Request) {
    await this.updateRequest(request.id, {
      authorization: { allowed: false, at: Date.now() },
    });
  }

  async allow(request: Request, permission?: Permission) {
    await this.updateRequest(request.id, {
      authorization: {
        allowed: true,
        at: Date.now(),
        ...(permission
          ? { permission: { id: permission.id, created: false } }
          : {}),
      },
    });
  }

  async grant(
    request: Request,
    permission: Omit<Permission, "id" | "createdAt">,
  ) {
    const db = await this.database;
    const record = newPermission(permission);
    const transaction = db.transaction(
      ["permissions", "requests"],
      "readwrite",
    );
    const entry = await transaction.objectStore("requests").get(request.id);
    if (!entry) throw new Error(`Unknown guard request ${request.id}.`);
    entry.result = {
      authorization: {
        allowed: true,
        at: Date.now(),
        permission: { id: record.id, created: true },
      },
    };
    await Promise.all([
      transaction.objectStore("permissions").add(record),
      transaction.objectStore("requests").put(entry),
      transaction.done,
    ]);
    return record;
  }

  async finish(
    request: Request,
    execution:
      | { ok: true; value?: unknown }
      | { ok: false; error: string },
    implicitPermission?: Omit<Permission, "id" | "createdAt">,
  ) {
    const db = await this.database;
    const transaction = db.transaction(
      ["permissions", "requests"],
      "readwrite",
    );
    const store = transaction.objectStore("requests");
    const entry = await store.get(request.id);
    // Clearing history is allowed while an operation is in flight. If its
    // record is already gone, do not recreate it or misreport the operation.
    if (!entry) {
      await transaction.done;
      return;
    }
    if (!entry.result) {
      await transaction.done;
      throw new Error(`Guard request ${request.id} was not authorized.`);
    }
    entry.result.execution = execution.ok
      ? {
          ok: true,
          at: Date.now(),
          ...(execution.value !== undefined ? { value: execution.value } : {}),
        }
      : { ok: false, at: Date.now(), error: execution.error };
    // A successful post and the exact read permission implied by its returned
    // URL become visible together; neither can be recorded without the other.
    await Promise.all([
      store.put(entry),
      ...(implicitPermission
        ? [
            transaction
              .objectStore("permissions")
              .add(newPermission(implicitPermission)),
          ]
        : []),
      transaction.done,
    ]);
  }

  async revoke(id: string) {
    await (await this.database).delete("permissions", id);
  }

  async audit() {
    const db = await this.database;
    const [permissions, requests] = await Promise.all([
      db.getAll("permissions"),
      db.getAll("requests"),
    ]);
    return {
      permissions: permissions.sort((a, b) => b.createdAt - a.createdAt),
      requests: requests.sort(
        (a, b) => b.request.createdAt - a.request.createdAt,
      ),
    };
  }

  async entry(id: string) {
    return (await this.database).get("requests", id);
  }

  async clearHistory() {
    await (await this.database).clear("requests");
  }

  async clearEverything() {
    const db = await this.database;
    const transaction = db.transaction(
      ["permissions", "requests"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("permissions").clear(),
      transaction.objectStore("requests").clear(),
      transaction.done,
    ]);
  }

  async destroy() {
    (await this.database).close();
    await deleteDB(this.name);
  }

  private async updateRequest(id: string, result: RequestResult) {
    const db = await this.database;
    const transaction = db.transaction("requests", "readwrite");
    const store = transaction.objectStore("requests");
    const entry = await store.get(id);
    if (!entry) {
      await transaction.done;
      throw new Error(`Unknown guard request ${id}.`);
    }
    entry.result = result;
    await store.put(entry);
    await transaction.done;
  }
}

function newPermission(
  permission: Omit<Permission, "id" | "createdAt">,
): Permission {
  return {
    ...permission,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
}

function newRequest(
  source: Source,
  actor: string,
  method: Request["method"],
  subject: unknown,
  undoOf?: string,
): Request {
  return {
    id: crypto.randomUUID(),
    source,
    actor,
    method,
    subject,
    createdAt: Date.now(),
    ...(undoOf ? { undoOf } : {}),
  };
}
