// Run with: node test-account-number.mjs (server must be running)
const post = (path, body) =>
  fetch("http://localhost:4000" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

for (let i = 0; i < 3; i++) {
  const res = await post("/auth/register", {
    email: `acct${i}${Date.now()}@merci.dev`,
    password: "correct-password",
  });
  const { accountNumber } = await res.json();
  console.log(res.status, accountNumber, accountNumber.length === 10 ? "✓ 10 digits" : "✗ wrong length");
}