// Access rules and invite flow, against a throwaway PocketBase (see run.sh).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const URL_ = process.env.PB_URL;
const COLLECTIONS = ['workouts', 'activities', 'bodyweights', 'templates', 'state'];

async function api(method, path, { token, body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

let su, userA, userB, tokA, tokB;

async function setJoinLimit(max) {
  const s = await api('GET', '/api/settings', { token: su });
  const rules = s.json.rateLimits.rules.map((r) => (r.label === '/api/forge/join' ? { ...r, maxRequests: max } : r));
  const r = await api('PATCH', '/api/settings', { token: su, body: { rateLimits: { ...s.json.rateLimits, rules } } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}

before(async () => {
  const r = await api('POST', '/api/collections/_superusers/auth-with-password', { body: { identity: 'admin@test.local', password: 'testpassword123' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  su = r.json.token;
  await setJoinLimit(1000); // the tests below join more often than the real limit allows
  for (const inv of [
    { code: 'FRIENDS2', maxUses: 2, uses: 0 },
    { code: 'EXPIRED1', maxUses: 5, uses: 0, expiresAt: '2020-01-01 00:00:00.000Z' },
  ]) {
    const c = await api('POST', '/api/collections/invites/records', { token: su, body: inv });
    assert.equal(c.status, 200, JSON.stringify(c.json));
  }
});

test('the public cannot create accounts or use passwords', async () => {
  const c = await api('POST', '/api/collections/users/records', { body: { email: 'x@test.local', password: 'abcdefgh1', passwordConfirm: 'abcdefgh1' } });
  assert.ok(c.status >= 400, `create user should fail, got ${c.status}`);
  const p = await api('POST', '/api/collections/users/auth-with-password', { body: { identity: 'x@test.local', password: 'abcdefgh1' } });
  assert.ok(p.status >= 400, `password sign-in should be off, got ${p.status}`);
  const m = await api('GET', '/api/collections/users/auth-methods');
  assert.equal(m.json.otp.enabled, true);
  assert.equal(m.json.password.enabled, false);
});

test('invites are invisible to the public', async () => {
  const l = await api('GET', '/api/collections/invites/records');
  assert.ok(l.status === 403 || (l.status === 200 && l.json.items.length === 0), `got ${l.status}`);
  const c = await api('POST', '/api/collections/invites/records', { body: { code: 'MINE1234', maxUses: 99 } });
  assert.ok(c.status >= 400);
});

test('join: bad input, bad and expired codes fail', async () => {
  assert.equal((await api('POST', '/api/forge/join', { body: { email: 'nope', code: 'FRIENDS2' } })).status, 400);
  assert.equal((await api('POST', '/api/forge/join', { body: { email: 'a@test.local', code: 'WRONG123' } })).status, 400);
  const exp = await api('POST', '/api/forge/join', { body: { email: 'a@test.local', code: 'expired1' } });
  assert.equal(exp.status, 400);
  assert.match(exp.json.message, /expired/);
});

test('join: a code works up to its limit, and re-joining is free', async () => {
  assert.equal((await api('POST', '/api/forge/join', { body: { email: 'A@Test.local ', code: 'friends2' } })).status, 200);
  assert.equal((await api('POST', '/api/forge/join', { body: { email: 'b@test.local', code: 'FRIENDS2' } })).status, 200);
  const third = await api('POST', '/api/forge/join', { body: { email: 'c@test.local', code: 'FRIENDS2' } });
  assert.equal(third.status, 400);
  assert.match(third.json.message, /already been used/);
  assert.equal((await api('POST', '/api/forge/join', { body: { email: 'a@test.local', code: 'FRIENDS2' } })).status, 200);
  const inv = await api('GET', `/api/collections/invites/records?filter=${encodeURIComponent("code='FRIENDS2'")}`, { token: su });
  assert.equal(inv.json.items[0].uses, 2);
  const users = await api('GET', '/api/collections/users/records?sort=email', { token: su });
  assert.deepEqual(users.json.items.map((u) => u.email), ['a@test.local', 'b@test.local']);
  [userA, userB] = users.json.items.map((u) => u.id);
  tokA = (await api('POST', `/api/collections/users/impersonate/${userA}`, { token: su, body: {} })).json.token;
  tokB = (await api('POST', `/api/collections/users/impersonate/${userB}`, { token: su, body: {} })).json.token;
  assert.ok(tokA && tokB);
});

for (const name of COLLECTIONS) {
  test(`${name}: each user sees and changes only their own records`, async () => {
    const base = `/api/collections/${name}/records`;
    const mine = { owner: userA, clientId: 'c1', body: { hello: 'a' }, updatedAt: 1000 };

    assert.ok((await api('POST', base, { body: mine })).status >= 400, 'anonymous create');
    assert.ok((await api('POST', base, { token: tokB, body: mine })).status >= 400, 'create as someone else');

    const a = await api('POST', base, { token: tokA, body: mine });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.deepEqual(a.json.body, { hello: 'a' });
    assert.ok((await api('POST', base, { token: tokA, body: mine })).status >= 400, 'duplicate clientId for one owner');
    const b = await api('POST', base, { token: tokB, body: { ...mine, owner: userB } });
    assert.equal(b.status, 200, 'same clientId is fine for another owner');

    const listB = await api('GET', base, { token: tokB });
    assert.deepEqual(listB.json.items.map((r) => r.id), [b.json.id]);
    const anon = await api('GET', base);
    assert.equal(anon.json.items?.length ?? 0, 0);
    assert.equal((await api('GET', `${base}/${a.json.id}`, { token: tokB })).status, 404);
    assert.equal((await api('PATCH', `${base}/${a.json.id}`, { token: tokB, body: { deleted: true } })).status, 404);
    assert.equal((await api('DELETE', `${base}/${a.json.id}`, { token: tokB })).status, 404);

    const steal = await api('PATCH', `${base}/${a.json.id}`, { token: tokA, body: { owner: userB } });
    assert.ok(steal.status >= 400, 'owner cannot be changed');
    const upd = await api('PATCH', `${base}/${a.json.id}`, { token: tokA, body: { deleted: true, updatedAt: 2000 } });
    assert.equal(upd.status, 200);
    assert.equal(upd.json.owner, userA);
    assert.equal(upd.json.deleted, true);

    const since = await api('GET', `${base}?filter=${encodeURIComponent(`updated >= "${a.json.updated}"`)}&sort=updated`, { token: tokA });
    assert.deepEqual(since.json.items.map((r) => r.clientId), ['c1']);
  });
}

test('sign-in codes: same answer for members and strangers', async () => {
  const member = await api('POST', '/api/collections/users/request-otp', { body: { email: 'b@test.local' } });
  const stranger = await api('POST', '/api/collections/users/request-otp', { body: { email: 'nobody@test.local' } });
  assert.equal(member.status, 200, JSON.stringify(member.json));
  assert.equal(stranger.status, 200, JSON.stringify(stranger.json));
  assert.ok(member.json.otpId && stranger.json.otpId);
});

test('rate limits: join and sign-in codes', async () => {
  const s = await api('GET', '/api/settings', { token: su });
  const labels = Object.fromEntries(s.json.rateLimits.rules.map((r) => [r.label, r.maxRequests]));
  assert.equal(s.json.rateLimits.enabled, true);
  assert.equal(labels['users:requestOTP'], 5);
  assert.ok('/api/forge/join' in labels);
  await setJoinLimit(5);
  let limited = false;
  for (let i = 0; i < 8; i++) {
    const r = await api('POST', '/api/forge/join', { body: { email: 'z@test.local', code: 'WRONG123' } });
    if (r.status === 429) { limited = true; break; }
  }
  assert.ok(limited, 'join should hit 429 within 8 tries');
});

test('deleting a user deletes their data', async () => {
  assert.equal((await api('DELETE', `/api/collections/users/records/${userA}`, { token: su })).status, 204);
  for (const name of COLLECTIONS) {
    const all = await api('GET', `/api/collections/${name}/records`, { token: su });
    assert.ok(all.json.items.every((r) => r.owner !== userA), name);
    assert.equal(all.json.items.length, 1, name);
  }
});
