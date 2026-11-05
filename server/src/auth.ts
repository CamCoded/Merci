import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "./db.js";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";

const router = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Lockout settings, kept in one place so they're easy to change
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Layer 1: blocks an EMAIL after 5 failed logins in 15 minutes.
// It counts any email typed in, real account or not,
// so the lockout can't be used to find out who has an account.
// The count goes up the instant a request arrives, so parallel requests can't sneak past.
const emailLimiter = rateLimit({
  windowMs: LOCK_MINUTES * 60 * 1000,
  limit: MAX_FAILED_ATTEMPTS,
  skipSuccessfulRequests: true, // successful logins don't count
  keyGenerator: (req) => String(req.body?.email ?? "").trim().toLowerCase(),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Same message as Layer 2, so attackers can't tell which limit they hit
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// Layer 2: blocks a DEVICE after 20 failed logins in 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes, in milliseconds
  limit: 20, // max failed attempts per device in that window
  skipSuccessfulRequests: true, // successful logins don't count
  standardHeaders: "draft-8", // tells the browser when it can try again
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

function makeAccountNumber() {
  return Math.floor(1_000_000_000 + Math.random() * 9_000_000_000).toString();
}

router.post("/register", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Enter a valid email and a password of 8+ characters." });
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res
      .status(409)
      .json({ error: "An account with that email already exists." });
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

// Handle POST /auth/login; both limiters run first, like middleware
router.post("/login", loginLimiter, emailLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
  res.json({ token });
});

export default router;