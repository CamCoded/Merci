import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "./db.js";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";

// Limits how many requests one device can make

const router = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
// Lockout settings, kept in one place so they're easy to change
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Layer 2: blocks a device after 20 failed logins in 15 minutes
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

// Handle POST /auth/login; loginLimiter runs first, like middleware
router.post("/login", loginLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Layer 1: is this account locked right now?
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    // Work out how many minutes are left, rounded up
    const minutesLeft = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000,
    );
    // 429 = too many requests
    return res.status(429).json({
      error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
    });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    // Count this failure
    const failures = user.failedLoginCount + 1;

    if (failures >= MAX_FAILED_ATTEMPTS) {
      // Hit the limit: lock the account and reset the counter
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
        },
      });
      return res.status(429).json({
        error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`,
      });
    }

    // Under the limit: just save the new count
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failures },
    });
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Correct password: clear any failures and any old lock
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
  res.json({ token });
});

export default router;