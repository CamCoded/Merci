// Router groups related routes
import { Router } from "express";
// The shared database client
import { prisma } from "./db.js";
// The token checkpoint
import { requireAuth } from "./middleware.js";

const router = Router();

// Every route in this file must pass requireAuth first
router.use(requireAuth);

// GET /account returns the logged-in user's account
router.get("/", async (_req, res) => {
  // The user id comes from the token, so users can only ever see their own account
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

export default router;