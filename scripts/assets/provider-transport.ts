import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";

import { DEFAULT_MAX_PNG_BYTES } from "./filesystem";

/**
 * The provider HTTPS transport, extracted so it stops being copied.
 *
 * T015 v4, T020 v1, and T020 v2 each carry their own byte-identical copy of this, because each
 * generation's sources are sha-pinned by an approved run: widening an export in a finished
 * task's module would change its implementation binding and, for T020 v2, make a COMPLETE
 * journal's header unreadable. Rather than write a fourth copy for T021, the transport lives
 * here from now on — a new file breaks no existing binding, and every later task pins this one
 * path instead of duplicating the logic again.
 *
 * It carries the three Node 22 corrections the T015 v3 post-mortem identified:
 *   1. `agent: false` with `autoSelectFamily: false`, so Happy Eyeballs cannot reorder or
 *      re-resolve behind the pinned lookup.
 *   2. A lookup callback answering in BOTH array mode (`all: true`) and the legacy
 *      3-argument mode, since Node 22 uses either depending on the call site.
 *   3. `remoteAddress` captured at response-header time, while the socket is still attached —
 *      Node 22 detaches it before `end`, which silently defeated the transport-peer pin.
 *
 * This is the raw fetch only. DNS pinning, the public-address filter, redirect limits, and
 * every response check stay in each task's `download*` function, which drives this through the
 * injectable `fetch` hook so tests can substitute a fake without touching the network.
 */
export interface ProviderAddress { address: string; family: 4 | 6 }
export interface ProviderFetchSpec { url: URL; hostname: string; servername: string; pinned: ProviderAddress; signal: AbortSignal }
export interface ProviderFetchResult { status: number; headers: IncomingHttpHeaders; bytes: Buffer; remoteAddress: string }

type LookupArrayCallback = (error: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void;
type LookupLegacyCallback = (error: NodeJS.ErrnoException | null, address: string, family: number) => void;

export function providerDefaultFetch(spec: ProviderFetchSpec, maxBytes: number = DEFAULT_MAX_PNG_BYTES): Promise<ProviderFetchResult> {
  // `autoSelectFamily` is a real Node 22 net option that @types/node does not surface on
  // https.RequestOptions, so the options object is typed explicitly rather than inlined.
  const options: HttpsRequestOptions & { autoSelectFamily: false } = {
    protocol: "https:", hostname: spec.hostname, path: `${spec.url.pathname}${spec.url.search}`, method: "GET", port: 443, servername: spec.servername,
    rejectUnauthorized: true, signal: spec.signal,
    // A fresh connection per request keeps the DNS pin authoritative for every download.
    agent: false, autoSelectFamily: false,
    lookup: (_hostname, lookupOptions, callback) => {
      if ((lookupOptions as { all?: boolean } | undefined)?.all === true) (callback as unknown as LookupArrayCallback)(null, [{ address: spec.pinned.address, family: spec.pinned.family }]);
      else (callback as unknown as LookupLegacyCallback)(null, spec.pinned.address, spec.pinned.family);
    },
  };
  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest(options, (response) => {
      // Must be read here: by 'end' Node 22 has detached the socket and this is gone.
      const remoteAddress = response.socket?.remoteAddress ?? "";
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) request.destroy(new Error("FILE_TOO_LARGE")); else chunks.push(chunk); });
      response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(chunks), remoteAddress }));
    });
    request.on("error", reject);
    request.end();
  });
}

/** Verbatim DNS resolution; the caller filters for public addresses and pins the first. */
export async function providerResolve(hostname: string): Promise<ProviderAddress[]> {
  return (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));
}
