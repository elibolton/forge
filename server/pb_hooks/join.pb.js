/// <reference path="../pb_data/types.d.ts" />
// POST /api/forge/join  { email, code }
// Creates the account for a valid invite code; the app then signs in with the normal email code
// (POST /api/collections/users/request-otp). Accounts can't be created any other way.
// An email that already has an account succeeds without using up the invite.

routerAdd("POST", "/api/forge/join", (e) => {
  const body = e.requestInfo().body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim().toUpperCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new BadRequestError("Enter a valid email address.");
  }
  if (code.length < 6 || code.length > 64) {
    throw new BadRequestError("That invite code isn't valid.");
  }

  let existing = null;
  try { existing = $app.findAuthRecordByEmail("users", email); } catch (_) {}

  $app.runInTransaction((txApp) => {
    let invite;
    try {
      invite = txApp.findFirstRecordByData("invites", "code", code);
    } catch (_) {
      throw new BadRequestError("That invite code isn't valid.");
    }
    const expires = invite.getString("expiresAt");
    if (expires && new Date(expires.replace(" ", "T")) < new Date()) {
      throw new BadRequestError("That invite code has expired.");
    }
    const maxUses = invite.getInt("maxUses") || 1;
    if (existing) return; // already joined: nothing to use up
    if (invite.getInt("uses") >= maxUses) {
      throw new BadRequestError("That invite code has already been used.");
    }

    const user = new Record(txApp.findCollectionByNameOrId("users"));
    user.setEmail(email);
    user.setRandomPassword();
    txApp.save(user);

    invite.set("uses", invite.getInt("uses") + 1);
    txApp.save(invite);
  });

  return e.json(200, { ok: true });
});
