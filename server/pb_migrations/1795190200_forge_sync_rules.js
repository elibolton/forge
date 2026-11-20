/// <reference path="../pb_data/types.d.ts" />
// Sync support:
// - An update older than the server's copy is refused (the record looks missing, 404), so a device
//   that hasn't pulled yet can't overwrite a newer change from another device. The app then fetches
//   the newer copy instead.
// - Sign-ins last 90 days, renewed each time the app opens, so people aren't asked for a code weekly.
const SYNCED = ["workouts", "activities", "bodyweights", "templates", "state"];
const MINE = "owner = @request.auth.id";
const NO_OWNER_CHANGE = "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";
const NOT_OLDER = "(@request.body.updatedAt:isset = false || @request.body.updatedAt >= updatedAt)";

migrate((app) => {
  for (const name of SYNCED) {
    const c = app.findCollectionByNameOrId(name);
    c.updateRule = `${MINE} && ${NO_OWNER_CHANGE} && ${NOT_OLDER}`;
    app.save(c);
  }
  const users = app.findCollectionByNameOrId("users");
  users.authToken.duration = 90 * 24 * 60 * 60;
  app.save(users);
}, (app) => {
  for (const name of SYNCED) {
    const c = app.findCollectionByNameOrId(name);
    c.updateRule = `${MINE} && ${NO_OWNER_CHANGE}`;
    app.save(c);
  }
  const users = app.findCollectionByNameOrId("users");
  users.authToken.duration = 7 * 24 * 60 * 60;
  app.save(users);
});
