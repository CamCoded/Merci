// Types from Express so TypeScript knows what req, res, and next are
import type { Request, Response, NextFunction } from "express";
// jsonwebtoken checks that a token is real and not expired
import jwt from "jsonwebtoken";

// Middleware: runs BEFORE a route; "next" passes control to the route
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // The token arrives in a header like: "Authorization: Bearer abc123..."
  const header = req.headers.authorization;

  // No header, or it doesn't start with "Bearer "? Not logged in.
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "You need to log in." });
  }

  // Cut off "Bearer " (7 characters) to get just the token
  const token = header.slice(7);

  try {
    // Check the token with our secret and read what's inside it
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    // Save the user's id so the route can use it
    res.locals.userId = payload.userId;
    // Token is good, so continue to the route
    next();
  } catch {
    // Fake or expired token
    return res.status(401).json({ error: "Your session expired. Log in again." });
  }
}