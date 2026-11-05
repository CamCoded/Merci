// Run with: node test-login-timing.mjs (restart the server first)
const API = "http://localhost:4000";
const password = "correct-password";
const post = (path, body) =>
  fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Average response time of 3 logins
async function avgTime(makeBody) {
  let total = 0, status;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    status = (await post("/auth/login", makeBody(i))).status;
    total += performance.now() - start;
  }
  return `${Math.round(total / 3)}ms (${status})`;
}

// Test 1: unknown emails should take as long as real ones
const email = `timing${Date.now()}@merci.dev`;
await post("/auth/register", { email, password });
console.log("Real email, wrong password:", await avgTime(() => ({ email, password: "wrong-password" })));
console.log("Unknown email:", await avgTime((i) => ({ email: `nobody${i}${Date.now()}@merci.dev`, password: "wrong-password" })));

// Test 2: caps and spaces are the same account
const caps = `Caps${Date.now()}@Merci.dev`;
const reg = await post("/auth/register", { email: `  ${caps}  `, password });
console.log("Saved as:", (await reg.json()).email);
console.log("Lowercase login:", (await post("/auth/login", { email: caps.toLowerCase(), password })).status);

// Test 3: passwords over 64 characters are rejected
const long = await post("/auth/register", { email: `long${Date.now()}@merci.dev`, password: "x".repeat(65) });
console.log("65-char password:", long.status);