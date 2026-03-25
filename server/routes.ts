import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertHistoryEntrySchema, insertUserReviewSchema } from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";
import { scrapeMetaStore } from "./meta-scraper";
import { requireAuth, requireWriteAccess, requireRole } from "./auth";
import { sendTaskAssignmentEmail } from "./email";
import archiver from "archiver";
import multer from "multer";
import AdmZip from "adm-zip";
import cron from "node-cron";
import fs from "fs";
import path from "path";
function sanitizeHtml(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function sanitizeProject(d){const o={...d};["name","summary","producer","platforms","contract","phaseDetail","genre","targetAudience","referentName"].forEach(k=>{if(typeof o[k]==="string")o[k]=sanitizeHtml(o[k])});if(typeof o.progress==="number")o.progress=Math.max(0,Math.min(100,o.progress));return o}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Full backup download — returns a ZIP with JSON data + attachment files
  app.get("/api/backup", requireRole("admin"), async (_req, res) => {
    try {
      const projects = await storage.getProjects();
      const allReviews = await storage.getAllReviews();
      const allTasks = await storage.getTasks();
      const allUsers = (await storage.getUsers()).map(({ passwordHash, ...u }) => u);

      // Gather history entries for all projects
      const historyEntries: Record<string, any[]> = {};
      for (const p of projects) {
        const entries = await storage.getHistoryEntries(p.id);
        if (entries.length > 0) historyEntries[p.id] = entries;
      }

      // Gather notifications for all users
      const notifications: Record<string, any[]> = {};
      for (const u of allUsers) {
        const notifs = await storage.getNotifications(u.id);
        if (notifs.length > 0) notifications[u.id] = notifs;
      }

      // Build JSON backup (without base64 fileData to keep JSON small)
      const historyEntriesClean: Record<string, any[]> = {};
      const attachments: { path: string; data: string; }[] = [];

      for (const [projectId, entries] of Object.entries(historyEntries)) {
        historyEntriesClean[projectId] = entries.map((entry) => {
          if (entry.type === "file" && entry.fileData) {
            const safeName = (entry.fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
            const attachPath = "attachments/" + projectId + "/" + entry.id + "_" + safeName;
            attachments.push({ path: attachPath, data: entry.fileData });
            const { fileData, ...rest } = entry;
            return { ...rest, fileRef: attachPath };
          }
          return entry;
        });
      }

      const backup = {
        exportedAt: new Date().toISOString(),
        version: "2.0",
        projects,
        tasks: allTasks,
        users: allUsers,
        reviews: allReviews,
        historyEntries: historyEntriesClean,
        notifications,
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Disposition", "attachment; filename=\"storylab-backup-" + dateStr + ".zip\"");
      res.setHeader("Content-Type", "application/zip");

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err: Error) => {
        console.error("[backup] Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Backup generation failed" });
        }
      });
      archive.pipe(res);

      // Add JSON data
      archive.append(JSON.stringify(backup, null, 2), { name: "backup.json" });

      // Add attachment files (decoded from base64)
      for (const att of attachments) {
        const buf = Buffer.from(att.data, "base64");
        archive.append(buf, { name: att.path });
      }

      await archive.finalize();
    } catch (err: any) {
      console.error("[backup] Failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Backup generation failed" });
      }
    }
  });

  // Get all projects
  app.get("/api/projects", requireAuth, async (_req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  // Get single project
  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json(project);
  });

  // Create project
  app.post("/api/projects", requireWriteAccess, async (req, res) => {
    const parsed = insertProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid project data", errors: parsed.error.errors });
    }
    const project = await storage.createProject(sanitizeProject(parsed.data));
    res.status(201).json(project);
  });

  // Update project
  app.patch("/api/projects/:id", requireWriteAccess, async (req, res) => {
    const project = await storage.updateProject(req.params.id, sanitizeProject(req.body));
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json(project);
  });

  // Delete project
  app.delete("/api/projects/:id", requireRole("admin"), async (req, res) => {
    const success = await storage.deleteProject(req.params.id);
    if (!success) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.status(204).send();
  });

  // ── History entries ──

  // Get history entries for a project (newest first)
  app.get("/api/projects/:id/history", requireAuth, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const entries = await storage.getHistoryEntries(req.params.id);
    res.json(entries);
  });

  // Create a history entry (note or file)
  app.post("/api/projects/:id/history", requireWriteAccess, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const body = {
      ...req.body,
      projectId: req.params.id,
      createdAt: new Date().toISOString(),
    };
    const parsed = insertHistoryEntrySchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid history entry", errors: parsed.error.errors });
    }
    const entry = await storage.createHistoryEntry(parsed.data);
    res.status(201).json(entry);
  });

  // Delete a history entry
  app.delete("/api/history/:entryId", requireWriteAccess, async (req, res) => {
    const success = await storage.deleteHistoryEntry(req.params.entryId);
    if (!success) {
      return res.status(404).json({ message: "History entry not found" });
    }
    res.status(204).send();
  });

  // ── Reviews ──

  // Get reviews for a project
  app.get("/api/projects/:id/reviews", requireAuth, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const reviews = await storage.getReviews(req.params.id);
    res.json(reviews);
  });

  // Get all reviews (for exploitation dashboard)
  app.get("/api/reviews", requireAuth, async (_req, res) => {
    const reviews = await storage.getAllReviews();
    res.json(reviews);
  });

  // Create a review
  app.post("/api/projects/:id/reviews", requireWriteAccess, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const body = {
      ...req.body,
      projectId: req.params.id,
      createdAt: new Date().toISOString(),
    };
    const parsed = insertUserReviewSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid review data", errors: parsed.error.errors });
    }
    const review = await storage.createReview(parsed.data);
    res.status(201).json(review);
  });

  // Delete a review
  app.delete("/api/reviews/:reviewId", requireWriteAccess, async (req, res) => {
    const success = await storage.deleteReview(req.params.reviewId);
    if (!success) {
      return res.status(404).json({ message: "Review not found" });
    }
    res.status(204).send();
  });

  // Update download count & revenue for a project
  app.patch("/api/projects/:id/stats", requireWriteAccess, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const { downloadCount, revenue } = req.body;
    const updates: Record<string, any> = { statsUpdatedAt: new Date().toISOString() };
    if (downloadCount !== undefined) updates.downloadCount = Number(downloadCount) || 0;
    if (revenue !== undefined) updates.revenue = Number(revenue) || 0;
    const updated = await storage.updateProject(req.params.id, updates);
    res.json(updated);
  });

  // CSV upload for reviews — expects { csvContent: string } body
  // CSV format: rating,comment  (with optional header row)
  app.post("/api/projects/:id/reviews/csv", requireWriteAccess, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const { csvContent, replaceExisting } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      return res.status(400).json({ message: "csvContent is required" });
    }

    const lines = csvContent.split(/\r?\n/).filter((l: string) => l.trim());
    if (lines.length === 0) {
      return res.status(400).json({ message: "CSV is empty" });
    }

    // Detect header row
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes("rating") || firstLine.includes("note") || firstLine.includes("comment");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const reviews: Array<{ rating: number; comment: string }> = [];
    for (const line of dataLines) {
      // Support both comma and semicolon separators
      const sep = line.includes(";") ? ";" : ",";
      const parts = line.split(sep);
      if (parts.length < 2) continue;
      const rating = parseInt(parts[0].trim());
      const comment = parts.slice(1).join(sep).trim().replace(/^"|"$/g, "");
      if (isNaN(rating) || rating < 1 || rating > 5 || !comment) continue;
      reviews.push({ rating, comment });
    }

    if (reviews.length === 0) {
      return res.status(400).json({ message: "No valid reviews found in CSV. Expected format: rating,comment (1-5 scale)" });
    }

    // Optionally replace existing reviews
    if (replaceExisting) {
      await storage.deleteAllReviewsForProject(req.params.id);
    }

    const now = Date.now();
    const insertReviews = reviews.map((r, i) => ({
      projectId: req.params.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: new Date(now - i * 60000).toISOString(), // 1 minute apart
    }));

    const created = await storage.bulkCreateReviews(insertReviews);
    res.status(201).json({ imported: created.length, total: (await storage.getReviews(req.params.id)).length });
  });

  // Scrape reviews from Meta Store
  app.post("/api/projects/:id/scrape-reviews", requireWriteAccess, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    if (!project.metaStoreUrl) {
      return res.status(400).json({ message: "Ce projet n'a pas d'URL Meta Store configurée." });
    }

    try {
      const data = await scrapeMetaStore(project.metaStoreUrl);

      // Only update store metrics if scrape returned valid data (non-zero)
      const metricsUpdate: Record<string, any> = { lastScrapedAt: new Date().toISOString() };
      if (data.storeRating > 0) metricsUpdate.storeRating = data.storeRating;
      if (data.storeRatingCount > 0) metricsUpdate.storeRatingCount = data.storeRatingCount;
      if (data.storeReviewCount > 0) metricsUpdate.storeReviewCount = data.storeReviewCount;
      await storage.updateProject(req.params.id, metricsUpdate);

      // Only replace existing reviews if scrape returned a meaningful number
      // This prevents losing data when scraping fails partially
      const existingReviews = await storage.getReviews(req.params.id);
      let reviewsImported = 0;

      if (data.reviews.length > 0) {
        const insertReviews = data.reviews.map((r, i) => {
          // Parse the Meta Store date format: "Jan 2, 2026 at 5:26 AM"
          let createdAt: string;
          try {
            const cleaned = r.date.replace(' at ', ' ');
            const parsed = new Date(cleaned);
            createdAt = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
          } catch {
            createdAt = new Date().toISOString();
          }
          return {
            projectId: req.params.id,
            rating: r.rating,
            comment: `${r.title ? r.title + " \u2014 " : ""}${r.body || r.title || "(sans commentaire)"}`.trim(),
            createdAt,
          };
        });

        // Only replace if we scraped at least 50% of existing reviews count,
        // or if there were no existing reviews — prevents data loss on partial scrapes
        if (existingReviews.length === 0 || data.reviews.length >= existingReviews.length * 0.5) {
          await storage.deleteAllReviewsForProject(req.params.id);
          await storage.bulkCreateReviews(insertReviews);
          reviewsImported = insertReviews.length;
        } else {
          console.warn(`[scrape] Only got ${data.reviews.length} reviews vs ${existingReviews.length} existing — keeping existing reviews to avoid data loss`);
          reviewsImported = 0;
        }
      }

      res.json({
        storeRating: data.storeRating,
        storeRatingCount: data.storeRatingCount,
        storeReviewCount: data.storeReviewCount,
        reviewsImported,
        existingReviewsKept: reviewsImported === 0 && existingReviews.length > 0 ? existingReviews.length : 0,
      });
    } catch (error: any) {
      console.error("Scrape error:", error);
      res.status(500).json({
        message: "Erreur lors de la récupération des avis. " + (error.message || ""),
      });
    }
  });

  // AI analysis of reviews for a project
  app.post("/api/projects/:id/reviews/analyze", requireAuth, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const reviews = await storage.getReviews(req.params.id);
    if (reviews.length === 0) {
      return res.json({ analysis: "Aucun commentaire à analyser pour ce projet." });
    }

    const reviewsText = reviews.map((r, i) => `[Note: ${r.rating}/5] ${r.comment}`).join("\n");

    try {
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `Tu es un analyste de retours utilisateurs pour des expériences immersives VR/XR de France TV. Analyse les commentaires utilisateurs suivants pour le projet "${project.name}" et fournis un résumé structuré en français :

${reviewsText}

Fournis :
1. **Sentiment général** : tendance positive/négative/mitigée en une phrase
2. **Points appréciés** : liste des éléments positifs récurrents (2-4 points)
3. **Problèmes identifiés** : liste des critiques ou suggestions d'amélioration (2-4 points)
4. **Recommandation** : une suggestion d'action prioritaire

Sois concis et factuel. Réponds uniquement en français.`,
          },
        ],
      });

      const analysis = message.content[0].type === "text" ? message.content[0].text : "Analyse non disponible.";
      res.json({ analysis });
    } catch (error: any) {
      console.error("AI analysis error:", error);
      // Fallback: generate a simple statistical analysis without AI
      const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      const positiveCount = reviews.filter((r) => r.rating >= 4).length;
      const negativeCount = reviews.filter((r) => r.rating <= 2).length;
      const fallback = `📊 Analyse statistique (${reviews.length} avis) :\n\n` +
        `• Note moyenne : ${avgRating.toFixed(1)}/5\n` +
        `• Avis positifs (≥4★) : ${positiveCount} (${Math.round((positiveCount / reviews.length) * 100)}%)\n` +
        `• Avis négatifs (≤2★) : ${negativeCount} (${Math.round((negativeCount / reviews.length) * 100)}%)\n\n` +
        `⚠️ L'analyse IA détaillée n'est pas disponible actuellement.`;
      res.json({ analysis: fallback });
    }
  });

  // ── Tasks / Todos ──

  // Get all tasks (filtered by current user on frontend)
  app.get("/api/tasks", requireAuth, async (_req, res) => {
    const tasks = await storage.getTasks();
    res.json(tasks);
  });

  // Create a task
  app.post("/api/tasks", requireAuth, async (req, res) => {
    const { title, description, priority, assigneeId, projectIds, dueDate } = req.body;

    if (!title || !assigneeId) {
      return res.status(400).json({ message: "Le titre et l'assigné sont requis" });
    }

    const task = await storage.createTask({
      title,
      description: description || "",
      status: "todo",
      priority: priority || "medium",
      assigneeId,
      createdById: req.user!.id,
      projectIds: projectIds || [],
      dueDate: dueDate || undefined,
      createdAt: new Date().toISOString(),
    });

    // Create notification if assigned to someone else
    if (assigneeId !== req.user!.id) {
      await storage.createNotification({
        userId: assigneeId,
        type: "task_assigned",
        title: "Nouvelle tâche assignée",
        message: `${req.user!.displayName} vous a assigné : "${title}"`,
        link: task.id,
        read: false,
        createdAt: new Date().toISOString(),
      });

      // Send email notification to assignee (non-blocking)
      const assignee = await storage.getUser(assigneeId);
      if (assignee?.email) {
        const projectNames = [];
        for (const pid of (projectIds || [])) {
          const proj = await storage.getProject(pid);
          if (proj) projectNames.push(proj.name);
        }
        const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
        const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
        const appUrl = `${protocol}://${host}`;
        sendTaskAssignmentEmail({
          to: assignee.email,
          assigneeName: assignee.displayName,
          creatorName: req.user!.displayName,
          taskTitle: title,
          taskDescription: description,
          projectNames,
          dueDate,
          priority: priority || "medium",
          appUrl,
        }).catch(err => {
          console.error("[email] Failed to send task assignment email:", err.message);
        });
      }
    }

    res.status(201).json(task);
  });

  // Update a task (status, title, etc.)
  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const { title, description, status, priority, assigneeId, projectIds, dueDate } = req.body;
    const updates: Record<string, any> = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) {
      updates.status = status;
      if (status === "done") updates.completedAt = new Date().toISOString();
      if (status !== "done") updates.completedAt = undefined;
    }
    if (priority !== undefined) updates.priority = priority;
    if (assigneeId !== undefined) updates.assigneeId = assigneeId;
    if (projectIds !== undefined) updates.projectIds = projectIds;
    if (dueDate !== undefined) updates.dueDate = dueDate;

    const task = await storage.updateTask(req.params.id, updates);
    if (!task) return res.status(404).json({ message: "Tâche non trouvée" });

    res.json(task);
  });

  // Delete a task
  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    const success = await storage.deleteTask(req.params.id);
    if (!success) return res.status(404).json({ message: "Tâche non trouvée" });
    res.status(204).send();
  });

  // ── Notifications ──

  // Get notifications for current user
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const notifications = await storage.getNotifications(req.user!.id);
    res.json(notifications);
  });

  // Mark a notification as read
  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const success = await storage.markNotificationRead(req.params.id);
    if (!success) return res.status(404).json({ message: "Notification non trouvée" });
    res.json({ ok: true });
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    await storage.markAllNotificationsRead(req.user!.id);
    res.json({ ok: true });
  });

  // ── Restore endpoint ──
  const upload = multer({ dest: "/tmp/uploads/", limits: { fileSize: 200 * 1024 * 1024 } });
  app.post("/api/restore", requireRole("admin"), upload.single("backup"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const zip = new AdmZip(req.file.path);
      const backupEntry = zip.getEntry("backup.json");
      if (!backupEntry) return res.status(400).json({ message: "Invalid backup: missing backup.json" });

      const backupData = JSON.parse(backupEntry.getData().toString("utf8"));
      if (!backupData.projects || !backupData.historyEntries) {
        return res.status(400).json({ message: "Invalid backup: missing required data" });
      }

      // Re-embed attachments from ZIP into historyEntries
      for (const entry of backupData.historyEntries) {
        if (entry.attachments && Array.isArray(entry.attachments)) {
          for (const att of entry.attachments) {
            if (att.filename) {
              const zipFile = zip.getEntry("attachments/" + att.filename);
              if (zipFile) {
                att.fileData = zipFile.getData().toString("base64");
              }
            }
          }
        }
      }

      // Pre-restore backup
      const projectRoot = path.resolve(process.cwd());
      const dataFilePath = path.join(projectRoot, "data", "storage.json");
      if (fs.existsSync(dataFilePath)) {
        const preBackupDir = path.join(projectRoot, "backups");
        if (!fs.existsSync(preBackupDir)) fs.mkdirSync(preBackupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        fs.copyFileSync(dataFilePath, path.join(preBackupDir, `pre-restore-${ts}.json`));
      }

      // Write restored data
      const dataDir = path.join(projectRoot, "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(dataFilePath, JSON.stringify(backupData, null, 2));

      // Reload storage
      (storage as any).reloadFromDisk?.();

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ ok: true, message: "Restore successful", projects: backupData.projects.length, entries: backupData.historyEntries.length });
    } catch (err: any) {
      console.error("[restore] Failed:", err);
      res.status(500).json({ message: "Restore failed: " + err.message });
    }
  });

  // ── Auto-backup & retention ──
  async function performAutoBackup() {
    try {
      const projectRoot = path.resolve(process.cwd());
      const backupDir = path.join(projectRoot, "backups");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const dataFilePath = path.join(projectRoot, "data", "storage.json");
      if (!fs.existsSync(dataFilePath)) return;
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(dataFilePath, path.join(backupDir, `auto-${ts}.json`));
      console.log(`[auto-backup] Created backup auto-${ts}.json`);
    } catch (err) {
      console.error("[auto-backup] Failed:", err);
    }
  }

  function cleanOldBackups() {
    try {
      const projectRoot = path.resolve(process.cwd());
      const backupDir = path.join(projectRoot, "backups");
      if (!fs.existsSync(backupDir)) return;
      const files = fs.readdirSync(backupDir);
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      for (const file of files) {
        const filePath = path.join(backupDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > thirtyDays) {
          fs.unlinkSync(filePath);
          console.log(`[retention] Deleted old backup: ${file}`);
        }
      }
    } catch (err) {
      console.error("[retention] Cleanup failed:", err);
    }
  }

  // Daily backup at 3AM + cleanup
  cron.schedule("0 3 * * *", () => {
    performAutoBackup();
    cleanOldBackups();
  });

  // Startup backup after 60s
  setTimeout(() => performAutoBackup(), 60000);

  return httpServer;
}
