import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sql } from "../storage/store.js";
import { appConfig } from "../config.js";

export const authRouter = Router();

const JWT_SECRET = appConfig.dashboardApiKey || "aipromo-default-secret";
const TOKEN_EXPIRY = "7d";
const COOKIE_NAME = "aipromo_token";

// --- Seed default users ---
export async function seedUsers() {
  const existing = await sql`SELECT COUNT(*) as count FROM users`;
  if (Number(existing[0].count) > 0) return;

  const users = [
    { username: "igor", displayName: "Ihor Kyrychenko", role: "admin" },
    { username: "vladimir", displayName: "Vladimir Ovcharov", role: "admin" },
  ];

  for (const u of users) {
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);
    await sql`
      INSERT INTO users (username, password_hash, display_name, role)
      VALUES (${u.username}, ${hash}, ${u.displayName}, ${u.role})
      ON CONFLICT (username) DO NOTHING
    `;
    console.log(`User created: ${u.username} / ${password}`);
  }
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// --- Login endpoint ---
authRouter.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const users = await sql`SELECT * FROM users WHERE username = ${username}`;
  if (users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

  const user = users[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true, user: { username: user.username, displayName: user.display_name, role: user.role } });
});

// --- Logout ---
authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// --- Current user ---
authRouter.get("/me", (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json(user);
});

// --- Auth middleware ---
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for login, health, webhooks, static files
  if (req.path === "/auth/login" || req.path === "/health" || req.path.startsWith("/webhook")) return next();
  if (!req.path.startsWith("/api") && !req.path.startsWith("/auth")) return next();

  // Check API key (for programmatic access)
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey && appConfig.dashboardApiKey && apiKey === appConfig.dashboardApiKey) {
    (req as any).user = { username: "api", role: "admin", displayName: "API" };
    return next();
  }

  // Check JWT cookie
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    res.status(401).json({ error: "Session expired" });
  }
}
