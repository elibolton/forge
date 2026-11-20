// Talking to the Forge server (PocketBase). Plain fetch; no SDK.

export const SERVER_URL: string = (import.meta.env?.VITE_FORGE_SERVER as string | undefined) ?? 'https://forge.tail432cdc.ts.net';

export type Account = { id: string; email: string };
export type Session = { token: string; account: Account; refreshedAt: number };

/** A failed request: `status` 0 means the server couldn't be reached. */
export class ServerError extends Error {
  constructor(message: string, readonly status: number, readonly data?: unknown) { super(message); }
  get offline() { return this.status === 0; }
  get unauthorized() { return this.status === 401; }
}

export type ServerRecord = {
  id: string; owner: string; clientId: string; body: unknown; updatedAt: number; deleted: boolean; updated: string;
};

export class Server {
  constructor(readonly base = SERVER_URL, private fetcher: typeof fetch = (...a) => fetch(...a)) {}

  async call<T>(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.fetcher(this.base + path, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ServerError("Can't reach the Forge server.", 0);
    }
    if (res.status === 204) return undefined as T;
    let json: unknown = null;
    try { json = await res.json(); } catch { /* empty or not JSON */ }
    if (!res.ok) {
      const msg = (json as { message?: string } | null)?.message || `Server error ${res.status}`;
      throw new ServerError(res.status === 429 ? 'Too many tries. Wait a minute and try again.' : msg, res.status, json);
    }
    return json as T;
  }

  // MARK: Sign-in

  join(email: string, code: string) { return this.call<{ ok: true }>('POST', '/api/forge/join', { body: { email, code } }); }

  async requestCode(email: string): Promise<string> {
    const r = await this.call<{ otpId: string }>('POST', '/api/collections/users/request-otp', { body: { email } });
    return r.otpId;
  }

  async verifyCode(otpId: string, code: string): Promise<Session> {
    const r = await this.call<{ token: string; record: { id: string; email: string } }>(
      'POST', '/api/collections/users/auth-with-otp', { body: { otpId, password: code } });
    return { token: r.token, account: { id: r.record.id, email: r.record.email }, refreshedAt: Date.now() };
  }

  async refresh(s: Session): Promise<Session> {
    const r = await this.call<{ token: string; record: { id: string; email: string } }>('POST', '/api/collections/users/auth-refresh', { token: s.token });
    return { token: r.token, account: { id: r.record.id, email: r.record.email }, refreshedAt: Date.now() };
  }

  deleteAccount(s: Session) { return this.call<void>('DELETE', `/api/collections/users/records/${s.account.id}`, { token: s.token }); }

  // MARK: Records

  /** Records changed at or after `since` (server time), oldest first. */
  async changedSince(collection: string, since: string, token: string): Promise<ServerRecord[]> {
    const out: ServerRecord[] = [];
    const filter = encodeURIComponent(since ? `updated >= "${since}"` : '');
    for (let page = 1; ; page++) {
      const r = await this.call<{ items: ServerRecord[] }>('GET',
        `/api/collections/${collection}/records?filter=${filter}&sort=updated,id&perPage=200&page=${page}&skipTotal=1`, { token });
      out.push(...r.items);
      if (r.items.length < 200) return out;
    }
  }

  getRecord(collection: string, id: string, token: string) {
    return this.call<ServerRecord>('GET', `/api/collections/${collection}/records/${id}`, { token });
  }
  createRecord(collection: string, data: Record<string, unknown>, token: string) {
    return this.call<ServerRecord>('POST', `/api/collections/${collection}/records`, { token, body: data });
  }
  updateRecord(collection: string, id: string, data: Record<string, unknown>, token: string) {
    return this.call<ServerRecord>('PATCH', `/api/collections/${collection}/records/${id}`, { token, body: data });
  }
}

/**
 * The server id for a record: derived from the account, collection and the app's own id, so every
 * device names the same record the same way and no id map is needed. 15 characters of [a-z0-9], as
 * PocketBase requires.
 */
export async function serverID(owner: string, collection: string, clientId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${owner}|${collection}|${clientId}`)));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 15; i++) id += alphabet[bytes[i] % 36];
  return id;
}
