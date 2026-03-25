import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { Express, Request, Response, NextFunction } from "express";
import type { AppUser, SafeUser } from "@shared/schema";
import bcrypt from "bcryptjs";
const { hashSync, compareSync } = bcrypt;
import { sendInvitationEmail } from "./email";

// Extend Express types for session user
declare global {
  namespace Express {
    interface User extends SafeUser {}
  }
}

function toSafeUser(user: AppUser): SafeUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function setupAuth(app: Express) {
  // Passport Local Strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Identifiant incorrect" });
        }
        if (!compareSync(password, user.passwordHash)) {
          return done(null, false, { message: "Mot de passe incorrect" });
        }
        // Update last login
        await storage.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
        return done(null, toSafeUser(user));
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      done(null, toSafeUser(user));
    } catch (err) {
      done(err);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());

  // Create default admin user if no users exist
  createDefaultAdmin();

  // ── Auth routes ──

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: SafeUser | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Échec de connexion" });
      }
      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Erreur lors de la déconnexion" });
      res.json({ message: "Déconnecté" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Non connecté" });
    }
    res.json(req.user);
  });

  // ── Admin routes (user management) ──

  app.get("/api/admin/users", requireRole("admin"), async (_req, res) => {
    const users = await storage.getUsers();
    res.json(users.map(toSafeUser));
  });

  app.post("/api/admin/users", requireRole("admin"), async (req, res) => {
    const { username, password, displayName, role, email } = req.body;

    if (!username || !password || !displayName || !role) {
      return res.status(400).json({ message: "Tous les champs sont requis" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 4 caractères" });
    }

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Ce nom d'utilisateur existe déjà" });
    }

    const userData = {
      username,
      passwordHash: hashSync(password, 10),
      displayName,
      role,
      createdAt: new Date().toISOString(),
    };
    if (email) userData.email = email;
    const user = await storage.createUser(userData);

    res.status(201).json(toSafeUser(user));
  });

  app.patch("/api/admin/users/:id", requireRole("admin"), async (req, res) => {
    const { displayName, role, password, email } = req.body;
    const updates: Partial<AppUser> = {};

    if (displayName) updates.displayName = displayName;
    if (role) updates.role = role;
    if (email !== undefined) updates.email = email || undefined;
    if (password) {
      if (password.length < 8) return res.status(400).json({ message: "Min 8 caractères" });
      if (!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)) return res.status(400).json({ message: "Majuscule, minuscule et chiffre requis" });
      updates.passwordHash = hashSync(password, 10);
    }

    const user = await storage.updateUser(req.params.id, updates);
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.json(toSafeUser(user));
  });

  app.delete("/api/admin/users/:id", requireRole("admin"), async (req, res) => {
    // Prevent deleting yourself
    if (req.user && req.params.id === req.user.id) {
      return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" });
    }

    const success = await storage.deleteUser(req.params.id);
    if (!success) return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.status(204).send();
  });

  // ── Send invitation email ──

  app.post("/api/admin/users/:id/invite", requireRole("admin"), async (req, res) => {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ message: "L'adresse email est requise" });
    }
    if (!password) {
      return res.status(400).json({ message: "Le mot de passe est requis pour l'envoi de l'invitation" });
    }

    const user = await storage.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Determine the app URL from the request
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
    const appUrl = `${protocol}://${host}`;

    try {
      await sendInvitationEmail({
        to: email,
        username: user.username,
        password,
        displayName: user.displayName,
        role: user.role,
        appUrl,
      });
      res.json({ message: `Invitation envoyée à ${email}` });
    } catch (err: any) {
      console.error("[email] Failed to send invitation:", err.message);
      res.status(500).json({ message: `Erreur d'envoi : ${err.message}` });
    }
  });
}

// ── Middleware helpers ──

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Connexion requise" });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Connexion requise" });
    }
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Accès interdit — droits insuffisants" });
    }
    next();
  };
}

export function requireWriteAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Connexion requise" });
  }
  if (!req.user || req.user.role === "viewer") {
    return res.status(403).json({ message: "Accès en lecture seule — modification interdite" });
  }
  next();
}

// Create default admin if no users exist
async function createDefaultAdmin() {
  const users = await storage.getUsers();
  if (users.length === 0) {
    const admin = await storage.createUser({
      username: "vincent",
      passwordHash: hashSync("storylab2025", 10),
      displayName: "Vincent",
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    console.log(`[auth] Default admin created (username: vincent, password: storylab2025) — CHANGE THIS PASSWORD IN PRODUCTION!`);
  }
}
