// Run with: node test-register-limit.mjs (restart the server first)
const post = (path, body) =>
  fetch("http://localhost:4000" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const statuses = [];
for (let i = 1; i <= 12; i++) {
  const res = await post("/auth/register", {
    email: `signup${i}${Date.now()}@merci.dev`,
    password: "correct-password",
  });
  statuses.push(res.status);
}
console.log("12 sign-ups:", statuses.join(" "));