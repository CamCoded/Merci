import express from "express";
import cors from "cors";
import authRoutes from "./auth.js";
// The protected account routes
import accountRoutes from "./account.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
// Everything in account.ts lives under /account
app.use("/account", accountRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(4000, () => console.log("API on :4000"));