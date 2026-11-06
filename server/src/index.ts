import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./auth.js";
// The protected account routes
import accountRoutes from "./account.js";

// Stop at startup if the token secret is missing or too short to be safe
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET is missing or shorter than 32 characters. Set it in .env.",
  );
}

// Only the Merci frontend may call this API from a browser
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();

// When deployed behind a host's proxy, set TRUST_PROXY=1 so the rate limiters see
// each user's real IP. Leave it unset locally, or anyone could fake their IP.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
}

// Adds security headers and hides "X-Powered-By: Express"
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.use("/auth", authRoutes);
// Everything in account.ts lives under /account
app.use("/account", accountRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Last stop for every error: log the details here, send the user a generic message,
// so stack traces and file paths never leave the server
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Errors like broken JSON carry a 4xx status: the request was bad, the server is fine
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: "Invalid request." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(4000, () => console.log("API on :4000"));
