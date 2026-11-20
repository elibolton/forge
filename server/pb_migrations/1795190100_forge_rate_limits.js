/// <reference path="../pb_data/types.d.ts" />
// Tighter limits for the endpoints a stranger could hammer: joining with an invite code and asking
// for sign-in codes (each one sends an email). Per client IP; needs the X-Forwarded-For proxy
// header set in Settings when behind Tailscale Funnel or Cloudflare.
const RULES = [
  { label: "/api/forge/join", maxRequests: 5, duration: 60 },
  { label: "users:requestOTP", maxRequests: 5, duration: 900 },
];

migrate((app) => {
  const s = app.settings();
  s.rateLimits.enabled = true;
  const keep = s.rateLimits.rules.filter((r) => !RULES.some((x) => x.label === r.label));
  s.rateLimits.rules = [...keep, ...RULES.map((r) => ({ ...r, audience: "" }))];
  app.save(s);
}, (app) => {
  const s = app.settings();
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => !RULES.some((x) => x.label === r.label));
  app.save(s);
});
