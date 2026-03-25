import { type Project, type InsertProject, type HistoryEntry, type InsertHistoryEntry, type UserReview, type InsertUserReview, type AppUser, type Task, type Notification } from "@shared/schema";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// ESM/CJS compat handled in getDataFilePath
// using process.cwd() instead

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  getHistoryEntries(projectId: string): Promise<HistoryEntry[]>;
  createHistoryEntry(entry: InsertHistoryEntry): Promise<HistoryEntry>;
  deleteHistoryEntry(id: string): Promise<boolean>;
  getReviews(projectId: string): Promise<UserReview[]>;
  getAllReviews(): Promise<UserReview[]>;
  createReview(review: InsertUserReview): Promise<UserReview>;
  bulkCreateReviews(reviews: InsertUserReview[]): Promise<UserReview[]>;
  deleteReview(id: string): Promise<boolean>;
  deleteAllReviewsForProject(projectId: string): Promise<number>;
  // Users
  getUsers(): Promise<AppUser[]>;
  getUser(id: string): Promise<AppUser | undefined>;
  getUserByUsername(username: string): Promise<AppUser | undefined>;
  createUser(user: Omit<AppUser, "id">): Promise<AppUser>;
  updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser | undefined>;
  deleteUser(id: string): Promise<boolean>;
  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: Omit<Task, "id">): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notif: Omit<Notification, "id">): Promise<Notification>;
  markNotificationRead(id: string): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<void>;
}

