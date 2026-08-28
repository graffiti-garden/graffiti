import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { Resolver, type DIDDocument } from "did-resolver";
import { vi, type MockInstance } from "vitest";
import { Authorization } from "../src/1-services/1-authorization";

const ORIGIN = "https://localhost:5173";
const SERVER_ROOT = fileURLToPath(new URL("../../server/", import.meta.url));

function base64Id(byte: number) {
  return Buffer.alloc(32, byte).toString("base64url");
}

function createUser(index: number) {
  const secret = new Uint8Array(32).fill(index);
  const token = `${index}.${Buffer.from(secret).toString("base64url")}`;
  const bucketId = base64Id(index * 2);
  const inboxId = base64Id(index * 2 + 1);
  const handle = `localhost%3A5173:app:handles:handle:test${index}`;
  const actor = `did:plc:graffititestactor000000${index}`;

  return {
    actor,
    bucketEndpoint: `${ORIGIN}/s/${bucketId}`,
    bucketId,
    handle,
    handleDid: `did:web:${handle}`,
    inboxEndpoint: `${ORIGIN}/i/${inboxId}`,
    inboxId,
    secret,
    token,
    userId: index,
  };
}

export const decentralizedTestUsers = [createUser(1), createUser(2)] as const;
export const decentralizedSharedInbox = `${ORIGIN}/i/shared`;

export class DecentralizedTestEnvironment {
  private miniflare?: Miniflare;
  private temporaryDirectory?: string;
  private readonly mocks: MockInstance[] = [];

  async start() {
    this.temporaryDirectory = await mkdtemp(
      join(tmpdir(), "graffiti-decentralized-test-"),
    );
    const workerBundle = join(this.temporaryDirectory, "worker.mjs");

    await build({
      bundle: true,
      entryPoints: [join(SERVER_ROOT, "worker/index.ts")],
      format: "esm",
      outfile: workerBundle,
      platform: "browser",
      target: "esnext",
    });

    const script = await readFile(workerBundle, "utf8");
    this.miniflare = new Miniflare({
      bindings: { BASE_HOST: "localhost:5173" },
      compatibilityDate: "2025-12-26",
      d1Databases: { DB: "graffiti-test-db" },
      modules: true,
      r2Buckets: { STORAGE: "graffiti-test-storage" },
      script,
      scriptPath: "worker.mjs",
    });
    await this.miniflare.ready;

    const database = await this.miniflare.getD1Database("DB");
    for (const migration of ["0001.sql", "0002_handles_lowercase.sql"]) {
      const sql = await readFile(
        join(SERVER_ROOT, "migrations", migration),
        "utf8",
      );
      const statements = sql
        .replace(/^--.*$/gmu, "")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await database.prepare(statement).run();
      }
    }

    const now = Date.now();
    for (const user of decentralizedTestUsers) {
      const hash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", user.secret),
      );
      await database
        .prepare(
          "INSERT INTO users (user_id, created_at) VALUES (?, ?)",
        )
        .bind(user.userId, now)
        .run();
      await database
        .prepare(
          "INSERT INTO sessions (session_id, user_id, secret_hash, last_verified_at, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(user.userId, user.userId, hash, now, now)
        .run();
      await database
        .prepare(
          "INSERT INTO storage_buckets (bucket_id, user_id, created_at) VALUES (?, ?, ?)",
        )
        .bind(user.bucketId, user.userId, now)
        .run();
      await database
        .prepare(
          "INSERT INTO inboxes (inbox_id, user_id, created_at) VALUES (?, ?, ?)",
        )
        .bind(user.inboxId, user.userId, now)
        .run();
    }

    this.installMocks();
  }

  async stop() {
    for (const mock of this.mocks.reverse()) mock.mockRestore();
    this.mocks.length = 0;
    await this.miniflare?.dispose();
    this.miniflare = undefined;
    if (this.temporaryDirectory) {
      await rm(this.temporaryDirectory, { recursive: true, force: true });
      this.temporaryDirectory = undefined;
    }
  }

  private installMocks() {
    const documents = new Map<string, DIDDocument>();
    for (const user of decentralizedTestUsers) {
      documents.set(user.handleDid, {
        id: user.handleDid,
        alsoKnownAs: [user.actor],
      });
      documents.set(user.actor, {
        id: user.actor,
        alsoKnownAs: [user.handleDid],
        service: [
          {
            id: "#graffitiStorageBucket",
            type: "GraffitiStorageBucket",
            serviceEndpoint: user.bucketEndpoint,
          },
          {
            id: "#graffitiPersonalInbox",
            type: "GraffitiInbox",
            serviceEndpoint: user.inboxEndpoint,
          },
          {
            id: "#graffitiSharedInbox_0",
            type: "GraffitiInbox",
            serviceEndpoint: decentralizedSharedInbox,
          },
        ],
      });
    }
    for (const did of [
      "did:web:identity.foundation",
      "did:plc:44ybard66vv44zksje25o7dz",
    ]) {
      documents.set(did, { id: did });
    }

    this.mocks.push(
      vi.spyOn(Resolver.prototype, "resolve").mockImplementation(async (did) => ({
        didDocument: documents.get(did) ?? null,
        didDocumentMetadata: {},
        didResolutionMetadata: {},
      })),
    );

    const tokens = new Map(
      decentralizedTestUsers.map((user) => [user.actor, user.token]),
    );
    this.mocks.push(
      vi.spyOn(Authorization.prototype, "login").mockImplementation(
        async function (
          this: Authorization,
          _authorizationEndpoint,
          loginId,
        ) {
          const token = tokens.get(loginId);
          const detail = token
            ? { loginId, token }
            : { loginId, error: new Error(`Unknown test login: ${loginId}`) };
          this.eventTarget.dispatchEvent(new CustomEvent("login", { detail }));
        },
      ),
    );
    this.mocks.push(
      vi.spyOn(Authorization.prototype, "logout").mockImplementation(
        async function (
          this: Authorization,
          _authorizationEndpoint,
          logoutId,
        ) {
          this.eventTarget.dispatchEvent(
            new CustomEvent("logout", { detail: { logoutId } }),
          );
        },
      ),
    );

    const miniflare = this.miniflare;
    if (!miniflare) throw new Error("Miniflare did not start");
    this.mocks.push(
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        const body = request.body
          ? new Uint8Array(await request.arrayBuffer())
          : undefined;
        const headers = Object.fromEntries(request.headers);
        if (body) headers["content-length"] = String(body.byteLength);
        const response = await miniflare.dispatchFetch(request.url, {
          body,
          headers,
          method: request.method,
        });
        const responseBody = [204, 205, 304].includes(response.status)
          ? null
          : await response.arrayBuffer();
        return new Response(responseBody, {
          headers: Object.fromEntries(response.headers),
          status: response.status,
          statusText: response.statusText,
        });
      }),
    );
  }
}
