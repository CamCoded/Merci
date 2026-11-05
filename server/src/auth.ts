import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "./db.js";
import jwt from "jsonwebtoken";

const router = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function makeAccountNumber() {
  return Math.floor(1_000_000_000 + Math.random() * 9_000_000_000).toString();
}

router.post("/register", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email and a password of 8+ characters." });
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      account: { create: { accountNumber: makeAccountNumber() } },
    },
    include: { account: true },
  });

  res.status(201).json({
    email: user.email,
    accountNumber: user.account!.accountNumber,
    balanceCents: user.account!.balanceCents,
  });
});

// Handle POST requests to /auth/login
router.post("/login", async (req, res) => {
  // Check the email and password match the same rules as signup
  const parsed = credentials.safeParse(req.body);

  // If the data is bad, send the same vague error as a wrong password
  // (so we don't reveal anything about what went wrong)
  if (!parsed.success) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Pull out the email and password they typed
  const { email, password } = parsed.data;

  // Find the user with that email (null if no one has it)
  const user = await prisma.user.findUnique({ where: { email } });

  // No user with that email? Same vague error.
  // If we said "email not found," attackers could test which emails have accounts.
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // bcrypt hashes the typed password and compares it to the stored hash
  // Returns true if they match, false if not
  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  // Wrong password? Same vague error again.
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Everything checks out, so create a token
  const token = jwt.sign(
    // What's stored inside the token: just the user's id
    { userId: user.id },
    // The secret from .env that signs it (only your server can make valid tokens)
    process.env.JWT_SECRET!,
    // The token stops working after 1 hour, so the user has to log in again
    { expiresIn: "1h" }
  );

  // Send the token back with 200 (OK)
  res.json({ token });
});

export default router;