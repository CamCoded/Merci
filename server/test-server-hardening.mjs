// Run with: node test-server-hardening.mjs (server must be running)
const API = "http://localhost:4000";

// Would a browser let a page on this origin read our API's responses?
const canRead = (res, origin) => {
  const allowed = res.headers.get("access-control-allow-origin");
  return allowed === "*" || allowed === origin ? "yes" : "no (browser blocks it)";
};

const evil = await fetch(API + "/health", { headers: { Origin: "https://evil.example" } });
const merci = await fetch(API + "/health", { headers: { Origin: "http://localhost:5173" } });
console.log("Evil site can read:", canRead(evil, "https://evil.example"));
console.log("Merci client can read:", canRead(merci, "http://localhost:5173"));
console.log("X-Powered-By:", evil.headers.get("x-powered-by") ?? "(hidden)");
console.log(
  "Security headers:",
  ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options"]
    .filter((h) => evil.headers.get(h))
    .join(", "),
);

const bad = await fetch(API + "/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{not json",
});
console.log("Broken JSON:", bad.status, await bad.text());