// ── Persistent JSON file path ──
// In production, store next to the built server so it survives redeploys.
// The data directory is at the project root (parent of dist/).
function getDataFilePath(): string {
  // __dirname in the bundled CJS is dist/, so go up one level to project root
  // In dev mode, __dirname is server/, go up one level too
  const projectRoot = process.env.NODE_ENV === "production"
    ? process.cwd()
    : process.cwd();
  const dataDir = resolve(projectRoot, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return resolve(dataDir, "storage.json");
}

interface StorageData {
  projects: Record<string, Project>;
  historyEntries: Record<string, HistoryEntry>;
  reviews: Record<string, UserReview>;
  users: Record<string, AppUser>;
  tasks: Record<string, Task>;
  notifications: Record<string, Notification>;
}

export class FileStorage implements IStorage {
  private projects: Map<string, Project>;
  private historyEntries: Map<string, HistoryEntry>;
  private reviews: Map<string, UserReview>;
  private users: Map<string, AppUser>;
  private tasks: Map<string, Task>;
  private notifications: Map<string, Notification>;
  private filePath: string;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.projects = new Map();
    this.historyEntries = new Map();
    this.reviews = new Map();
    this.users = new Map();
    this.tasks = new Map();
    this.notifications = new Map();
    this.filePath = getDataFilePath();

    if (existsSync(this.filePath)) {
      this.loadFromDisk();
      console.log(`[storage] Loaded data from ${this.filePath} (${this.projects.size} projects, ${this.historyEntries.size} history entries, ${this.reviews.size} reviews)`);
    } else {
      this.seedData();
      this.saveToDisk();
      console.log(`[storage] First run — seeded ${this.projects.size} projects and saved to ${this.filePath}`);
    }
  }

  // ── Persistence ──

  private loadFromDisk() {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const data: StorageData = JSON.parse(raw);
      this.projects = new Map(Object.entries(data.projects || {}));
      this.historyEntries = new Map(Object.entries(data.historyEntries || {}));
      this.reviews = new Map(Object.entries(data.reviews || {}));
      this.users = new Map(Object.entries(data.users || {}));
      this.tasks = new Map(Object.entries(data.tasks || {}));
      this.notifications = new Map(Object.entries(data.notifications || {}));
    } catch (err) {
      console.error("[storage] Failed to load data file, starting with seed data:", err);
      this.seedData();
      this.saveToDisk();
    }
  }

  public reloadFromDisk() {
    this.loadFromDisk();
    console.log("[storage] Reloaded data from disk");
  }

  private saveToDisk() {
    // Debounce writes: wait 500ms after last change before writing
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const data: StorageData = {
          projects: Object.fromEntries(this.projects),
          historyEntries: Object.fromEntries(this.historyEntries),
          reviews: Object.fromEntries(this.reviews),
          users: Object.fromEntries(this.users),
          tasks: Object.fromEntries(this.tasks),
          notifications: Object.fromEntries(this.notifications),
        };
        writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
      } catch (err) {
        console.error("[storage] Failed to save data:", err);
      }
    }, 500);
  }

  // ── Projects ──

  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { ...insertProject, id };
    this.projects.set(id, project);
    this.saveToDisk();
    return project;
  }

  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.projects.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    for (const [entryId, entry] of this.historyEntries) {
      if (entry.projectId === id) this.historyEntries.delete(entryId);
    }
    for (const [reviewId, review] of this.reviews) {
      if (review.projectId === id) this.reviews.delete(reviewId);
    }
    const result = this.projects.delete(id);
    if (result) this.saveToDisk();
    return result;
  }

  // ── History entries ──

  async getHistoryEntries(projectId: string): Promise<HistoryEntry[]> {
    return Array.from(this.historyEntries.values())
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createHistoryEntry(entry: InsertHistoryEntry): Promise<HistoryEntry> {
    const id = randomUUID();
    const historyEntry: HistoryEntry = { ...entry, id };
    this.historyEntries.set(id, historyEntry);
    this.saveToDisk();
    return historyEntry;
  }

  async deleteHistoryEntry(id: string): Promise<boolean> {
    const result = this.historyEntries.delete(id);
    if (result) this.saveToDisk();
    return result;
  }

  // ── Reviews ──

  async getReviews(projectId: string): Promise<UserReview[]> {
    return Array.from(this.reviews.values())
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAllReviews(): Promise<UserReview[]> {
    return Array.from(this.reviews.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createReview(review: InsertUserReview): Promise<UserReview> {
    const id = randomUUID();
    const entry: UserReview = { ...review, id };
    this.reviews.set(id, entry);
    this.saveToDisk();
    return entry;
  }

  async bulkCreateReviews(reviews: InsertUserReview[]): Promise<UserReview[]> {
    const created: UserReview[] = [];
    for (const review of reviews) {
      const id = randomUUID();
      const entry: UserReview = { ...review, id };
      this.reviews.set(id, entry);
      created.push(entry);
    }
    this.saveToDisk();
    return created;
  }

  async deleteReview(id: string): Promise<boolean> {
    const result = this.reviews.delete(id);
    if (result) this.saveToDisk();
    return result;
  }

  async deleteAllReviewsForProject(projectId: string): Promise<number> {
    let count = 0;
    for (const [id, review] of this.reviews) {
      if (review.projectId === projectId) {
        this.reviews.delete(id);
        count++;
      }
    }
    if (count > 0) this.saveToDisk();
    return count;
  }

  // ── Seed data (only used on first run when no data file exists) ──

  private seedData() {
    const seedProjects: InsertProject[] = [
      {
        phase: "DEV",
        phaseDetail: "en attente - Rendu de dev / proto prévu fin janvier",
        name: "Je te Mens",
        summary: "JE TE MENS est une expérience immersive aux allures de huis clos psychologique. Vous y entretenez une relation intense avec une véritable intelligence artificielle nommée LOÏE, avec laquelle vous interagissez par la voix.",
        formats: ["VR Standalone"],
        producer: "Jérémy Sahel - Da Prod",
        platforms: "A définir",
        languages: ["FR", "EN"],
        contract: "Développement - en cours de rédaction",
        endOfRights: "/",
        timeline: [
          { month: "2025-05", description: "Début dev" },
          { month: "2025-10", description: "Réunion écriture / tech semaine du 20/09 à caler" },
          { month: "2026-02", description: "Rendu de dev (édito, proto, note technique)" },
          { month: "2026-04", description: "Validation du prototype et retours" }
        ],
        progress: 10
      },
      {
        phase: "DEV",
        phaseDetail: "en attente - Livraison GDD ok",
        name: "The Footage",
        summary: "THE FOOTAGE is a seated, single-player VR game where you play as the video tech on a two-person mobile news crew at the site of a BLOODY MASSACRE in the late summer of 2009",
        formats: ["VR Standalone", "PCVR"],
        producer: "ATLAS V",
        platforms: "Meta Quest, Steam",
        languages: ["FR", "EN"],
        contract: "Développement - en cours de rédaction",
        endOfRights: "/",
        timeline: [
          { month: "2025-05", description: "Début dev" },
          { month: "2026-01", description: "Livraison GDD" },
          { month: "2026-02", description: "Rendu de dev (édito, proto)" },
          { month: "2026-05", description: "Phase de tests utilisateurs" }
        ],
        progress: 15
      },
      {
        phase: "DEV",
        phaseDetail: "en attente - Voir avec Jeanne",
        name: "Gwo Ka",
        summary: "GWO KA ODYSSEY est une expérience immersive en réalité virtuelle multi-utilisateurs, conçue en partenariat par Eye & Eye et BackLight. Cette expérience invite les participants à plonger dans l'histoire du Gwo Ka, un genre musical traditionnel emblématique de la Guadeloupe.",
        formats: ["VR Standalone", "VR Collective", "Dôme", "Mapping"],
        producer: "Backlight (Frédéric Lecompte)",
        platforms: "Meta Quest",
        languages: ["FR", "EN"],
        contract: "Développement - en cours de rédaction",
        endOfRights: "/",
        timeline: [
          { month: "2025-02", description: "Livrables dev : Script / scénario, Prototype, Note sur le son" },
          { month: "2025-05", description: "Début dev" },
          { month: "2025-07", description: "Obtention aide dev CNC" },
          { month: "2025-08", description: "Appeler Fred - ou allez le voir pour en discuter" },
          { month: "2025-11", description: "7/10 rdv chez Backlight avec Priscilla" },
          { month: "2026-02", description: "Rendu de dev (édito, proto)" }
        ],
        progress: 20
      },
      {
        phase: "DEV",
        phaseDetail: "Update demandé le 19/11",
        name: "AMORPHOUS",
        summary: "A playful, experiential piece about the edges of our bodies",
        formats: ["VR Standalone", "VR Collective", "Exposition immersive"],
        producer: "Floréal - Katayoun Dibamehr, Avi AMAR",
        platforms: "Meta Quest Store",
        languages: ["FR", "EN"],
        contract: "Développement - contrat signé",
        endOfRights: "/",
        timeline: [
          { month: "2025-02", description: "Début dev" },
          { month: "2025-04", description: "Point avec Anagram sur l'écriture" },
          { month: "2025-08", description: "Quelle suite à donner post Cannes ?" },
          { month: "2025-10", description: "Point tout début septembre / 28/08 - 01/09 Mostra" },
          { month: "2025-12", description: "Rendu dev" }
        ],
        progress: 40
      },
      {
        phase: "DEV",
        phaseDetail: "Livraison décembre",
        name: "BETA AQUARI",
        summary: "Beta Aquarii est un projet immersif d'un genre nouveau, à la frontière des arts graphiques et de la science. Par François Vautier",
        formats: ["Vidéo 360 (stéréoscopique)", "Mapping (interactif)", "Dôme"],
        producer: "Jérémy Sahel - Da Prod",
        platforms: "A définir",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "/",
        timeline: [
          { month: "2025-08", description: "Livraison finale dev (?) - prendre des nouvelles" },
          { month: "2025-10", description: "Livraison finale dev & validation dev V1" },
          { month: "2025-11", description: "Retravail demandé avant décision de rentrer en prod" },
          { month: "2026-01", description: "Rendu dev complémentaire data" }
        ],
        progress: 55
      },
      {
        phase: "DEV",
        phaseDetail: "",
        name: "Vivr Livr",
        summary: "A compléter",
        formats: [],
        producer: "",
        platforms: "",
        languages: [],
        contract: "",
        endOfRights: "",
        timeline: [],
        progress: 0
      },
      {
        phase: "PROD",
        phaseDetail: "Tournage en cours",
        name: "ARTOU",
        summary: "Projet de film en réalité virtuelle de Abderrhamane Sissako. Après le décès de leur père en Europe, une fratrie de trois sœurs et trois frères exaucent la volonté du patriarche.",
        formats: ["Cinéma VR (Atmos)", "VR Standalone (application coquille)", "Version 360 (stéréoscopique)"],
        producer: "Korokoko, Smallbang",
        platforms: "Meta Quest",
        languages: ["FR", "EN"],
        contract: "Développement - contrat signé",
        endOfRights: "/",
        timeline: [
          { month: "2025-02", description: "Début dev" },
          { month: "2025-04", description: "Repérages chef op Mauritanie" },
          { month: "2025-06", description: "Rendu dev" },
          { month: "2025-08", description: "Contrat de prod : Questions sur les formats" },
          { month: "2025-10", description: "Engagement prod (derniers ajustements contrat)" },
          { month: "2025-12", description: "Tournage" }
        ],
        progress: 60
      },
      {
        phase: "PROD",
        phaseDetail: "Quasi livré, intégration FR à finaliser",
        name: "In the Current of Being #1",
        summary: "\"In the Current of Being\" est une expérience de réalité virtuelle haptique qui raconte l'histoire vraie de Carolyn Mercer.",
        formats: ["PCVR + gilet haptique", "VR standalone", "VR collective", "video 360°"],
        producer: "Floréal - Katayoun Dibamehr, Avi AMAR",
        platforms: "Meta Quest Store, Steam",
        languages: ["EN", "FR"],
        contract: "contrat de coédition en cours de rédaction",
        endOfRights: "",
        timeline: [
          { month: "2025-05", description: "Entrée en copro" },
          { month: "2025-06", description: "Présentation en compétition à Cannes XR" },
          { month: "2025-11", description: "Livraison VF, Livraison portage Quest" }
        ],
        progress: 80
      },
      {
        phase: "PROD",
        phaseDetail: "Mail envoyé à Etienne Li le 14/11 pour update",
        name: "L'OMBRE - Blanca Li",
        summary: "UNE EXPERIENCE IMMERSIVE COMBINANT LA MUSIQUE ELECTROACOUSTIQUE, LE VIDEO, LA DANSE ET LA REALITE MIXTE",
        formats: ["VR Collective (Spectacle immersif XR)", "VR Standalone"],
        producer: "STUDIO BLANCA LI, Audrey Pacart",
        platforms: "TBD",
        languages: ["FR", "EN"],
        contract: "contrat de coédition signé",
        endOfRights: "",
        timeline: [
          { month: "2025-06", description: "Première IRCAM - Work in progress" },
          { month: "2025-07", description: "Version Alpha VR + LBE" },
          { month: "2025-10", description: "Nouveau planning à venir (Etienne Li)" },
          { month: "2026-02", description: "Planning des livraisons en 2026" },
          { month: "2026-06", description: "Livraison version standalone" }
        ],
        progress: 50
      },
      {
        phase: "PROD",
        phaseDetail: "On sera bon pour la fin de l'année",
        name: "MOON",
        summary: "Cinquante ans après la mission Apollo 17, une nouvelle épopée spatiale a commencé : le programme Artémis. Faire vivre, par anticipation, ce jour de 2027 lorsqu'une femme astronaute posera pour la première fois le pied sur la Lune.",
        formats: ["VR Standalone", "Dôme", "VR Collective", "Exposition immersive"],
        producer: "Zed - Manuel Cattan, Small",
        platforms: "Meta Quest",
        languages: ["FR", "EN"],
        contract: "contrat Moon VR signé, Contrat Dôme en cours",
        endOfRights: "",
        timeline: [
          { month: "2025-06", description: "Démo Alpha, Animatique" },
          { month: "2025-07", description: "Version Alpha - intégration Graphique V1, Animation V1" },
          { month: "2025-12", description: "Version Gold - Travail Graphique def, Animation def, Optimisation et Q&A" },
          { month: "2026-03", description: "Livraison finale et mise en exploitation" }
        ],
        progress: 65
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "FR non publiée",
        name: "IMPULSE",
        summary: "IMPULSE: PLAYING WITH REALITY is a 40-minute interactive mixed reality narrative experience that explores ADHD",
        formats: ["VR Standalone"],
        producer: "Floréal - Katayoun Dibamehr, Avi AMAR",
        platforms: "Meta Quest - 06/2025 : 2 205 téléchargements payants",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [
          { month: "2025-03", description: "Mise à jour version FR Quest, Publication version web" },
          { month: "2025-07", description: "Sélection Annecy, Livraison version FR" },
          { month: "2025-09", description: "Livraison VF / WEB" }
        ],
        progress: 90,
        metaStoreUrl: "https://www.meta.com/experiences/impulse-playing-with-reality/6468391126573976/",
        storeRating: 4.4,
        storeRatingCount: 36,
        storeReviewCount: 21
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "non publié",
        name: "THE EYE & I",
        summary: "une expérience de divertissement en Réalité Virtuelle (VR) interactive et musicale sur le thème de la surveillance",
        formats: ["VR Standalone", "PC VR", "découpage vidéo Youtube"],
        producer: "Digital Rise - Francois Klein",
        platforms: "Meta Quest (géoblock FR), Youtube FTV, Dômes",
        languages: ["FR", "EN", "CN"],
        contract: "",
        endOfRights: "",
        timeline: [
          { month: "2025-03", description: "Décision date de mise en ligne" },
          { month: "2025-07", description: "Sélection Annecy Dôme" },
          { month: "2025-11", description: "Hypothèse sortie groupée expo / VR / vidéos YT" }
        ],
        progress: 85,
        metaStoreUrl: "",
        storeRating: 0,
        storeRatingCount: 0,
        storeReviewCount: 0
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "",
        name: "CHAMP DE BATAILLE",
        summary: "Live from the Great War's trenches. A stereoscopic virtual reality film",
        formats: ["Vidéo 360 (stéréoscopique)", "VR Standalone", "Court métrage 2D"],
        producer: "Jérémy Sahel - Da Prod + presta Novelab app",
        platforms: "Meta Quest - 06/25 : 722 téléchargements",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [
          { month: "2025-06", description: "Livraison version dôme" }
        ],
        progress: 95,
        metaStoreUrl: "https://www.meta.com/experiences/champ-de-bataille/9366895613324917/",
        storeRating: 0,
        storeRatingCount: 0,
        storeReviewCount: 0
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "",
        name: "EMPEREUR",
        summary: "EMPEROR is an interactive and narrative experience in virtual reality, which invites the user to travel inside the brain of a father, suffering from aphasia.",
        formats: ["VR Standalone"],
        producer: "Oriane Hurard - Atlas V",
        platforms: "Meta Quest - 06/25 : 5 248 téléchargements",
        languages: ["FR", "EN", "DE"],
        contract: "",
        endOfRights: "",
        timeline: [
          { month: "2025-04", description: "Communication ?" }
        ],
        progress: 100,
        metaStoreUrl: "https://www.meta.com/experiences/emperor/6554855927974102/",
        storeRating: 0,
        storeRatingCount: 0,
        storeReviewCount: 0
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "",
        name: "JAILBIRDS",
        summary: "Un conte fantastique sur le prix de la liberté. Félix cherche toujours le bon côté de la vie malgré sa cellule de prison infernale.",
        formats: ["PCVR", "Vidéo 360 (mono + stereo)", "VR Standalone"],
        producer: "Digital Rise - Francois Klein",
        platforms: "Youtube (360) - 527 vues, Meta Quest - 619 téléchargements",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [
          { month: "2025-04", description: "Communication ?" },
          { month: "2025-08", description: "Sélection Court métrage 2D Annecy" }
        ],
        progress: 100,
        metaStoreUrl: "https://www.meta.com/experiences/jailbirds/5928667770590251/",
        storeRating: 5.0,
        storeRatingCount: 3,
        storeReviewCount: 3
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "",
        name: "BLOOD SPEAKS - MAYA",
        summary: "An Immersive Story Following Maya, An Ordinary 21st Century Girl, As She Transforms Into A Uniquely Female Superhero.",
        formats: ["VR Standalone (XR)"],
        producer: "Floréal - Katayoun Dibamehr, Avi AMAR",
        platforms: "Meta Quest - 06/25 : en attente des chiffres",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [],
        progress: 100,
        metaStoreUrl: "https://www.meta.com/experiences/maya-the-birth-of-a-superhero/8508005729209838/",
        storeRating: 3.0,
        storeRatingCount: 0,
        storeReviewCount: 0
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "",
        name: "MAMIE LOU",
        summary: "Mamie Lou est un récit interactif en réalité virtuelle qui invite le spectateur à prendre la place d'un esprit accompagnant une grand-mère dans ses derniers moments.",
        formats: ["VR Standalone"],
        producer: "Small, Voyelle Acker, Vincent Guttmann",
        platforms: "Meta Quest - 06/25 : 585 téléchargements",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [
          { month: "2025-08", description: "Communication (vote loi fin de vie assemblée)" }
        ],
        progress: 100,
        metaStoreUrl: "https://www.meta.com/experiences/nana-lou/8012850088750294/",
        storeRating: 0,
        storeRatingCount: 0,
        storeReviewCount: 0
      },
      {
        phase: "EXPLOITATION",
        phaseDetail: "",
        name: "FIGHTBACK",
        summary: "FIGHT BACK est une aventure VR fun et entraînante, jouable avec le handtracking, qui vise à développer la confiance en soi et la mémoire musculaire.",
        formats: ["VR Standalone"],
        producer: "Coven - Marie Blondiau, Céline Tricart",
        platforms: "Meta Quest, SideQuest - 06/25 : 55 849 téléchargements",
        languages: ["FR", "EN", "ES"],
        contract: "",
        endOfRights: "",
        timeline: [],
        progress: 100,
        metaStoreUrl: "https://www.meta.com/experiences/fight-back/6419970498017902/",
        storeRating: 0,
        storeRatingCount: 0,
        storeReviewCount: 0
      },
      {
        phase: "ABANDON",
        phaseDetail: "",
        name: "AMAZING MONSTER",
        summary: "Amazing Monster! est un récit initiatique interactif d'un genre nouveau. À travers une expérience de pêche inédite.",
        formats: ["VR Standalone"],
        producer: "Small, Voyelle Acker, Vincent Guttmann",
        platforms: "TBD",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [],
        progress: 0
      },
      {
        phase: "ABANDON",
        phaseDetail: "",
        name: "SIGRID ET SES SOEURS",
        summary: "",
        formats: ["VR Standalone"],
        producer: "Lucid Realities",
        platforms: "TBD",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [],
        progress: 0
      },
      {
        phase: "ABANDON",
        phaseDetail: "",
        name: "MUSICALISM",
        summary: "Retrocession du dev ?",
        formats: ["VR Standalone", "Video 360"],
        producer: "La générale de production",
        platforms: "TBD",
        languages: ["FR", "EN"],
        contract: "",
        endOfRights: "",
        timeline: [],
        progress: 0
      }
    ];

    for (const p of seedProjects) {
      const id = randomUUID();
      this.projects.set(id, { ...p, id });
      if (p.phase === "EXPLOITATION") {
        this.seedReviewsForProject(id, p.name);
      }
    }
  }

  private seedReviewsForProject(projectId: string, projectName: string) {
    const reviewSets: Record<string, Array<{ rating: number; comment: string }>> = {
      "IMPULSE": [
        { rating: 5, comment: "Expérience incroyable qui m'a vraiment fait comprendre le TDAH. L'interaction avec la réalité mixte est bluffante." },
        { rating: 4, comment: "Très immersif et touchant. Quelques lenteurs au chargement sur Quest 3 mais l'histoire est captivante." },
        { rating: 5, comment: "La meilleure expérience VR que j'ai testée cette année. Le récit interactif est brillant." },
        { rating: 3, comment: "Concept intéressant mais j'ai eu le mal des transports au bout de 20 minutes." },
        { rating: 4, comment: "Très beau travail sur la narration. La durée de 40 minutes est parfaite." },
        { rating: 5, comment: "Magistral. On ressort de cette expérience changé. Bravo à toute l'équipe." },
      ],
      "THE EYE & I": [
        { rating: 4, comment: "L'aspect musical rend l'expérience très originale. Le thème de la surveillance est bien traité." },
        { rating: 3, comment: "Graphiquement réussi mais l'interaction pourrait être plus intuitive." },
        { rating: 5, comment: "Génial en dôme ! L'expérience collective apporte une dimension supplémentaire." },
        { rating: 4, comment: "Bonne surprise, le mélange musique et VR fonctionne bien." },
      ],
      "CHAMP DE BATAILLE": [
        { rating: 5, comment: "L'immersion dans les tranchées est saisissante. La stéréoscopie ajoute vraiment à l'expérience." },
        { rating: 5, comment: "Émouvant et respectueux. Un vrai travail de mémoire." },
        { rating: 4, comment: "Court mais très intense. On aimerait que ça dure plus longtemps." },
      ],
      "EMPEREUR": [
        { rating: 5, comment: "L'exploration du cerveau d'un père aphasique est une idée géniale. Exécution parfaite." },
        { rating: 4, comment: "Très poétique et touchant. Les visuels sont magnifiques." },
        { rating: 5, comment: "J'ai pleuré. Cette expérience devrait être montrée dans les hôpitaux." },
        { rating: 4, comment: "Narrativement très fort, l'interactivité est bien dosée." },
        { rating: 3, comment: "Beau mais un peu court. J'aurais aimé plus d'interactions." },
      ],
      "JAILBIRDS": [
        { rating: 4, comment: "Le conte fantastique fonctionne bien en VR. Félix est un personnage attachant." },
        { rating: 3, comment: "Sympa mais un peu répétitif sur la durée. Le handtracking est parfois capricieux." },
        { rating: 4, comment: "Belle direction artistique, histoire prenante." },
      ],
      "BLOOD SPEAKS - MAYA": [
        { rating: 4, comment: "Le concept de super-héroïne en XR est original. Maya est un personnage fort." },
        { rating: 5, comment: "Enfin une héroïne féminine dans une expérience immersive ! Bravo." },
        { rating: 3, comment: "L'histoire est bien mais la technique XR pourrait être plus poussée." },
        { rating: 4, comment: "Bon divertissement, adapté à un large public." },
      ],
      "MAMIE LOU": [
        { rating: 5, comment: "Bouleversant. L'accompagnement en fin de vie est traité avec une délicatesse rare." },
        { rating: 5, comment: "J'ai pensé à ma grand-mère tout du long. Merci pour cette expérience." },
        { rating: 4, comment: "Très émouvant, peut-être un peu trop court. Le concept d'esprit accompagnant est beau." },
      ],
      "FIGHTBACK": [
        { rating: 5, comment: "Super fun ! Le handtracking marche très bien et on se sent vraiment puissant." },
        { rating: 4, comment: "Bonne idée pour développer la confiance en soi. Les exercices sont bien pensés." },
        { rating: 5, comment: "Addictif ! Je reviens tous les jours pour m'entraîner." },
        { rating: 3, comment: "Fun mais peut devenir répétitif. Il faudrait plus de variété dans les mouvements." },
        { rating: 5, comment: "Meilleur jeu de fitness VR que j'ai essayé. Bravo Céline Tricart !" },
        { rating: 4, comment: "Très bon concept, la mémoire musculaire se développe vraiment." },
        { rating: 5, comment: "Je l'ai recommandé à toute ma famille. Accessible et motivant." },
        { rating: 4, comment: "Super en multijoueur ! On s'encourage mutuellement." },
      ],
    };

    const reviews = reviewSets[projectName];
    if (!reviews) return;

    const now = Date.now();
    reviews.forEach((r, i) => {
      const daysAgo = Math.floor(Math.random() * 180) + 1;
      const createdAt = new Date(now - daysAgo * 86400000).toISOString();
      const id = randomUUID();
      this.reviews.set(id, {
        id,
        projectId,
        rating: r.rating,
        comment: r.comment,
        createdAt,
      });
    });
  }

  // ── Users ──

  async getUsers(): Promise<AppUser[]> {
    return Array.from(this.users.values());
  }

  async getUser(id: string): Promise<AppUser | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<AppUser | undefined> {
    return Array.from(this.users.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  async createUser(userData: Omit<AppUser, "id">): Promise<AppUser> {
    const id = randomUUID();
    const user: AppUser = { ...userData, id };
    this.users.set(id, user);
    this.saveToDisk();
    return user;
  }

  async updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    const existed = this.users.delete(id);
    if (existed) this.saveToDisk();
    return existed;
  }

  // ── Tasks ──

  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(taskData: Omit<Task, "id">): Promise<Task> {
    const id = randomUUID();
    const task: Task = { ...taskData, id };
    this.tasks.set(id, task);
    this.saveToDisk();
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...updates };
    this.tasks.set(id, updated);
    this.saveToDisk();
    return updated;
  }

  async deleteTask(id: string): Promise<boolean> {
    const existed = this.tasks.delete(id);
    if (existed) this.saveToDisk();
    return existed;
  }

  // ── Notifications ──

  async getNotifications(userId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createNotification(data: Omit<Notification, "id">): Promise<Notification> {
    const id = randomUUID();
    const notif: Notification = { ...data, id };
    this.notifications.set(id, notif);
    this.saveToDisk();
    return notif;
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const notif = this.notifications.get(id);
    if (!notif) return false;
    notif.read = true;
    this.notifications.set(id, notif);
    this.saveToDisk();
    return true;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const entries = Array.from(this.notifications.entries());
    for (const [id, notif] of entries) {
      if (notif.userId === userId && !notif.read) {
        notif.read = true;
        this.notifications.set(id, notif);
      }
    }
    this.saveToDisk();
  }
}

export const storage = new FileStorage();
