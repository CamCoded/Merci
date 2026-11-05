// Run with: node test-login.mjs (server must be running)
const API = "http://localhost:4000";
const email = `test${Date.now()}@merci.dev`; // fresh email every run
const password = "correct-password";

const post = (path, body) =>
  fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

await post("/auth/register", { email, password });
console.log("Registered", email);

// Test 1: five wrong passwords, one after another
for (let i = 1; i <= 5; i++) {
  const res = await post("/auth/login", { email, password: "wrong-password" });
  console.log(`Wrong password #${i}:`, res.status);
}

// The right password should now be blocked too
const res = await post("/auth/login", { email, password });
console.log("Right password:", res.status, await res.json());

// Test 2: 15 wrong guesses fired at the same instant (the race)
const raceEmail = `race${Date.now()}@merci.dev`;
await post("/auth/register", { email: raceEmail, password });
const results = await Promise.all(
  Array.from({ length: 15 }, () =>
    post("/auth/login", { email: raceEmail, password: "wrong-password" }),
  ),
);
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
console.log("15 at once:", tally);