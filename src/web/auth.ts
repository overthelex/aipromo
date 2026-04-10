import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { sql } from "../storage/store.js";
import { appConfig } from "../config.js";

export const authRouter = Router();

const JWT_SECRET = appConfig.dashboardApiKey || "aipromo-default-secret";
const TOKEN_EXPIRY = "7d";
const COOKIE_NAME = "aipromo_token";

// Access control: which emails can see campaign accounts (igor/vladimir)
// Users not in this list see no campaign accounts; listed users see only their permitted accounts
const ACCOUNT_ACCESS: Record<string, string[]> = {
  "teosoph@gmail.com": ["ihor", "vladimir"],
  "shepherdvovkes@gmail.com": ["ihor", "vladimir"],
};

/** Returns account aliases the user is allowed to see, or null if unrestricted (admin fallback) */
export function getAllowedAccounts(user: { email?: string; role?: string }): string[] | null {
  if (user.email && ACCOUNT_ACCESS[user.email]) {
    return ACCOUNT_ACCESS[user.email];
  }
  // No entry = no access to campaign accounts (unless admin without email, e.g. API key)
  if (user.role === "admin" && !user.email) return null; // unrestricted (API key access)
  return [];
}

// --- i18n error messages ---
const messages = {
  usernamePasswordRequired: {
    en: "Username and password required",
    uk: "Ім'я користувача та пароль обов'язкові",
  },
  invalidCredentials: {
    en: "Invalid credentials",
    uk: "Невірні дані для входу",
  },
  notAuthenticated: {
    en: "Not authenticated",
    uk: "Не авторизований",
  },
  sessionExpired: {
    en: "Session expired",
    uk: "Сесія закінчилась",
  },
} as const;

type MsgKey = keyof typeof messages;

function getLang(req: Request): "en" | "uk" {
  const queryLang = (req.query.lang as string) || "";
  if (queryLang.startsWith("uk")) return "uk";
  const acceptLang = (req.headers["accept-language"] as string) || "";
  if (acceptLang.startsWith("uk")) return "uk";
  return "en";
}

function t(req: Request, key: MsgKey): string {
  return messages[key][getLang(req)];
}

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
  if (!username || !password) return res.status(400).json({ error: t(req, "usernamePasswordRequired") });

  const users = await sql`SELECT * FROM users WHERE username = ${username}`;
  if (users.length === 0) return res.status(401).json({ error: t(req, "invalidCredentials") });

  const user = users[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: t(req, "invalidCredentials") });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.display_name, email: user.email || "" },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
  res.json({ ok: true, user: { username: user.username, displayName: user.display_name, role: user.role } });
});

// --- Logout ---
authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// --- Current user ---
authRouter.get("/me", (req: Request, res: Response) => {
  // Parse JWT inline since authMiddleware doesn't run for /auth/* routes
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: t(req, "notAuthenticated") });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    res.json({ username: decoded.username, displayName: decoded.displayName, role: decoded.role, email: decoded.email });
  } catch {
    res.clearCookie(COOKIE_NAME);
    res.status(401).json({ error: t(req, "sessionExpired") });
  }
});

// --- Reset password (admin only, requires API key) ---
authRouter.post("/reset-password", async (req: Request, res: Response) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey || !appConfig.dashboardApiKey || apiKey !== appConfig.dashboardApiKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { username, newPassword } = req.body;
  if (!username || !newPassword) return res.status(400).json({ error: "username and newPassword required" });
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await sql`UPDATE users SET password_hash = ${hash} WHERE username = ${username} RETURNING username`;
  if (result.length === 0) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true, username: result[0].username });
});

// --- Google OAuth2 ---

function getOAuth2Client(): OAuth2Client | null {
  if (!appConfig.googleClientId || !appConfig.googleClientSecret) return null;
  return new OAuth2Client(
    appConfig.googleClientId,
    appConfig.googleClientSecret,
    appConfig.googleCallbackUrl || "https://selected.highfunk.uk/auth/google/callback"
  );
}

// Redirect to Google consent screen
authRouter.get("/google", (_req: Request, res: Response) => {
  const client = getOAuth2Client();
  if (!client) return res.status(500).json({ error: "Google OAuth not configured" });

  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  });
  res.redirect(url);
});

// Google OAuth callback
authRouter.get("/google/callback", async (req: Request, res: Response) => {
  const client = getOAuth2Client();
  if (!client) return res.redirect("/login?error=oauth_not_configured");

  const code = req.query.code as string;
  if (!code) return res.redirect("/login?error=no_code");

  try {
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: appConfig.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) return res.redirect("/login?error=invalid_token");

    const googleId = payload.sub;
    const email = payload.email || "";
    const displayName = payload.name || email;

    // Find user by google_id
    let found = await sql`SELECT * FROM users WHERE google_id = ${googleId}`;

    if (found.length === 0 && email) {
      // Try matching by email
      found = await sql`SELECT * FROM users WHERE email = ${email}`;
      if (found.length > 0) {
        // Link google_id to existing user
        await sql`UPDATE users SET google_id = ${googleId} WHERE id = ${found[0].id}`;
      }
    }

    if (found.length === 0) {
      // Auto-create user from Google account
      const username = (email.split("@")[0] || `google_${googleId}`).toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const dummyHash = await bcrypt.hash(Math.random().toString(36), 10);
      found = await sql`
        INSERT INTO users (username, password_hash, display_name, role, google_id, email)
        VALUES (${username}, ${dummyHash}, ${displayName}, 'user', ${googleId}, ${email})
        ON CONFLICT (username) DO UPDATE SET google_id = ${googleId}, email = ${email}
        RETURNING *
      `;
    }

    const user = found[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName: user.display_name, email: user.email || email },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
    res.redirect("/dashboard");
  } catch (err: any) {
    console.error("Google OAuth error:", err.message);
    res.redirect("/login?error=oauth_failed");
  }
});

// Check if Google OAuth is configured (public endpoint for login page)
authRouter.get("/google/enabled", (_req: Request, res: Response) => {
  res.json({ enabled: Boolean(appConfig.googleClientId && appConfig.googleClientSecret) });
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
  if (!token) return res.status(401).json({ error: t(req, "notAuthenticated") });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    res.status(401).json({ error: t(req, "sessionExpired") });
  }
}
