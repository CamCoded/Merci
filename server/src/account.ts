// Router groups related routes
import { Router } from "express";
// Zod checks the amount is valid
import { z } from "zod";
// The shared database client
import { prisma } from "./db.js";
// The token checkpoint
import { requireAuth } from "./middleware.js";

const router = Router();

// Every route in this file must pass requireAuth first
router.use(requireAuth);

// The rules for a valid amount:
// - sent in cents as a whole number (the frontend turns $500.00 into 50000)
// - more than 0, so no negative or zero amounts
// - at most $10,000.00 per transaction, a realistic bank limit
const amountSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000),
});

// GET /account returns the logged-in user's account
router.get("/", async (_req, res) => {
  // The user id comes from the token, so users only ever see their own account
  const account = await prisma.account.findUnique({
    where: { userId: res.locals.userId },
  });

  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  res.json({
    accountNumber: account.accountNumber,
    balanceCents: account.balanceCents,
  });
});

// POST /account/deposit adds money
router.post("/deposit", async (req, res) => {
  // Check the amount follows the rules
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter an amount between $0.01 and $10,000.00." });
  }
  const { amountCents } = parsed.data;

  // $transaction runs everything inside as ONE unit:
  // if any part fails, none of it is saved (no balance change without a record)
  const result = await prisma.$transaction(async (tx) => {
    // Add the amount to the balance; "increment" is done by the database itself
    const account = await tx.account.update({
      where: { userId: res.locals.userId },
      data: { balanceCents: { increment: amountCents } },
    });

    // Record the deposit in the history
    const record = await tx.transaction.create({
      data: {
        type: "DEPOSIT",
        amountCents,
        balanceAfterCents: account.balanceCents,
        accountId: account.id,
      },
    });

    return { account, record };
  });

  // 201 = created something (a new transaction)
  res.status(201).json({
    type: result.record.type,
    amountCents: result.record.amountCents,
    balanceCents: result.account.balanceCents,
    createdAt: result.record.createdAt,
  });
});

// POST /account/withdraw takes money out, only if there's enough
router.post("/withdraw", async (req, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter an amount between $0.01 and $10,000.00." });
  }
  const { amountCents } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    // The key safety move: check AND subtract in a single database step.
    // "Only subtract if the balance is at least this amount."
    // Checking first and subtracting after would let two withdrawals
    // at the same instant both pass the check and overdraw the account.
    const updated = await tx.account.updateMany({
      where: { userId: res.locals.userId, balanceCents: { gte: amountCents } },
      data: { balanceCents: { decrement: amountCents } },
    });

    // count = how many rows changed; 0 means there wasn't enough money
    if (updated.count === 0) {
      return null;
    }

    // Read the new balance
    const account = await tx.account.findUniqueOrThrow({
      where: { userId: res.locals.userId },
    });

    // Record the withdrawal in the history
    const record = await tx.transaction.create({
      data: {
        type: "WITHDRAWAL",
        amountCents,
        balanceAfterCents: account.balanceCents,
        accountId: account.id,
      },
    });

    return { account, record };
  });

  // Not enough money: send 422 plus the available balance,
  // so the screen can say "You only have $X available."
  if (!result) {
    const account = await prisma.account.findUnique({
      where: { userId: res.locals.userId },
    });
    return res.status(422).json({
      error: "Insufficient funds.",
      code: "INSUFFICIENT_FUNDS",
      availableCents: account?.balanceCents ?? 0,
    });
  }

  res.status(201).json({
    type: result.record.type,
    amountCents: result.record.amountCents,
    balanceCents: result.account.balanceCents,
    createdAt: result.record.createdAt,
  });
});

// GET /account/transactions returns the 20 most recent, newest first
router.get("/transactions", async (_req, res) => {
  const transactions = await prisma.transaction.findMany({
    // Only transactions on THIS user's account
    where: { account: { userId: res.locals.userId } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json(transactions);
});

export default router;