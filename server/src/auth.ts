import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "./db.js";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";

const router = Router();

const credentials = z.object({
  // Trim spaces and lowercase, so " Cam@Merci.dev" and "cam@merci.dev" are the same account
  email: z.string().trim().toLowerCase().email(),
  // bcrypt ignores everything past 72 bytes, so cap passwords well under that
  password: z.string().min(8).max(64),
});

// bcrypt cost; registration and the dummy hash must match so timing is identical
const BCRYPT_ROUNDS = 10;

// A real bcrypt hash of a throwaway password, made once when the server starts.
// Unknown emails get checked against it, so every login takes the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

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
  keyGenerator: (req) =>
    String(req.body?.email ?? "")
      .trim()
      .toLowerCase(),
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

// Layer 3: blocks a DEVICE after 10 sign-ups in an hour,
// so scripts can't spam accounts or mass-check which emails are taken
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour, in milliseconds
  limit: 10, // every sign-up attempt counts, successful or not
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-up attempts. Try again in an hour." },
});

function makeAccountNumber() {
  // randomInt uses the operating system's secure random source, so numbers can't be predicted.
  // The top is exclusive: this gives 1000000000 to 9999999999, always 10 digits.
  return randomInt(1_000_000_000, 10_000_000_000).toString();
}

router.post("/register", registerLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Enter a valid email and a password of 8 to 64 characters.",
    }); 
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res
      .status(409)
      .json({ error: "An account with that email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS); // ← changed

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

  // Always run bcrypt, even when the email doesn't exist,
  // so the response time can't reveal which emails have accounts
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (!user || !passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
  res.json({ token });
});

export default router;