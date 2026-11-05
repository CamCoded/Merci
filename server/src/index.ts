import express from "express";
import cors from "cors";
import authRoutes from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(4000, () => console.log("API on :4000"));