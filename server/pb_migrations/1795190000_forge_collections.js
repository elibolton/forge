/// <reference path="../pb_data/types.d.ts" />
// Forge data collections. Every synced record has the same shape: the app's own record as JSON in
// `body`, plus the fields sync needs. The server never interprets workouts, so it can't drift from
// the app's format, and the app's decoders already handle old and odd data.
//
//   owner      the user it belongs to (deleted with the user)
//   clientId   the app's own id; unique per owner
//   body       the record, in the app's format
//   updatedAt  client time in ms, for last-write-wins
//   deleted    tombstone, so deletions sync too
//   created / updated   server time; `updated` is the pull cursor
//
// Collections mirror the phone's stores: workouts (logs), activities (cardio), bodyweights,
// templates (saved workouts), and state (single values such as the profile, keyed by name).

const SYNCED = [
  { name: "workouts", maxSize: 2000000 },
  { name: "activities", maxSize: 200000 },
  { name: "bodyweights", maxSize: 50000 },
  { name: "templates", maxSize: 500000 },
  { name: "state", maxSize: 5000000 },
];

const MINE = "owner = @request.auth.id";
// Owner can't be changed to someone else on update.
const UPDATE = MINE + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";
const CREATE = "@request.auth.id != '' && @request.auth.collectionName = 'users' && @request.body.owner = @request.auth.id";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // Sign-in: email code only. Accounts are created by the invite hook, never by the public.
  users.otp.enabled = true;
  users.otp.length = 6;
  users.otp.duration = 600;
  users.passwordAuth.enabled = false;
  users.oauth2.enabled = false;
  users.authAlert.enabled = false;
  users.createRule = null;
  users.otp.emailTemplate.subject = "Your Forge code: {OTP}";
  users.otp.emailTemplate.body =
    "<p>Your Forge sign-in code is <strong>{OTP}</strong>.</p>" +
    "<p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>";
  app.save(users);

  for (const s of SYNCED) {
    const c = new Collection({
      type: "base",
      name: s.name,
      listRule: MINE,
      viewRule: MINE,
      createRule: CREATE,
      updateRule: UPDATE,
      deleteRule: MINE,
      fields: [
        { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: "text", name: "clientId", required: true, min: 1, max: 200 },
        { type: "json", name: "body", maxSize: s.maxSize },
        { type: "number", name: "updatedAt", onlyInt: true },
        { type: "bool", name: "deleted" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: [
        `CREATE UNIQUE INDEX idx_${s.name}_owner_client ON ${s.name} (owner, clientId)`,
        `CREATE INDEX idx_${s.name}_owner_updated ON ${s.name} (owner, updated)`,
      ],
    });
    app.save(c);
  }

  // Invite codes: superusers only (all rules null).
  app.save(new Collection({
    type: "base",
    name: "invites",
    fields: [
      { type: "text", name: "code", required: true, min: 6, max: 64 },
      { type: "number", name: "maxUses", onlyInt: true, min: 1 },
      { type: "number", name: "uses", onlyInt: true, min: 0 },
      { type: "date", name: "expiresAt" },
      { type: "text", name: "note", max: 200 },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_invites_code ON invites (code)"],
  }));
}, (app) => {
  for (const name of ["invites", ...SYNCED.map((s) => s.name).reverse()]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users");
  users.passwordAuth.enabled = true;
  users.otp.enabled = false;
  users.createRule = "";
  app.save(users);
});
