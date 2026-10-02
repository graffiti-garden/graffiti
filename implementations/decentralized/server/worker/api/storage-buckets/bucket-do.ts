import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../../env";

// The bucket stores small objects (<32kb, typically Graffiti objects)
// in SQL storage for fast retrieval. Larger objects are stored in R2.
export const SMALL_VALUE_LIMIT = 32 * 1024;
const MAX_VALUE_SIZE = 25 * 1024 * 1024;
export const EXPORT_PAGE_SIZE = 100;

// NULL value means the bytes live in R2. Even an empty SQLite value is non-NULL.
type Entry = { value: ArrayBuffer | null; etag: string | null };
type BatchEntry = Entry & { key: string };

function notFound() {
  return new Response("Value not found", { status: 404 });
}

async function etagFor(value: Uint8Array) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class StorageBucketDO extends DurableObject<Bindings> {
  protected sql: SqlStorage;
  protected writes: Promise<void> = Promise.resolve();
  protected bucketId: string;

  constructor(
    state: DurableObjectState,
    env: Bindings,
  ) {
    super(state, env);
    this.bucketId = state.id.name!;
    this.sql = state.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, value BLOB, etag TEXT, CHECK ((value IS NULL) = (etag IS NULL))) WITHOUT ROWID",
    );
  }

  private entry(key: string) {
    return this.sql
      .exec<Entry>("SELECT value, etag FROM entries WHERE key = ?", key)
      .toArray()[0];
  }

  // This helps keep puts and deletes in order, so if a put and delete are
  // concurrently modifying the same index, we don't get into a situation
  // with missing R2 bytes. This isn't used on reads, which can observe
  // either side of an active write.
  protected async write<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.writes;
    let release!: () => void;
    this.writes = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  async getValue(key: string, ifNoneMatch?: string) {
    const entry = this.entry(key);
    if (entry && entry.value !== null) {
      const etag = entry.etag!;
      const headers = { ETag: etag };
      return ifNoneMatch === etag
        ? new Response(null, { status: 304, headers })
        : new Response(entry.value, { headers });
    }

    if (!entry) return notFound();
    const result = await this.env.STORAGE.get(`${this.bucketId}/${key}`, {
      onlyIf: { etagDoesNotMatch: ifNoneMatch },
    });
    if (!result) return notFound();
    const headers = { ETag: result.etag };
    if (!("body" in result)) return new Response(null, { status: 304, headers });
    return new Response(result.body, { headers });
  }

  async getValues(keys: string[], maxValueBytes: number) {
    // One SQLite statement for all keys in this bucket. The route bounds both
    // the number of keys and the maximum bytes returned by this request.
    const placeholders = keys.map(() => "?").join(", ");
    const rows = this.sql
      .exec<BatchEntry>(
        `SELECT key, value, etag FROM entries WHERE key IN (${placeholders})`,
        ...keys,
      )
      .toArray();
    const entries = new Map(rows.map((row) => [row.key, row]));

    return Promise.all(keys.map(async (key) => {
      const entry = entries.get(key);
      if (!entry) return { status: 404 as const };
      if (entry.value !== null) {
        const value = new Uint8Array(entry.value);
        return value.byteLength > maxValueBytes
          ? { status: 413 as const }
          : { status: 200 as const, value, etag: entry.etag! };
      }

      const object = await this.env.STORAGE.get(`${this.bucketId}/${key}`);
      if (!object) return { status: 404 as const };
      if (object.size > maxValueBytes) {
        await object.body.cancel();
        return { status: 413 as const };
      }
      return {
        status: 200 as const,
        value: new Uint8Array(await object.arrayBuffer()),
        etag: object.etag,
      };
    }));
  }

  async putValue(key: string, request: Request) {
    return this.write(() => this.put(key, request));
  }

  private async putLarge(
    key: string,
    bucketKey: string,
    value: ReadableStream<Uint8Array> | Uint8Array,
    length?: number,
  ) {
    // Reserve a new key before uploading, but leave existing small bytes in
    // place so GET can still return them while R2 receives the new value.
    // Reserving a new key confirms the database is not full yet.
    const inserted = this.sql.exec(
      "INSERT OR IGNORE INTO entries (key, value, etag) VALUES (?, NULL, NULL)",
      key,
    ).rowsWritten > 0;
    try {
      // R2 receives only the body stream, not the Request's Content-Length
      // header. A plain stream has no known total size. FixedLengthStream
      // passes bytes through, checks their count, and gives R2 that size.
      const body = length === undefined
        ? value
        : (value as ReadableStream<Uint8Array>).pipeThrough(new FixedLengthStream(length));
      await this.env.STORAGE.put(bucketKey, body);
    } catch (error) {
      if (inserted) this.sql.exec("DELETE FROM entries WHERE key = ?", key);
      throw error;
    }
    if (!inserted) {
      // If there was already a value, make it null only after R2 succeeds.
      this.sql.exec(
        "UPDATE entries SET value = NULL, etag = NULL WHERE key = ? AND value IS NOT NULL",
        key,
      );
    }
  }

  private async put(key: string, request: Request) {
    const bucketKey = `${this.bucketId}/${key}`;
    if (!request.body) return new Response("Missing body", { status: 400 });
    const lengthHeader = request.headers.get("Content-Length");
    const length = lengthHeader === null ? NaN : Number(lengthHeader);
    if (Number.isSafeInteger(length) && length > MAX_VALUE_SIZE) {
      return new Response("Body is too large", { status: 413 });
    }
    if (Number.isSafeInteger(length) && length > SMALL_VALUE_LIMIT) {
      // If the object is large, put it in big storage (R2)
      await this.putLarge(key, bucketKey, request.body, length);
      return new Response(null, { status: 201 });
    }

    // Without a known length, buffer under the existing 25 MB upload limit.
    const value = new Uint8Array(await request.arrayBuffer());
    if (value.length > MAX_VALUE_SIZE) return new Response("Body is too large", { status: 413 });
    if (value.length > SMALL_VALUE_LIMIT) {
      // If it is too big, put it in big storage
      await this.putLarge(key, bucketKey, value);
    } else {
      // Otherwise put it in small storage (SQL)
      const etag = await etagFor(value);
      this.sql.exec(
        "INSERT OR REPLACE INTO entries (key, value, etag) VALUES (?, ?, ?)",
        key,
        value,
        etag,
      );
      await this.env.STORAGE.delete(bucketKey);
    }
    return new Response(null, { status: 201 });
  }

  async deleteValue(key: string) {
    return this.write(() => this.delete(key));
  }

  private async delete(key: string) {
    const bucketKey = `${this.bucketId}/${key}`;
    // Delete R2 first so a failed R2 delete cannot produce a false 404.
    await this.env.STORAGE.delete(bucketKey);
    this.sql.exec("DELETE FROM entries WHERE key = ?", key);
    return new Response(null, { status: 204 });
  }

  async exportKeys(cursor?: string) {
    await this.writes;
    const rows = this.sql
      .exec<{ key: string }>(
        "SELECT key FROM entries WHERE key > ? ORDER BY key LIMIT ?",
        cursor ?? "",
        EXPORT_PAGE_SIZE + 1,
      )
      .toArray();
    const keys = rows.slice(0, EXPORT_PAGE_SIZE).map((row) => row.key);
    return {
      keys,
      cursor: rows.length > EXPORT_PAGE_SIZE ? keys.at(-1)! : null,
    };
  }
}
