/**
 * The browser pidgin between entry-rest and its console (spec #223).
 *
 * entry-rest maps a browser-generated session id to a ledger externalKey by
 * prefixing it; apps/web strips the prefix to get its own id back. That
 * convention used to be hand-spelled in four places, so a rename would have
 * silently desynchronized the ledger lookup. It lives here now, in a module
 * with NO zod imports, so the browser bundle can import it cheaply.
 */

/** Prefix identifying ledger rows created by the REST entry. */
export const WEB_SESSION_PREFIX = "web-";

/** Browser id -> ledger externalKey. */
export function webExternalKey(browserSessionId: string): string {
  return `${WEB_SESSION_PREFIX}${browserSessionId}`;
}

/** Ledger externalKey -> browser id; a non-web key is returned unchanged. */
export function browserSessionId(externalKey: string): string {
  return externalKey.startsWith(WEB_SESSION_PREFIX) ? externalKey.slice(WEB_SESSION_PREFIX.length) : externalKey;
}

/** True when the ledger row belongs to the REST entry. */
export function isWebExternalKey(externalKey: string): boolean {
  return externalKey.startsWith(WEB_SESSION_PREFIX);
}
