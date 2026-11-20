/// <reference path="../pb_data/types.d.ts" />
// Open sign-up: asking for a sign-in code with a new email creates the account, so the first code
// signs you up. The public still can't create accounts any other way (users.createRule is null),
// and the sign-in code rate limit (users:requestOTP) caps how fast this can be used.

onRecordRequestOTPRequest((e) => {
  if (!e.record) {
    const email = String((e.requestInfo().body || {}).email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestError("Enter a valid email address.");
    }
    const user = new Record(e.collection);
    user.setEmail(email);
    user.setRandomPassword();
    e.app.save(user);
    e.record = user;
  }
  e.next();
}, "users");
