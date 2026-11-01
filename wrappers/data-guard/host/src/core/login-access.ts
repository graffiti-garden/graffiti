import type { Source } from "./source.js";
import { isWithinSource, siteId, siteKey } from "./provenance.js";

const storageKey = "graffiti-guard:login-access-v3";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Guard-owned site consent, cleared when the actor signs out. */
export class LoginAccess {
  constructor(private readonly storage?: StorageLike) {}

  get available() { return this.storage !== undefined; }

  grant(actor: string, source: Source) {
    const sites = this.sites(actor);
    if (sites.some(site => siteKey(site) === source.key)) return;
    sites.push(siteId(source));
    this.write(actor, sites);
  }

  allows(actor: string, source: Source) {
    // Logging in to a child also logs in to every containing site.
    return this.sites(actor).some(site => isWithinSource(source, site));
  }

  revoke(actor: string, source: Source) {
    const sites = this.sites(actor);
    if (!sites.some(site => isWithinSource(source, site))) return;
    const remaining = sites.filter(site => !isWithinSource(source, site));
    // Keep the parent's inherited login when removing its last signed-in child.
    // The parent's approval also covers its ancestors, but not its children.
    const parent = siteId(source).slice(0, -1);
    if (parent.length && !remaining.some(site => siteKey(site) === siteKey(parent))) remaining.push(parent);
    this.write(actor, remaining);
  }

  /** Only this origin's descendants are shared with its containing page. */
  paths(actor: string, origin: string) {
    return this.sites(actor).filter(site => site[0] === origin).map(site => site.slice(1));
  }

  clear(actor: string) {
    this.storage?.removeItem(this.key(actor));
  }

  private key(actor: string) {
    return `${storageKey}:${actor}`;
  }

  private sites(actor: string): string[][] {
    const raw = this.storage?.getItem(this.key(actor));
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((site): site is string[] =>
        Array.isArray(site) && site.length > 0 &&
        site.every((part) => typeof part === "string" && part.length > 0));
    } catch {
      return [];
    }
  }

  private write(actor: string, sites: string[][]) {
    if (!this.storage) throw new Error("Login storage is unavailable.");
    this.storage.setItem(this.key(actor), JSON.stringify(sites));
  }
}
