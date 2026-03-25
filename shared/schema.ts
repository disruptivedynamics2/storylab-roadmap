import { z } from "zod";

// Timeline event for a specific month
export const timelineEventSchema = z.object({
  month: z.string(), // "2025-01" format
  description: z.string(),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

// Festival submission/selection entry
export const festivalEntrySchema = z.object({
  id: z.string(),
  festivalName: z.string(),
  year: z.number(),
  status: z.enum(["submitted", "selected", "awarded", "rejected"]),
  category: z.string().optional(), // e.g. "Best VR Experience"
  award: z.string().optional(), // e.g. "Grand Prix"
  screeningDate: z.string().optional(), // ISO date
  notes: z.string().optional(),
});

export type FestivalEntry = z.infer<typeof festivalEntrySchema>;

// Platform distribution entry (multi-store tracking)
export const platformEntrySchema = z.object({
  id: z.string(),
  platformName: z.string(), // e.g. "Meta Quest", "Steam VR", "Apple Vision Pro"
  storeUrl: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().optional(),
  reviewCount: z.number().optional(),
  downloadCount: z.number().optional(),
  revenue: z.number().optional(),
  releaseDate: z.string().optional(),
  lastUpdated: z.string().optional(),
});

export type PlatformEntry = z.infer<typeof platformEntrySchema>;

// Immersive engagement KPIs
export const engagementKpisSchema = z.object({
  avgSessionDuration: z.number().optional(), // in minutes
  completionRate: z.number().min(0).max(100).optional(), // percentage
  retentionD1: z.number().min(0).max(100).optional(), // day 1 retention %
  retentionD7: z.number().min(0).max(100).optional(), // day 7 retention %
  motionSicknessRate: z.number().min(0).max(100).optional(), // % reported
  totalSessions: z.number().optional(),
  avgInteractions: z.number().optional(), // avg interactions per session
  lastUpdated: z.string().optional(),
});

export type EngagementKpis = z.infer<typeof engagementKpisSchema>;

// Notification entry (stored per-user)
export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(), // target user
  type: z.enum(["task_assigned", "deadline_approaching", "negative_reviews", "festival_result", "general"]),
  title: z.string(),
  message: z.string(),
  link: z.string().optional(), // e.g. project id or task id
  read: z.boolean().default(false),
  createdAt: z.string(),
});

export type Notification = z.infer<typeof notificationSchema>;

// Project schema
export const projectSchema = z.object({
  id: z.string(),
  phase: z.enum(["ETUDE", "DEV", "PROD", "EXPLOITATION", "ABANDON"]),
  phaseDetail: z.string().optional(),
  name: z.string(),
  summary: z.string(),
  formats: z.array(z.string()),
  producer: z.string(),
  platforms: z.string(),
  languages: z.array(z.string()),
  contract: z.string(),
  endOfRights: z.string(),
  timeline: z.array(timelineEventSchema),
  progress: z.number().min(0).max(100).optional(),
  metaStoreUrl: z.string().optional(),
  storeRating: z.number().min(0).max(5).optional(),
  storeRatingCount: z.number().optional(),
  storeReviewCount: z.number().optional(),
  lastScrapedAt: z.string().optional(),
  downloadCount: z.number().optional(),
  revenue: z.number().optional(),
  statsUpdatedAt: z.string().optional(),
  referentName: z.string().optional(),
  referentEmail: z.string().optional(),
  // Tags & categorization (7)
  tags: z.array(z.string()).optional(), // free-form tags
  technology: z.enum(["VR", "AR", "MR", "360", "WebXR", "Flat", "Other"]).optional(),
  genre: z.string().optional(), // e.g. "Documentaire", "Fiction", "Jeu"
  targetAudience: z.string().optional(),
  // Festival tracking (2)
  festivals: z.array(festivalEntrySchema).optional(),
  // Multi-platform distribution (3)
  platformEntries: z.array(platformEntrySchema).optional(),
  // Immersive engagement KPIs (5)
  engagementKpis: engagementKpisSchema.optional(),
});

export type Project = z.infer<typeof projectSchema>;

export const insertProjectSchema = projectSchema.omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

// History entry for project notes and files
export const historyEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(["note", "file"]),
  content: z.string(), // note text or file description
  fileName: z.string().optional(), // original filename for file entries
  fileData: z.string().optional(), // base64-encoded file content
  fileMimeType: z.string().optional(),
  createdAt: z.string(), // ISO date string
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const insertHistoryEntrySchema = historyEntrySchema.omit({ id: true });
export type InsertHistoryEntry = z.infer<typeof insertHistoryEntrySchema>;

// User review for exploitation projects
export const userReviewSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string(),
  createdAt: z.string(), // ISO date string
});

export type UserReview = z.infer<typeof userReviewSchema>;

export const insertUserReviewSchema = userReviewSchema.omit({ id: true });
export type InsertUserReview = z.infer<typeof insertUserReviewSchema>;

// App user for authentication
export const appUserSchema = z.object({
  id: z.string(),
  username: z.string().min(3),
  passwordHash: z.string(),
  displayName: z.string(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "editor", "viewer"]), // admin=full, editor=read+write, viewer=read only
  createdAt: z.string(),
  lastLoginAt: z.string().optional(),
});

export type AppUser = z.infer<typeof appUserSchema>;

export const insertAppUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8, "Min 8 caracteres"),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(["admin", "editor", "viewer"]),
});

export type InsertAppUser = z.infer<typeof insertAppUserSchema>;

// Safe user type (without password hash) for client
export const safeUserSchema = appUserSchema.omit({ passwordHash: true });
export type SafeUser = z.infer<typeof safeUserSchema>;

// Task / Todo
export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "done"]),
  priority: z.enum(["low", "medium", "high"]),
  assigneeId: z.string(), // user id of the person assigned
  createdById: z.string(), // user id of the creator
  projectIds: z.array(z.string()), // linked project ids
  dueDate: z.string().optional(), // ISO date
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export type Task = z.infer<typeof taskSchema>;

export const insertTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  assigneeId: z.string(),
  projectIds: z.array(z.string()).default([]),
  dueDate: z.string().optional(),
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
