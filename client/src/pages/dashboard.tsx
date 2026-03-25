import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import type { Project, HistoryEntry } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  Plus, Search, X, ChevronRight, Calendar, Users, Film,
  Globe, FileText, Layers, Eye, Trash2, Edit2, ArrowLeft,
  LayoutGrid, BarChart3, Sun, Moon, MessageSquarePlus,
  Paperclip, Download, Clock, StickyNote, File as FileIcon,
  ArrowRightCircle, AlertCircle, GanttChart, Star, Sparkles,
  MessageCircle, TrendingUp, Loader2, ArrowDownToLine, Euro, Pencil, Check, Mail, HardDriveDownload,
  Shield, LogOut, PieChart, CalendarClock, Table2, Activity, ListTodo, Upload,
  Trophy, Tag, Monitor, Gamepad2, Target,
Menu, X } from "lucide-react";
import type { UserReview } from "@shared/schema";
import franceTvLogo from "@assets/francetv-logo.png";
import { SynthesisDashboard, DeadlinesView, TableView, ExploitationPerformance } from "@/components/analytics-views";
import { TaskList } from "@/components/task-list";
import { NotificationBell } from "@/components/notification-bell";
import type { Task, FestivalEntry, PlatformEntry, EngagementKpis } from "@shared/schema";

const PHASE_CONFIG: Record<string, { label: string; color: string; bgClass: string; textClass: string }> = {
  ETUDE: { label: "Étude", color: "hsl(270, 60%, 55%)", bgClass: "bg-purple-500/15 dark:bg-purple-400/15", textClass: "text-purple-700 dark:text-purple-400" },
  DEV: { label: "Développement", color: "hsl(38, 80%, 55%)", bgClass: "bg-amber-500/15 dark:bg-amber-400/15", textClass: "text-amber-700 dark:text-amber-400" },
  PROD: { label: "Production", color: "hsl(192, 75%, 42%)", bgClass: "bg-cyan-600/15 dark:bg-cyan-400/15", textClass: "text-cyan-700 dark:text-cyan-400" },
  EXPLOITATION: { label: "Exploitation", color: "hsl(142, 50%, 40%)", bgClass: "bg-emerald-600/15 dark:bg-emerald-400/15", textClass: "text-emerald-700 dark:text-emerald-400" },
  ABANDON: { label: "Abandonné", color: "hsl(0, 0%, 50%)", bgClass: "bg-gray-500/15 dark:bg-gray-400/15", textClass: "text-gray-600 dark:text-gray-400" },
};

const MONTHS = [
  "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06",
  "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12",
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
];

function formatMonth(m: string) {
  if (!m || !m.includes("-")) return "—";
  const [y, mo] = m.split("-");
  const names = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

function formatMonthFull(m: string) {
  if (!m || !m.includes("-")) return "—";
  const [y, mo] = m.split("-");
  const names = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  return `${names[parseInt(mo) - 1]} ${y}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Get next upcoming event for a project
function getNextEvent(project: Project, currentMonth: string) {
  // Find the first event that is this month or in the future
  const upcoming = project.timeline.filter((t) => t.month >= currentMonth);
  if (upcoming.length === 0) return null;
  // Sort to be safe and return earliest
  upcoming.sort((a, b) => a.month.localeCompare(b.month));
  return upcoming[0];
}

// Check if an event is urgent (this month or next month)
function isEventUrgent(eventMonth: string, currentMonth: string): boolean {
  const [cy, cm] = currentMonth.split("-").map(Number);
  const nextMonth = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, "0")}`;
  return eventMonth === currentMonth || eventMonth === nextMonth;
}

// Empty form state
function emptyProject(): Omit<Project, "id"> {
  return {
    phase: "ETUDE",
    phaseDetail: "",
    name: "",
    summary: "",
    formats: [],
    producer: "",
    platforms: "",
    languages: ["FR"],
    contract: "",
    endOfRights: "",
    timeline: [],
    progress: 0,
    referentName: "",
    referentEmail: "",
    tags: [],
    technology: undefined,
    genre: "",
    targetAudience: "",
    festivals: [],
    platformEntries: [],
    engagementKpis: undefined,
  };
}

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [focusedProject, setFocusedProject] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [view, setView] = useState<"grid" | "timeline" | "gantt" | "synthesis" | "deadlines" | "table" | "performance" | "tasks">("grid");
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  // Tasks query for badge count
  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const myPendingTaskCount = useMemo(() => {
    if (!user) return 0;
    return allTasks.filter((t) => t.assigneeId === user.id && t.status !== "done").length;
  }, [allTasks, user]);

  // Download full backup
  const handleBackup = async () => {
    try {
      const res = await apiRequest("GET", "/api/backup");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storylab-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackupDate(new Date().toISOString());
      toast({ title: "Backup téléchargé" });
    } catch {
      toast({ title: "Erreur", description: "Impossible de télécharger le backup.", variant: "destructive" });
    }
  };

  // Restore from backup
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const handleRestore = async () => {
    if (!restoreFile) return;
    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append("backup", restoreFile);
      const res = await fetch("/api/restore", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Restore failed");
      toast({ title: "Restauration réussie", description: `${data.projects} projets, ${data.entries} entrées restaurés.` });
      setRestoreFile(null);
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsRestoring(false);
    }
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark", !darkMode);
  };

  // Apply dark mode on mount
  useMemo(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<Project, "id">) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowForm(false);
      toast({ title: "Projet créé", description: "Le nouveau projet a été ajouté à la roadmap." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Project> }) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditProject(null);
      if (focusedProject?.id === updated.id) setFocusedProject(updated);
      toast({ title: "Projet mis à jour" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setFocusedProject(null);
      toast({ title: "Projet supprimé" });
    },
  });

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchPhase = phaseFilter === "ALL" || p.phase === phaseFilter;
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.producer.toLowerCase().includes(search.toLowerCase()) ||
        p.summary.toLowerCase().includes(search.toLowerCase());
      return matchPhase && matchSearch;
    });
  }, [projects, phaseFilter, search]);

  const stats = useMemo(() => {
    const byPhase: Record<string, number> = { ETUDE: 0, DEV: 0, PROD: 0, EXPLOITATION: 0, ABANDON: 0 };
    projects.forEach((p) => { byPhase[p.phase] = (byPhase[p.phase] || 0) + 1; });
    return byPhase;
  }, [projects]);

  const currentMonth = getCurrentMonth();

  return (
    <>
      {focusedProject ? (
        <FocusView
          project={focusedProject}
          onBack={() => setFocusedProject(null)}
          onEdit={() => setEditProject(focusedProject)}
          onDelete={() => deleteMutation.mutate(focusedProject.id)}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
        />
      ) : (
        <div className="min-h-screen bg-background" data-testid="dashboard">
          {/* Header */}
          <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <img src={franceTvLogo} alt="France TV" className="h-5 sm:h-6 w-auto" />
                <div className="w-px h-5 bg-border hidden sm:block" />
                <h1 className="text-sm sm:text-base font-semibold tracking-tight hidden sm:block">Storylab Roadmap</h1>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                <div className="flex flex-col items-center">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1" data-testid="btn-backup">
                    <HardDriveDownload className="h-3.5 w-3.5" /> Backup
                  </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Backup</AlertDialogTitle>
                        <AlertDialogDescription>Télécharger un backup ZIP de toutes les données ?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Non</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBackup}>Télécharger</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {/* Restore button — admin only */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs">
                        <Upload className="h-3.5 w-3.5" /> Restaurer
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restaurer un backup</AlertDialogTitle>
                        <AlertDialogDescription>
                          Sélectionnez un fichier ZIP de backup. Les données actuelles seront sauvegardées avant la restauration.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                        className="my-2"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setRestoreFile(null)}>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestore} disabled={!restoreFile || isRestoring}>
                          {isRestoring ? "Restauration..." : "Restaurer"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {lastBackupDate && (
                    <span className="text-[9px] text-muted-foreground -mt-0.5">
                      {new Date(lastBackupDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {user?.role === "admin" && (
                  <a href="#/admin">
                    <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1">
                      <Shield className="h-3.5 w-3.5" /> Admin
                    </Button>
                  </a>
                )}
                <NotificationBell />
                <div className="relative">
                  <Button
                    variant={view === "tasks" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 text-[11px] gap-1"
                    onClick={() => setView(view === "tasks" ? "grid" : "tasks")}
                  >
                    <ListTodo className="h-3.5 w-3.5" /> Tâches
                  </Button>
                  {myPendingTaskCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                      {myPendingTaskCount}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleDarkMode} data-testid="theme-toggle" aria-label={darkMode ? "Passer en mode clair" : "Passer en mode sombre"} title={darkMode ? "Mode clair" : "Mode sombre"}>
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                {user?.role !== "viewer" && (
                  <Button size="sm" onClick={() => setShowForm(true)} data-testid="btn-add-project">
                    <Plus className="h-4 w-4 mr-1" /> Nouveau projet
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-8 text-[11px] gap-1" onClick={() => logout()}>
                  <LogOut className="h-3.5 w-3.5" /> {user?.displayName}
                </Button>
              </div>
            </div>
          </header>

          <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="kpi-section">
              {(["ETUDE", "DEV", "PROD", "EXPLOITATION", "ABANDON"] as const).map((phase) => (
                <button
                  key={phase}
                  onClick={() => setPhaseFilter(phaseFilter === phase ? "ALL" : phase)}
                  className={`rounded-lg p-3 text-left transition-all border ${
                    phaseFilter === phase
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40"
                  } bg-card`}
                  data-testid={`kpi-${phase.toLowerCase()}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${PHASE_CONFIG[phase].textClass}`}>
                      {PHASE_CONFIG[phase].label}
                    </span>
                    <span className={`w-2 h-2 rounded-full`} style={{ background: PHASE_CONFIG[phase].color }} />
                  </div>
                  <span className="text-xl font-bold tabular-nums">{stats[phase] || 0}</span>
                  <span className="text-xs text-muted-foreground ml-1">projets</span>
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un projet..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="search-input"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
              <Tabs value={phaseFilter} onValueChange={setPhaseFilter}>
                <TabsList className="h-8">
                  <TabsTrigger value="ALL" className="text-xs px-2 h-6" data-testid="filter-all">Tous</TabsTrigger>
                  <TabsTrigger value="ETUDE" className="text-xs px-2 h-6" data-testid="filter-etude">Étude</TabsTrigger>
                  <TabsTrigger value="DEV" className="text-xs px-2 h-6" data-testid="filter-dev">Dev</TabsTrigger>
                  <TabsTrigger value="PROD" className="text-xs px-2 h-6" data-testid="filter-prod">Prod</TabsTrigger>
                  <TabsTrigger value="EXPLOITATION" className="text-xs px-2 h-6" data-testid="filter-exploit">Exploit</TabsTrigger>
                  <TabsTrigger value="ABANDON" className="text-xs px-2 h-6" data-testid="filter-abandon">Abandon</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-1 ml-auto">
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("grid")} title="Vue grille">
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("table")} title="Vue tableau">
                  <Table2 className="h-4 w-4" />
                </Button>
                <Button variant={view === "timeline" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("timeline")} title="Vue chronologique">
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button variant={view === "gantt" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("gantt")} title="Vue Gantt">
                  <GanttChart className="h-4 w-4" />
                </Button>
                <div className="w-px h-5 bg-border mx-1" />
                <Button variant={view === "synthesis" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("synthesis")} title="Tableau de bord">
                  <PieChart className="h-4 w-4" />
                </Button>
                <Button variant={view === "deadlines" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("deadlines")} title="Échéances">
                  <CalendarClock className="h-4 w-4" />
                </Button>
                <Button variant={view === "performance" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("performance")} title="Performance">
                  <Activity className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map(i => (
                  <Card key={i} className="p-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                    <div className="h-6 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-full mb-1" />
                    <div className="h-3 bg-muted rounded w-4/5" />
                  </Card>
                ))}
              </div>
            ) : view === "tasks" ? (
              <TaskList projects={projects} onProjectClick={setFocusedProject} />
            ) : view === "synthesis" ? (
              <SynthesisDashboard projects={filtered} onProjectClick={setFocusedProject} />
            ) : view === "deadlines" ? (
              <DeadlinesView projects={filtered} onProjectClick={setFocusedProject} />
            ) : view === "table" ? (
              <TableView projects={filtered} onProjectClick={setFocusedProject} />
            ) : view === "performance" ? (
              <ExploitationPerformance projects={filtered} />
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="project-grid">
                {filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => setFocusedProject(project)}
                    currentMonth={currentMonth}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-full text-center py-16 text-muted-foreground">
                    <Layers className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Aucun projet trouvé</p>
                    <p className="text-sm mt-1">Modifiez vos filtres ou ajoutez un nouveau projet.</p>
                  </div>
                )}
              </div>
            ) : view === "timeline" ? (
              <TimelineView
                projects={filtered}
                currentMonth={currentMonth}
                onProjectClick={setFocusedProject}
              />
            ) : (
              <CompactGanttView
                projects={filtered}
                currentMonth={currentMonth}
                onProjectClick={setFocusedProject}
              />
            )}

            {/* Exploitation Dashboard — shown when Exploitation filter is active */}
            {phaseFilter === "EXPLOITATION" && !isLoading && (
              <ExploitationDashboard
                projects={filtered}
              />
            )}

            <PerplexityAttribution />
          </main>
        </div>
      )}

      {/* Create / Edit Dialog — always mounted so it works from both views */}
      <ProjectFormDialog
        open={showForm || !!editProject}
        onClose={() => { setShowForm(false); setEditProject(null); }}
        project={editProject}
        onSubmit={(data) => {
          if (editProject) {
            updateMutation.mutate({ id: editProject.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </>
  );
}

// ── Project Card ──
function ProjectCard({ project, onClick, currentMonth }: { project: Project; onClick: () => void; currentMonth: string }) {
  const cfg = PHASE_CONFIG[project.phase];
  const nextEvent = getNextEvent(project, currentMonth);
  const urgent = nextEvent ? isEventUrgent(nextEvent.month, currentMonth) : false;

  return (
    <Card
      className="p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group"
      onClick={onClick}
      data-testid={`card-project-${project.id}`}
    >
      <div className="flex items-start justify-between mb-2">
        <Badge variant="secondary" className={`${cfg.bgClass} ${cfg.textClass} border-0 text-[11px] font-medium`}>
          {cfg.label}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="font-semibold text-sm mb-1 leading-tight">{project.name}</h3>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">{project.summary || "—"}</p>

      {/* Formats + Tags */}
      {((project.formats && project.formats.length > 0) || (project.tags && project.tags.length > 0) || (project.festivals && project.festivals.some(f => f.status === "awarded"))) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {project.formats.slice(0, 2).map((fmt, i) => (
            <Badge key={i} variant="outline" className="text-[10px] h-4 px-1.5">{fmt}</Badge>
          ))}
          {project.formats.length > 2 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">+{project.formats.length - 2}</Badge>
          )}
          {project.festivals?.filter(f => f.status === "awarded").map((f, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] h-4 px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">
              🏆 {f.festivalName}
            </Badge>
          ))}
          {(project.tags || []).slice(0, 3).map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] h-4 px-1.5">{tag}</Badge>
          ))}
          {(project.tags || []).length > 3 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">+{(project.tags || []).length - 3}</Badge>
          )}
        </div>
      )}

      {project.progress !== undefined && project.progress > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-muted-foreground">Avancement</span>
            <span className="text-[11px] font-medium tabular-nums">{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-1.5" />
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {project.producer && (
          <span className="flex items-center gap-1 truncate">
            <Users className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{project.producer.split(" - ")[0].split(",")[0]}</span>
          </span>
        )}
        {project.formats.length > 0 && (
          <span className="flex items-center gap-1">
            <Film className="h-3 w-3 flex-shrink-0" />
            {project.formats.length}
          </span>
        )}
        {project.languages.length > 0 && (
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3 flex-shrink-0" />
            {project.languages.join("/")}
          </span>
        )}
      </div>

      {nextEvent && (
        <div className={`mt-3 pt-3 border-t ${
          urgent
            ? "border-orange-300/50 dark:border-orange-500/30"
            : "border-border"
        }`}>
          <div className={`flex items-start gap-2 text-xs rounded-md p-2 -mx-1 ${
            urgent
              ? "bg-orange-50 dark:bg-orange-950/30"
              : "bg-primary/5 dark:bg-primary/10"
          }`}>
            <ArrowRightCircle className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${
              urgent ? "text-orange-600 dark:text-orange-400" : "text-primary"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`font-semibold ${
                  urgent ? "text-orange-700 dark:text-orange-400" : "text-primary"
                }`}>Prochaine étape</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  urgent
                    ? "bg-orange-200/60 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                    : "bg-primary/10 text-primary"
                }`}>{formatMonth(nextEvent.month)}</span>
              </div>
              <p className="text-muted-foreground leading-snug line-clamp-2">{nextEvent.description}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Timeline View (Gantt-like) ──
function TimelineView({ projects, currentMonth, onProjectClick }: {
  projects: Project[];
  currentMonth: string;
  onProjectClick: (p: Project) => void;
}) {
  const currentIdx = MONTHS.indexOf(currentMonth);

  return (
    <div className="overflow-x-auto" data-testid="timeline-view">
      <div className="min-w-[900px]">
        {/* Header */}
        <div className="flex border-b border-border">
          <div className="w-[200px] flex-shrink-0 p-2 text-xs font-medium text-muted-foreground">Projet</div>
          <div className="flex-1 flex">
            {MONTHS.map((m, i) => (
              <div
                key={m}
                className={`flex-1 p-1.5 text-center text-[10px] font-medium border-l border-border ${
                  i === currentIdx ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {formatMonth(m)}
              </div>
            ))}
          </div>
        </div>
        {/* Rows */}
        {projects.map((project) => {
          const cfg = PHASE_CONFIG[project.phase];
          return (
            <div
              key={project.id}
              className="flex border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => onProjectClick(project)}
              data-testid={`timeline-row-${project.id}`}
            >
              <div className="w-[200px] flex-shrink-0 p-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                <span className="text-xs font-medium truncate">{project.name}</span>
              </div>
              <div className="flex-1 flex relative">
                {MONTHS.map((m, i) => {
                  const event = project.timeline.find((t) => t.month === m);
                  return (
                    <div
                      key={m}
                      className={`flex-1 border-l border-border/30 relative ${
                        i === currentIdx ? "bg-primary/5" : ""
                      }`}
                    >
                      {event && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-5 rounded-sm flex items-center justify-center cursor-pointer"
                              style={{ background: cfg.color + "30" }}
                            >
                              <div className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[250px]">
                            <p className="font-medium text-xs">{formatMonthFull(m)}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Focus View ──
function FocusView({ project, onBack, onEdit, onDelete, darkMode, toggleDarkMode }: {
  project: Project;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}) {
  const cfg = PHASE_CONFIG[project.phase];
  const currentMonth = getCurrentMonth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [noteText, setNoteText] = useState("");

  // Fetch history entries
  const { data: historyEntries = [], isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/projects", project.id, "history"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${project.id}/history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/history`, {
        type: "note",
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "history"] });
      setNoteText("");
      toast({ title: "Note ajoutée" });
    },
  });

  const addFileMutation = useMutation({
    mutationFn: async (file: File) => {
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(",")[1];
            const res = await apiRequest("POST", `/api/projects/${project.id}/history`, {
              type: "file",
              content: file.name,
              fileName: file.name,
              fileData: base64,
              fileMimeType: file.type || "application/octet-stream",
            });
            if (!res.ok) throw new Error("Upload failed");
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "history"] });
      toast({ title: "Fichier ajouté" });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("DELETE", `/api/history/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "history"] });
      toast({ title: "Entrée supprimée" });
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(noteText.trim());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toast({ title: "Fichier trop volumineux", description: "Taille max : 15 Mo", variant: "destructive" });
        return;
      }
      addFileMutation.mutate(file);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = (entry: HistoryEntry) => {
    if (!entry.fileData || !entry.fileName) return;
    const mime = entry.fileMimeType || "application/octet-stream";
    const byteChars = atob(entry.fileData);
    const byteArrays = [];
    for (let i = 0; i < byteChars.length; i += 512) {
      const slice = byteChars.slice(i, i + 512);
      const byteNumbers = new Array(slice.length);
      for (let j = 0; j < slice.length; j++) {
        byteNumbers[j] = slice.charCodeAt(j);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    const blob = new Blob(byteArrays, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatEntryDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(ext)) return "PDF";
    if (["doc", "docx"].includes(ext)) return "DOC";
    if (["xls", "xlsx"].includes(ext)) return "XLS";
    if (["ppt", "pptx"].includes(ext)) return "PPT";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "IMG";
    return "FILE";
  };

  return (
    <div className="min-h-screen bg-background" data-testid="focus-view">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="btn-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label={darkMode ? "Passer en mode clair" : "Passer en mode sombre"} title={darkMode ? "Mode clair" : "Mode sombre"}>
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit} data-testid="btn-edit">
              <Edit2 className="h-4 w-4 mr-1" /> Modifier
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid="btn-delete">
                  <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer le projet</AlertDialogTitle>
                  <AlertDialogDescription>Voulez-vous vraiment supprimer ce projet ?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Non</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Oui</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Hero */}
        <div>
          <Badge variant="secondary" className={`${cfg.bgClass} ${cfg.textClass} border-0 text-xs font-medium mb-3`}>
            {cfg.label}
          </Badge>
          <h1 className="text-xl font-bold tracking-tight mb-1">{project.name}</h1>
          {project.phaseDetail && (
            <p className="text-sm text-muted-foreground">{project.phaseDetail}</p>
          )}
        </div>

        {/* Progress */}
        {project.progress !== undefined && project.progress > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Avancement global</span>
              <span className="text-sm font-bold tabular-nums">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>
        )}

        {/* Next Step Banner */}
        {(() => {
          const nextEvent = getNextEvent(project, currentMonth);
          if (!nextEvent) return null;
          const urgent = isEventUrgent(nextEvent.month, currentMonth);
          return (
            <div
              className={`rounded-lg border-2 p-4 ${
                urgent
                  ? "border-orange-400/60 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-950/20"
                  : "border-primary/30 bg-primary/5 dark:bg-primary/10"
              }`}
              data-testid="next-step-banner"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  urgent
                    ? "bg-orange-500/15 dark:bg-orange-400/15"
                    : "bg-primary/10"
                }`}>
                  <ArrowRightCircle className={`h-5 w-5 ${
                    urgent ? "text-orange-600 dark:text-orange-400" : "text-primary"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold ${
                      urgent ? "text-orange-800 dark:text-orange-300" : "text-primary"
                    }`}>Prochaine étape</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      urgent
                        ? "bg-orange-200/70 text-orange-900 dark:bg-orange-800/40 dark:text-orange-200"
                        : "bg-primary/15 text-primary"
                    }`}>{formatMonthFull(nextEvent.month)}</span>
                    {urgent && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-orange-700 dark:text-orange-400">
                        <AlertCircle className="h-3 w-3" />
                        {nextEvent.month === currentMonth ? "Ce mois-ci" : "Mois prochain"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed">{nextEvent.description}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard icon={<FileText className="h-4 w-4" />} label="Résumé" value={project.summary || "—"} fullWidth />
          <InfoCard icon={<Users className="h-4 w-4" />} label="Producteur" value={project.producer || "—"} />
          <InfoCard icon={<Eye className="h-4 w-4" />} label="Plateformes" value={project.platforms || "—"} />
          <InfoCard icon={<Film className="h-4 w-4" />} label="Formats" value={project.formats.join(", ") || "—"} />
          <InfoCard icon={<Globe className="h-4 w-4" />} label="Langues" value={project.languages.join(", ") || "—"} />
          {project.contract && <InfoCard icon={<FileText className="h-4 w-4" />} label="Contrat" value={project.contract} />}
          {project.referentName && <InfoCard icon={<Users className="h-4 w-4" />} label="Référent projet" value={project.referentName} />}
          {project.referentEmail && (
            <InfoCard icon={<Mail className="h-4 w-4" />} label="E-mail référent" value={
              <a href={`mailto:${project.referentEmail}`} className="text-primary hover:underline">{project.referentEmail}</a>
            } />
          )}
          {project.genre && <InfoCard icon={<Gamepad2 className="h-4 w-4" />} label="Genre" value={project.genre} />}
          {project.targetAudience && <InfoCard icon={<Target className="h-4 w-4" />} label="Public cible" value={project.targetAudience} />}
        </div>

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Tag className="h-4 w-4" /> Tags</h2>
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Festivals */}
        {project.festivals && project.festivals.length > 0 && (
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Trophy className="h-4 w-4" /> Festivals & Sélections</h2>
            <div className="space-y-2">
              {project.festivals.map((f) => (
                <div key={f.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    f.status === "awarded" ? "bg-amber-500/15" : f.status === "selected" ? "bg-green-500/15" : f.status === "rejected" ? "bg-red-500/15" : "bg-blue-500/15"
                  }`}>
                    <Trophy className={`h-4 w-4 ${
                      f.status === "awarded" ? "text-amber-500" : f.status === "selected" ? "text-green-500" : f.status === "rejected" ? "text-red-500" : "text-blue-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{f.festivalName}</span>
                      <span className="text-xs text-muted-foreground">{f.year}</span>
                      <Badge variant="secondary" className={`text-[10px] h-4 ${
                        f.status === "awarded" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" :
                        f.status === "selected" ? "bg-green-500/15 text-green-700 dark:text-green-400" :
                        f.status === "rejected" ? "bg-red-500/15 text-red-700 dark:text-red-400" :
                        "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                      }`}>
                        {f.status === "submitted" ? "Soumis" : f.status === "selected" ? "Sélectionné" : f.status === "awarded" ? "Primé" : "Refusé"}
                      </Badge>
                    </div>
                    {f.category && <span className="text-xs text-muted-foreground">{f.category}</span>}
                    {f.award && <span className="text-xs font-medium text-amber-600 dark:text-amber-400 ml-2">🏆 {f.award}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform Distribution */}
        {project.platformEntries && project.platformEntries.length > 0 && (
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Monitor className="h-4 w-4" /> Distribution multi-plateformes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {project.platformEntries.map((p) => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">{p.platformName}</span>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {p.rating !== undefined && <div>Note : ⭐ {p.rating.toFixed(1)}{p.ratingCount ? ` (${p.ratingCount} avis)` : ""}</div>}
                    {p.downloadCount !== undefined && <div>Téléchargements : {p.downloadCount.toLocaleString("fr-FR")}</div>}
                    {p.revenue !== undefined && <div>Revenus : {p.revenue.toLocaleString("fr-FR")} €</div>}
                    {p.storeUrl && (
                      <a href={p.storeUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        Voir sur le store →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Engagement KPIs */}
        {project.engagementKpis && (
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4" /> KPIs d'engagement immersif</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {project.engagementKpis.avgSessionDuration !== undefined && (
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{project.engagementKpis.avgSessionDuration.toFixed(1)}</div>
                  <div className="text-[11px] text-muted-foreground">min / session</div>
                </div>
              )}
              {project.engagementKpis.completionRate !== undefined && (
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{project.engagementKpis.completionRate}%</div>
                  <div className="text-[11px] text-muted-foreground">Complétion</div>
                </div>
              )}
              {project.engagementKpis.retentionD1 !== undefined && (
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{project.engagementKpis.retentionD1}%</div>
                  <div className="text-[11px] text-muted-foreground">Rétention J1</div>
                </div>
              )}
              {project.engagementKpis.retentionD7 !== undefined && (
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{project.engagementKpis.retentionD7}%</div>
                  <div className="text-[11px] text-muted-foreground">Rétention J7</div>
                </div>
              )}
              {project.engagementKpis.motionSicknessRate !== undefined && (
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-orange-500">{project.engagementKpis.motionSicknessRate}%</div>
                  <div className="text-[11px] text-muted-foreground">Mal de transport</div>
                </div>
              )}
              {project.engagementKpis.totalSessions !== undefined && (
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{project.engagementKpis.totalSessions.toLocaleString("fr-FR")}</div>
                  <div className="text-[11px] text-muted-foreground">Sessions totales</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        {project.timeline.length > 0 && (
          <div>
            <h2 className="text-base font-semibold mb-4">Jalons</h2>
            <div className="relative">
              <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
              <div className="space-y-4">
                {(() => {
                  const nextEvt = getNextEvent(project, currentMonth);
                  return project.timeline.map((event, i) => {
                    const isPast = event.month < currentMonth;
                    const isCurrent = event.month === currentMonth;
                    const isNext = nextEvt && event.month === nextEvt.month && event.description === nextEvt.description;
                    return (
                      <div key={i} className={`flex gap-4 relative rounded-md py-1 px-1 -mx-1 ${
                        isNext ? "bg-primary/5 dark:bg-primary/10 ring-1 ring-primary/20" : ""
                      }`} data-testid={`milestone-${i}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                          isNext
                            ? "bg-primary text-primary-foreground"
                            : isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isPast
                            ? "bg-muted text-muted-foreground"
                            : "bg-card border-2 border-border text-muted-foreground"
                        }`}>
                          {isNext ? (
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                          ) : (
                            <div className={`w-2 h-2 rounded-full ${
                              isCurrent ? "bg-primary-foreground" : isPast ? "bg-muted-foreground" : "bg-border"
                            }`} />
                          )}
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${
                              isNext ? "text-primary" : isCurrent ? "text-primary" : "text-muted-foreground"
                            }`}>
                              {formatMonthFull(event.month)}
                            </span>
                            {isNext && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">
                                Prochaine étape
                              </Badge>
                            )}
                          </div>
                          <p className={`text-sm mt-0.5 ${isNext ? "font-medium" : ""}`}>{event.description}</p>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── History Section ── */}
        <div data-testid="history-section">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Historique
          </h2>

          {/* Add note */}
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <Textarea
              placeholder="Ajouter une note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              className="mb-3 resize-none"
              data-testid="history-note-input"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!noteText.trim() || addNoteMutation.isPending}
                data-testid="history-add-note"
              >
                <MessageSquarePlus className="h-4 w-4 mr-1" />
                {addNoteMutation.isPending ? "Ajout..." : "Ajouter la note"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.csv,.zip"
                data-testid="history-file-input"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={addFileMutation.isPending}
                data-testid="history-add-file"
              >
                <Paperclip className="h-4 w-4 mr-1" />
                {addFileMutation.isPending ? "Upload..." : "Joindre un fichier"}
              </Button>
            </div>
          </div>

          {/* History feed */}
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-3 bg-muted rounded w-1/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : historyEntries.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucun historique pour ce projet.</p>
              <p className="text-xs mt-1">Ajoutez des notes ou des fichiers pour commencer.</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="history-feed">
              {historyEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-card border border-border rounded-lg p-4 group transition-colors hover:border-primary/20"
                  data-testid={`history-entry-${entry.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {entry.type === "note" ? (
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 flex items-center justify-center flex-shrink-0">
                          <StickyNote className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-purple-400/15 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                            {getFileIcon(entry.fileName || "")}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] text-muted-foreground">
                            {formatEntryDate(entry.createdAt)}
                          </span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {entry.type === "note" ? "Note" : "Fichier"}
                          </Badge>
                        </div>
                        {entry.type === "note" ? (
                          <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{entry.fileName}</span>
                            {entry.fileData && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => handleDownload(entry)}
                                data-testid={`download-${entry.id}`}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Télécharger
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteEntryMutation.mutate(entry.id)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
                      data-testid={`delete-entry-${entry.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <PerplexityAttribution />
      </main>
    </div>
  );
}

function InfoCard({ icon, label, value, fullWidth }: { icon: React.ReactNode; label: string; value: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-3 ${fullWidth ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center gap-2 mb-1 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-sm">{value}</p>
    </div>
  );
}

// ── Compact Gantt View ──
function CompactGanttView({ projects, currentMonth, onProjectClick }: {
  projects: Project[];
  currentMonth: string;
  onProjectClick: (p: Project) => void;
}) {
  const currentIdx = MONTHS.indexOf(currentMonth);

  // Get start and end months for each project (from timeline events)
  function getProjectSpan(project: Project) {
    if (project.timeline.length === 0) return null;
    const months = project.timeline.map((t) => t.month).sort();
    const startMonth = months[0];
    const endMonth = months[months.length - 1];
    const startIdx = MONTHS.indexOf(startMonth);
    const endIdx = MONTHS.indexOf(endMonth);
    if (startIdx === -1 || endIdx === -1) return null;
    return { startIdx, endIdx };
  }

  // Sort: by phase then by earliest timeline event
  const sorted = [...projects].sort((a, b) => {
    const phaseOrder: Record<string, number> = { ETUDE: 0, DEV: 1, PROD: 2, EXPLOITATION: 3, ABANDON: 4 };
    const pa = phaseOrder[a.phase] ?? 4;
    const pb = phaseOrder[b.phase] ?? 4;
    if (pa !== pb) return pa - pb;
    const sa = getProjectSpan(a);
    const sb = getProjectSpan(b);
    return (sa?.startIdx ?? 99) - (sb?.startIdx ?? 99);
  });

  return (
    <div className="overflow-x-auto" data-testid="gantt-view">
      <div className="min-w-[900px]">
        {/* Header */}
        <div className="flex border-b border-border">
          <div className="w-[220px] flex-shrink-0 p-2 text-xs font-medium text-muted-foreground">Projet</div>
          <div className="flex-1 flex">
            {MONTHS.map((m, i) => (
              <div
                key={m}
                className={`flex-1 p-1.5 text-center text-[10px] font-medium border-l border-border ${
                  i === currentIdx ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {formatMonth(m)}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {sorted.map((project) => {
          const cfg = PHASE_CONFIG[project.phase];
          const span = getProjectSpan(project);

          return (
            <div
              key={project.id}
              className="flex border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors h-9"
              onClick={() => onProjectClick(project)}
              data-testid={`gantt-row-${project.id}`}
            >
              <div className="w-[220px] flex-shrink-0 px-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                <span className="text-xs font-medium truncate">{project.name}</span>
              </div>
              <div className="flex-1 flex relative">
                {MONTHS.map((m, i) => (
                  <div
                    key={m}
                    className={`flex-1 border-l border-border/30 ${
                      i === currentIdx ? "bg-primary/5" : ""
                    }`}
                  />
                ))}
                {/* Horizontal bar */}
                {span && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-5 rounded-full flex items-center"
                    style={{
                      left: `${(span.startIdx / MONTHS.length) * 100}%`,
                      width: `${((span.endIdx - span.startIdx + 1) / MONTHS.length) * 100}%`,
                      background: cfg.color + "30",
                      borderLeft: `3px solid ${cfg.color}`,
                    }}
                  >
                    <div className="w-full h-full rounded-full relative">
                      {project.progress !== undefined && project.progress > 0 && (
                        <div
                          className="h-full rounded-full opacity-40"
                          style={{
                            width: `${project.progress}%`,
                            background: cfg.color,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Aucun projet à afficher.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exploitation Dashboard (Split Layout) ──
function ExploitationDashboard({ projects }: { projects: Project[] }) {
  const { toast } = useToast();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { data: allReviews = [], isLoading: reviewsLoading } = useQuery<UserReview[]>({
    queryKey: ["/api/reviews"],
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [analyzingProject, setAnalyzingProject] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, string>>({});
  const [csvUploadingFor, setCsvUploadingFor] = useState<string | null>(null);
  const [scrapingProject, setScrapingProject] = useState<string | null>(null);
  const [editingStatsFor, setEditingStatsFor] = useState<string | null>(null);
  const [statsForm, setStatsForm] = useState<{ downloadCount: string; revenue: string }>({ downloadCount: "", revenue: "" });
  const [savingStats, setSavingStats] = useState(false);

  // Group reviews by project
  const reviewsByProject = useMemo(() => {
    const map: Record<string, UserReview[]> = {};
    allReviews.forEach((r) => {
      if (!map[r.projectId]) map[r.projectId] = [];
      map[r.projectId].push(r);
    });
    return map;
  }, [allReviews]);

  const getAvgRating = (projectId: string) => {
    const reviews = reviewsByProject[projectId] || [];
    if (reviews.length === 0) return 0;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  };

  const getReviewCount = (projectId: string) => {
    return (reviewsByProject[projectId] || []).length;
  };

  const handleAnalyze = async (projectId: string) => {
    setAnalyzingProject(projectId);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/reviews/analyze`);
      const data = await res.json();
      setAnalyses((prev) => ({ ...prev, [projectId]: data.analysis }));
    } catch {
      setAnalyses((prev) => ({ ...prev, [projectId]: "Erreur lors de l'analyse. Veuillez réessayer." }));
    } finally {
      setAnalyzingProject(null);
    }
  };

  const handleScrape = async (projectId: string) => {
    setScrapingProject(projectId);
    try {
      const res = await apiRequest("POST", `/api/projects/${projectId}/scrape-reviews`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      toast({
        title: "Avis récupérés",
        description: `Note : ${data.storeRating}/5 — ${data.storeRatingCount} évaluations, ${data.storeReviewCount} avis — ${data.reviewsImported} avis importés`,
      });
    } catch {
      toast({ title: "Erreur", description: "Impossible de récupérer les avis depuis le Meta Store.", variant: "destructive" });
    } finally {
      setScrapingProject(null);
    }
  };

  const handleCsvUpload = async (projectId: string, file: File) => {
    setCsvUploadingFor(projectId);
    try {
      const text = await file.text();
      const res = await apiRequest("POST", `/api/projects/${projectId}/reviews/csv`, {
        csvContent: text,
        replaceExisting: false,
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      toast({ title: "CSV importé", description: `${data.imported} avis ajoutés (total : ${data.total})` });
    } catch {
      toast({ title: "Erreur d'import", description: "Vérifiez le format du CSV (note,commentaire)", variant: "destructive" });
    } finally {
      setCsvUploadingFor(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const handleEditStats = (project: Project) => {
    setEditingStatsFor(project.id);
    setStatsForm({
      downloadCount: String(project.downloadCount || 0),
      revenue: String(project.revenue || 0),
    });
  };

  const handleSaveStats = async (projectId: string) => {
    setSavingStats(true);
    try {
      await apiRequest("PATCH", `/api/projects/${projectId}/stats`, {
        downloadCount: parseFloat(statsForm.downloadCount) || 0,
        revenue: parseFloat(statsForm.revenue) || 0,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingStatsFor(null);
      toast({ title: "Statistiques mises à jour" });
    } catch {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } finally {
      setSavingStats(false);
    }
  };

  const renderStars = (rating: number, size: string = "h-3.5 w-3.5") => {
    const full = Math.round(rating);
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`${size} ${
              i <= full ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    );
  };

  const sortedProjects = [...projects].sort((a, b) => getReviewCount(b.id) - getReviewCount(a.id));
  const selectedProject = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : null;
  const selectedReviews = selectedProjectId ? (reviewsByProject[selectedProjectId] || []) : [];

  return (
    <div className="space-y-4" data-testid="exploitation-dashboard">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-sm font-semibold">Dashboard Exploitation — Retours utilisateurs</h2>
        {Object.keys(analyses).length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs gap-1.5"
            onClick={() => {
              let content = `EXPORT ANALYSES IA — STORYLAB ROADMAP\n`;
              content += `${'='.repeat(60)}\n`;
              content += `Date d'export : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
              content += `Nombre de projets analysés : ${Object.keys(analyses).length}\n\n`;
              projects.forEach((project) => {
                if (!analyses[project.id]) return;
                const reviews = reviewsByProject[project.id] || [];
                const rating = project.storeRating || 0;
                const ratingCount = project.storeRatingCount || 0;
                const reviewCount = project.storeReviewCount || 0;
                content += `\n${'\u2550'.repeat(60)}\n`;
                content += `${project.name.toUpperCase()}\n`;
                content += `${'\u2550'.repeat(60)}\n\n`;
                content += `Note moyenne : ${rating.toFixed(1)}/5 | Évaluations : ${ratingCount} | Avis : ${reviewCount}\n`;
                if (project.downloadCount) content += `Téléchargements : ${project.downloadCount.toLocaleString('fr-FR')}\n`;
                if (project.revenue) content += `Revenus : ${project.revenue.toLocaleString('fr-FR')} €\n`;
                content += `\n${'─'.repeat(40)}\nANALYSE\n${'─'.repeat(40)}\n\n`;
                content += analyses[project.id];
                content += `\n\n${'─'.repeat(40)}\nCOMMENTAIRES (${reviews.length})\n${'─'.repeat(40)}\n\n`;
                reviews.forEach((r, i) => {
                  content += `${i + 1}. [${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}] ${new Date(r.createdAt).toLocaleDateString('fr-FR')}\n`;
                  content += `   ${r.comment}\n\n`;
                });
              });
              const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `analyses-ia-storylab-${new Date().toISOString().slice(0, 10)}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            data-testid="export-all-analyses"
          >
            <Download className="h-3.5 w-3.5" /> Export Analyses IA ({Object.keys(analyses).length})
          </Button>
        )}
      </div>

      {/* Split layout */}
      <div className="flex gap-4 min-h-[500px]" data-testid="exploitation-split">
        {/* LEFT: Project list */}
        <div className="w-1/2 flex-shrink-0 space-y-3 overflow-y-auto max-h-[700px] pr-2">
          {reviewsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : sortedProjects.map((project) => {
            const count = getReviewCount(project.id);
            const isSelected = selectedProjectId === project.id;
            const storeRating = project.storeRating || 0;
            const storeRatingCount = project.storeRatingCount || 0;
            const storeReviewCount = project.storeReviewCount || 0;
            const downloadCount = project.downloadCount || 0;
            const isScraping = scrapingProject === project.id;

            return (
              <div
                key={project.id}
                onClick={() => setSelectedProjectId(isSelected ? null : project.id)}
                className={`bg-card border rounded-lg p-4 cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary ring-1 ring-primary/30 shadow-sm"
                    : "border-border hover:border-primary/30 hover:shadow-sm"
                }`}
                data-testid={`exploitation-card-${project.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold">{project.name}</h3>
                  {project.metaStoreUrl && (
                    <a
                      href={project.metaStoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1 flex-shrink-0"
                    >
                      <Globe className="h-3 w-3" />
                      Meta Store
                    </a>
                  )}
                </div>

                {/* 3 distinct metrics row */}
                <div className="flex items-center gap-4 mb-3 flex-wrap">
                  {/* Note moyenne /5 */}
                  <div className="flex items-center gap-1.5">
                    {renderStars(storeRating, "h-3 w-3")}
                    <span className="text-sm font-bold tabular-nums">{storeRating > 0 ? storeRating.toFixed(1) : "—"}</span>
                    <span className="text-[10px] text-muted-foreground">/5</span>
                  </div>

                  <div className="w-px h-4 bg-border" />

                  {/* Nombre d'évaluations */}
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" />
                    <span className="text-xs font-semibold tabular-nums">{storeRatingCount}</span>
                    <span className="text-[10px] text-muted-foreground">éval.</span>
                  </div>

                  <div className="w-px h-4 bg-border" />

                  {/* Nombre d'avis */}
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-semibold tabular-nums">{storeReviewCount}</span>
                    <span className="text-[10px] text-muted-foreground">avis</span>
                  </div>

                  <div className="w-px h-4 bg-border" />

                  {/* Nombre de téléchargements */}
                  <div className="flex items-center gap-1">
                    <ArrowDownToLine className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-semibold tabular-nums">{downloadCount.toLocaleString("fr-FR")}</span>
                    <span className="text-[10px] text-muted-foreground">téléch.</span>
                  </div>

                  <div className="w-px h-4 bg-border" />

                  {/* Revenus */}
                  <div className="flex items-center gap-1">
                    <Euro className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-semibold tabular-nums">{(project.revenue || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                    <span className="text-[10px] text-muted-foreground">€</span>
                  </div>
                </div>

                {/* Inline stats edit form */}
                {editingStatsFor === project.id ? (
                  <div className="flex items-end gap-2 mb-3 p-2 bg-muted/40 rounded-md" onClick={(e) => e.stopPropagation()}>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground block mb-1">Téléchargements</label>
                      <Input
                        type="number"
                        min={0}
                        value={statsForm.downloadCount}
                        onChange={(e) => setStatsForm((f) => ({ ...f, downloadCount: e.target.value }))}
                        className="h-7 text-xs"
                        data-testid={`input-downloads-${project.id}`}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground block mb-1">Revenus (€)</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={statsForm.revenue}
                        onChange={(e) => setStatsForm((f) => ({ ...f, revenue: e.target.value }))}
                        className="h-7 text-xs"
                        data-testid={`input-revenue-${project.id}`}
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      onClick={() => handleSaveStats(project.id)}
                      disabled={savingStats}
                      data-testid={`save-stats-${project.id}`}
                    >
                      {savingStats ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> Valider</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => setEditingStatsFor(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-1.5"
                      onClick={(e) => { e.stopPropagation(); handleEditStats(project); }}
                      data-testid={`edit-stats-${project.id}`}
                    >
                      <Pencil className="h-2.5 w-2.5" /> Saisir téléch. / revenus
                    </Button>
                    {project.statsUpdatedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        (mis à jour le {new Date(project.statsUpdatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })})
                      </span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {project.metaStoreUrl && (
                    <div className="flex flex-col items-start gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleScrape(project.id);
                        }}
                        disabled={isScraping}
                        data-testid={`scrape-${project.id}`}
                      >
                        {isScraping ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Récupération...</>
                        ) : (
                          <><Download className="h-3 w-3" /> Récupérer avis</>
                        )}
                      </Button>
                      {project.lastScrapedAt && (
                        <span className="text-[10px] text-muted-foreground pl-0.5" data-testid={`last-scraped-${project.id}`}>
                          Dernière récup. : {new Date(project.lastScrapedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  )}
                  <input
                    ref={csvUploadingFor === project.id ? csvInputRef : undefined}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    id={`csv-${project.id}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCsvUpload(project.id, file);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById(`csv-${project.id}`)?.click();
                    }}
                    disabled={csvUploadingFor === project.id}
                    data-testid={`csv-upload-${project.id}`}
                  >
                    {csvUploadingFor === project.id ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Import...</>
                    ) : (
                      <><Paperclip className="h-3 w-3" /> Importer CSV</>
                    )}
                  </Button>
                  {count > 0 && (
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "ghost"}
                      className="h-7 text-[11px] gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectId(project.id);
                        handleAnalyze(project.id);
                      }}
                      disabled={analyzingProject === project.id}
                      data-testid={`analyze-${project.id}`}
                    >
                      {analyzingProject === project.id ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Analyse...</>
                      ) : (
                        <><Sparkles className="h-3 w-3" /> Analyser IA</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT: Analysis panel */}
        <div className="w-1/2 flex-shrink-0">
          <div className="bg-card border border-border rounded-lg h-full overflow-hidden flex flex-col" data-testid="analysis-panel">
            {selectedProject ? (
              <>
                {/* Panel header */}
                <div className="p-4 border-b border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">{selectedProject.name}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSelectedProjectId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {/* Note moyenne — same as left card */}
                    <div className="flex items-center gap-1.5">
                      {renderStars(selectedProject.storeRating || 0, "h-3 w-3")}
                      <span className="text-xs font-medium tabular-nums">{(selectedProject.storeRating || 0) > 0 ? (selectedProject.storeRating || 0).toFixed(1) : "—"}</span>
                      <span className="text-[10px] text-muted-foreground">/5</span>
                    </div>
                    <div className="w-px h-3.5 bg-border" />
                    {/* Évaluations */}
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" />
                      <span className="text-xs font-medium tabular-nums">{selectedProject.storeRatingCount || 0}</span>
                      <span className="text-[10px] text-muted-foreground">éval.</span>
                    </div>
                    <div className="w-px h-3.5 bg-border" />
                    {/* Avis */}
                    <div className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium tabular-nums">{selectedProject.storeReviewCount || 0}</span>
                      <span className="text-[10px] text-muted-foreground">avis</span>
                    </div>
                    <div className="w-px h-3.5 bg-border" />
                    {/* Téléchargements */}
                    <div className="flex items-center gap-1">
                      <ArrowDownToLine className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium tabular-nums">{(selectedProject.downloadCount || 0).toLocaleString("fr-FR")}</span>
                      <span className="text-[10px] text-muted-foreground">téléch.</span>
                    </div>
                    <div className="w-px h-3.5 bg-border" />
                    {/* Revenus */}
                    <div className="flex items-center gap-1">
                      <Euro className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium tabular-nums">{(selectedProject.revenue || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-muted-foreground">€</span>
                    </div>
                  </div>
                </div>

                {/* Panel body */}
                <ScrollArea className="flex-1 p-4">
                  {/* AI Analysis */}
                  {analyses[selectedProject.id] ? (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="text-[10px] h-5 px-2 bg-primary/10 text-primary border-0">
                          Analyse IA
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] gap-1"
                          onClick={() => handleAnalyze(selectedProject.id)}
                          disabled={analyzingProject === selectedProject.id}
                        >
                          {analyzingProject === selectedProject.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Actualiser"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] gap-1 ml-auto"
                          onClick={() => {
                            const projectName = selectedProject.name;
                            const analysisText = analyses[selectedProject.id];
                            const reviews = reviewsByProject[selectedProject.id] || [];
                            const rating = selectedProject.storeRating || 0;
                            const ratingCount = selectedProject.storeRatingCount || 0;
                            const reviewCount = selectedProject.storeReviewCount || 0;
                            let content = `ANALYSE IA — ${projectName}\n`;
                            content += `${'='.repeat(60)}\n\n`;
                            content += `Date d'export : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;
                            content += `Note moyenne : ${rating.toFixed(1)}/5 | Évaluations : ${ratingCount} | Avis : ${reviewCount}\n`;
                            if (selectedProject.downloadCount) content += `Téléchargements : ${selectedProject.downloadCount.toLocaleString('fr-FR')}\n`;
                            if (selectedProject.revenue) content += `Revenus : ${selectedProject.revenue.toLocaleString('fr-FR')} €\n`;
                            content += `\n${'─'.repeat(60)}\nANALYSE\n${'─'.repeat(60)}\n\n`;
                            content += analysisText;
                            content += `\n\n${'─'.repeat(60)}\nCOMMENTAIRES (${reviews.length})\n${'─'.repeat(60)}\n\n`;
                            reviews.forEach((r, i) => {
                              content += `${i + 1}. [${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}] ${new Date(r.createdAt).toLocaleDateString('fr-FR')}\n`;
                              content += `   ${r.comment}\n\n`;
                            });
                            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `analyse-ia-${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          data-testid="export-analysis-single"
                        >
                          <Download className="h-3 w-3" /> Exporter
                        </Button>
                      </div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert">
                        {analyses[selectedProject.id]}
                      </div>
                    </div>
                  ) : analyzingProject === selectedProject.id ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                      <span className="text-sm text-muted-foreground">Analyse en cours...</span>
                    </div>
                  ) : selectedReviews.length > 0 ? (
                    <div className="text-center py-6">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground mb-2">Cliquez sur "Analyser IA" pour obtenir une synthèse</p>
                      <Button
                        size="sm"
                        onClick={() => handleAnalyze(selectedProject.id)}
                        className="gap-1"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Lancer l'analyse
                      </Button>
                    </div>
                  ) : null}

                  {/* Reviews list */}
                  {selectedReviews.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Commentaires ({selectedReviews.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedReviews.map((review) => (
                          <div
                            key={review.id}
                            className="border border-border/50 rounded-md p-3 text-sm"
                            data-testid={`review-${review.id}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {renderStars(review.rating, "h-3 w-3")}
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(review.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed">{review.comment}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedReviews.length === 0 && !analyzingProject && (
                    <div className="text-center py-10">
                      <MessageCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Aucun avis pour ce projet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Importez un CSV pour commencer l'analyse.</p>
                    </div>
                  )}
                </ScrollArea>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center py-16">
                  <Eye className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">Sélectionnez un projet</p>
                  <p className="text-xs text-muted-foreground mt-1">pour voir l'analyse des retours utilisateurs</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Project Form Dialog ──
function ProjectFormDialog({
  open,
  onClose,
  project,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  onSubmit: (data: Omit<Project, "id">) => void;
  isPending: boolean;
}) {
  const initial = project ? { ...project } : emptyProject();
  const [form, setForm] = useState(initial);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newTimelineMonth, setNewTimelineMonth] = useState("");
  const [newTimelineDesc, setNewTimelineDesc] = useState("");
  const [newTag, setNewTag] = useState("");
  const [customFormat, setCustomFormat] = useState("");
  const [showCustomFormat, setShowCustomFormat] = useState(false);
  // Festival form state
  const [newFestival, setNewFestival] = useState({ festivalName: "", year: new Date().getFullYear(), status: "submitted" as const, category: "", award: "" });
  // Platform form state
  const [newPlatform, setNewPlatform] = useState({ platformName: "", storeUrl: "", releaseDate: "" });

  // Reset form when dialog opens with new data
  useMemo(() => {
    if (open) {
      setForm(project ? { ...project } : emptyProject());
    }
  }, [open, project]);

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.name || !form.name.trim()) errors.name = "Le nom du projet est requis";
    if (!form.phase) errors.phase = "La phase est requise";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    onSubmit(form);
  };

  const addTimelineEvent = () => {
    if (newTimelineMonth && newTimelineDesc) {
      const newTimeline = [...form.timeline, { month: newTimelineMonth, description: newTimelineDesc }]
        .sort((a, b) => a.month.localeCompare(b.month));
      setForm({ ...form, timeline: newTimeline });
      setNewTimelineMonth("");
      setNewTimelineDesc("");
    }
  };

  const removeTimelineEvent = (idx: number) => {
    setForm({ ...form, timeline: form.timeline.filter((_, i) => i !== idx) });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{project ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nom</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.replace(/[<>]/g, "") })}
                  required
                  data-testid="form-name"
                />
              </div>
              <div>
                <Label className="text-xs">Phase</Label>
                <Select value={form.phase} onValueChange={(v: any) => setForm({ ...form, phase: v })}>
                  <SelectTrigger data-testid="form-phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ETUDE">Étude</SelectItem>
                    <SelectItem value="DEV">Développement</SelectItem>
                    <SelectItem value="PROD">Production</SelectItem>
                    <SelectItem value="EXPLOITATION">Exploitation</SelectItem>
                    <SelectItem value="ABANDON">Abandonné</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Détail de phase</Label>
              <Input
                value={form.phaseDetail || ""}
                onChange={(e) => setForm({ ...form, phaseDetail: e.target.value })}
                placeholder="ex: Livraison prévue décembre"
                data-testid="form-phase-detail"
              />
            </div>

            <div>
              <Label className="text-xs">Résumé</Label>
              <Textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={3}
                data-testid="form-summary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Producteur</Label>
                <Input
                  value={form.producer}
                  onChange={(e) => setForm({ ...form, producer: e.target.value })}
                  data-testid="form-producer"
                />
              </div>
              <div>
                <Label className="text-xs">Plateformes</Label>
                <Input
                  value={form.platforms}
                  onChange={(e) => setForm({ ...form, platforms: e.target.value })}
                  data-testid="form-platforms"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-2 block">Formats</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {["VR Standalone", "PCVR", "AR", "MR", "360°", "WebXR", "Flat"].map((fmt) => {
                  const checked = form.formats.includes(fmt);
                  return (
                    <label key={fmt} className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? form.formats.filter((f) => f !== fmt)
                            : [...form.formats, fmt];
                          setForm({ ...form, formats: next });
                        }}
                        className="rounded border-border h-3.5 w-3.5 accent-primary"
                      />
                      {fmt}
                    </label>
                  );
                })}
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={showCustomFormat || form.formats.some((f) => !["VR Standalone", "PCVR", "AR", "MR", "360°", "WebXR", "Flat"].includes(f))}
                    onChange={(e) => {
                      setShowCustomFormat(e.target.checked);
                      if (!e.target.checked) {
                        setForm({ ...form, formats: form.formats.filter((f) => ["VR Standalone", "PCVR", "AR", "MR", "360°", "WebXR", "Flat"].includes(f)) });
                        setCustomFormat("");
                      }
                    }}
                    className="rounded border-border h-3.5 w-3.5 accent-primary"
                  />
                  Autre
                </label>
              </div>
              {(showCustomFormat || form.formats.some((f) => !["VR Standalone", "PCVR", "AR", "MR", "360°", "WebXR", "Flat"].includes(f))) && (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={customFormat || form.formats.filter((f) => !["VR Standalone", "PCVR", "AR", "MR", "360°", "WebXR", "Flat"].includes(f)).join(", ")}
                    onChange={(e) => {
                      setCustomFormat(e.target.value);
                      const predefined = form.formats.filter((f) => ["VR Standalone", "PCVR", "AR", "MR", "360°", "WebXR", "Flat"].includes(f));
                      const custom = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      setForm({ ...form, formats: [...predefined, ...custom] });
                    }}
                    placeholder="Format personnalisé..."
                    className="text-xs h-8 flex-1"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Langues (séparées par virgule)</Label>
              <Input
                value={form.languages.join(", ")}
                onChange={(e) => setForm({ ...form, languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="FR, EN"
                data-testid="form-languages"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contrat</Label>
                <Input
                  value={form.contract}
                  onChange={(e) => setForm({ ...form, contract: e.target.value })}
                  data-testid="form-contract"
                />
              </div>
              <div>
                <Label className="text-xs">Avancement (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress || 0}
                  onChange={(e) => { const v = parseInt(e.target.value) || 0; setForm({ ...form, progress: Math.min(100, Math.max(0, v)) }); }}
                  data-testid="form-progress"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nom du référent projet</Label>
                <Input
                  value={form.referentName || ""}
                  onChange={(e) => setForm({ ...form, referentName: e.target.value })}
                  placeholder="Prénom Nom"
                  data-testid="form-referent-name"
                />
              </div>
              <div>
                <Label className="text-xs">E-mail du référent</Label>
                <Input
                  type="email"
                  value={form.referentEmail || ""}
                  onChange={(e) => setForm({ ...form, referentEmail: e.target.value })}
                  placeholder="prenom.nom@example.com"
                  data-testid="form-referent-email"
                />
              </div>
            </div>

            {/* Genre & Public cible */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Genre</Label>
                <Input
                  value={form.genre || ""}
                  onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  placeholder="Documentaire, Fiction, Jeu..."
                />
              </div>
              <div>
                <Label className="text-xs">Public cible</Label>
                <Input
                  value={form.targetAudience || ""}
                  onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                  placeholder="Grand public, Jeunesse, Éducation..."
                />
              </div>
            </div>

            <div>
              <Label className="text-xs mb-2 block">Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.tags || []).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                    {tag}
                    <button type="button" onClick={() => setForm({ ...form, tags: (form.tags || []).filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Ajouter un tag..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      e.preventDefault();
                      setForm({ ...form, tags: [...(form.tags || []), newTag.trim()] });
                      setNewTag("");
                    }
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                  if (newTag.trim()) {
                    setForm({ ...form, tags: [...(form.tags || []), newTag.trim()] });
                    setNewTag("");
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Festivals */}
            <div>
              <Label className="text-xs mb-2 block">Festivals & Sélections</Label>
              {(form.festivals || []).length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {(form.festivals || []).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                      <Trophy className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <span className="font-medium flex-shrink-0">{f.festivalName} ({f.year})</span>
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {f.status === "submitted" ? "Soumis" : f.status === "selected" ? "Sélectionné" : f.status === "awarded" ? "Primé" : "Refusé"}
                      </Badge>
                      {f.award && <span className="text-amber-600">🏆 {f.award}</span>}
                      <button type="button" onClick={() => setForm({ ...form, festivals: (form.festivals || []).filter((_, j) => j !== i) })} className="ml-auto text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={newFestival.festivalName}
                    onChange={(e) => setNewFestival({ ...newFestival, festivalName: e.target.value })}
                    placeholder="Nom du festival"
                    className="text-xs h-8"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={newFestival.year}
                      onChange={(e) => setNewFestival({ ...newFestival, year: parseInt(e.target.value) || new Date().getFullYear() })}
                      className="text-xs h-8 w-20"
                    />
                    <Select value={newFestival.status} onValueChange={(v: any) => setNewFestival({ ...newFestival, status: v })}>
                      <SelectTrigger className="text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">Soumis</SelectItem>
                        <SelectItem value="selected">Sélectionné</SelectItem>
                        <SelectItem value="awarded">Primé</SelectItem>
                        <SelectItem value="rejected">Refusé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newFestival.category}
                    onChange={(e) => setNewFestival({ ...newFestival, category: e.target.value })}
                    placeholder="Catégorie (optionnel)"
                    className="text-xs h-8 flex-1"
                  />
                  <Input
                    value={newFestival.award}
                    onChange={(e) => setNewFestival({ ...newFestival, award: e.target.value })}
                    placeholder="Prix (optionnel)"
                    className="text-xs h-8 flex-1"
                  />
                  <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => {
                    if (newFestival.festivalName.trim()) {
                      const entry = {
                        id: crypto.randomUUID(),
                        festivalName: newFestival.festivalName.trim(),
                        year: newFestival.year,
                        status: newFestival.status,
                        category: newFestival.category || undefined,
                        award: newFestival.award || undefined,
                      };
                      setForm({ ...form, festivals: [...(form.festivals || []), entry] });
                      setNewFestival({ festivalName: "", year: new Date().getFullYear(), status: "submitted", category: "", award: "" });
                    }
                  }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Platform Distribution */}
            <div>
              <Label className="text-xs mb-2 block">Distribution multi-plateformes</Label>
              {(form.platformEntries || []).length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {(form.platformEntries || []).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                      <Monitor className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      <span className="font-medium">{p.platformName}</span>
                      {p.storeUrl && <a href={p.storeUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[150px]">{p.storeUrl}</a>}
                      {p.rating !== undefined && <span>⭐ {p.rating.toFixed(1)}</span>}
                      <button type="button" onClick={() => setForm({ ...form, platformEntries: (form.platformEntries || []).filter((_, j) => j !== i) })} className="ml-auto text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newPlatform.platformName}
                  onChange={(e) => setNewPlatform({ ...newPlatform, platformName: e.target.value })}
                  placeholder="Ex: Meta Quest, Steam VR..."
                  className="text-xs h-8 flex-1"
                />
                <Input
                  value={newPlatform.storeUrl}
                  onChange={(e) => setNewPlatform({ ...newPlatform, storeUrl: e.target.value })}
                  placeholder="URL du store (optionnel)"
                  className="text-xs h-8 flex-1"
                />
                <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => {
                  if (newPlatform.platformName.trim()) {
                    const entry = {
                      id: crypto.randomUUID(),
                      platformName: newPlatform.platformName.trim(),
                      storeUrl: newPlatform.storeUrl || undefined,
                      releaseDate: newPlatform.releaseDate || undefined,
                    };
                    setForm({ ...form, platformEntries: [...(form.platformEntries || []), entry] });
                    setNewPlatform({ platformName: "", storeUrl: "", releaseDate: "" });
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Engagement KPIs */}
            <div>
              <Label className="text-xs mb-2 block">KPIs d'engagement immersif</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Durée moy. session (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.engagementKpis?.avgSessionDuration ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      engagementKpis: { ...form.engagementKpis, avgSessionDuration: e.target.value ? parseFloat(e.target.value) : undefined },
                    })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Taux complétion (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.engagementKpis?.completionRate ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      engagementKpis: { ...form.engagementKpis, completionRate: e.target.value ? parseFloat(e.target.value) : undefined },
                    })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Rétention J1 (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.engagementKpis?.retentionD1 ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      engagementKpis: { ...form.engagementKpis, retentionD1: e.target.value ? parseFloat(e.target.value) : undefined },
                    })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Rétention J7 (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.engagementKpis?.retentionD7 ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      engagementKpis: { ...form.engagementKpis, retentionD7: e.target.value ? parseFloat(e.target.value) : undefined },
                    })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Taux mal de transport (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.engagementKpis?.motionSicknessRate ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      engagementKpis: { ...form.engagementKpis, motionSicknessRate: e.target.value ? parseFloat(e.target.value) : undefined },
                    })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Sessions totales</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.engagementKpis?.totalSessions ?? ""}
                    onChange={(e) => setForm({
                      ...form,
                      engagementKpis: { ...form.engagementKpis, totalSessions: e.target.value ? parseInt(e.target.value) : undefined },
                    })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <Label className="text-xs mb-2 block">Jalons</Label>
              {form.timeline.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {form.timeline.map((event, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2">
                      <span className="font-medium text-primary w-16 flex-shrink-0">{formatMonth(event.month)}</span>
                      <span className="flex-1 truncate">{event.description}</span>
                      <button type="button" onClick={() => removeTimelineEvent(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Select value={newTimelineMonth} onValueChange={setNewTimelineMonth}>
                  <SelectTrigger className="w-[120px]" data-testid="form-timeline-month">
                    <SelectValue placeholder="Mois" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Description du jalon"
                  value={newTimelineDesc}
                  onChange={(e) => setNewTimelineDesc(e.target.value)}
                  className="flex-1"
                  data-testid="form-timeline-desc"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addTimelineEvent} data-testid="form-add-milestone">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

          </form>
        </ScrollArea>
        <div className="flex justify-end gap-2 pt-3 border-t mt-auto flex-shrink-0">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            disabled={isPending || !form.name}
            data-testid="form-submit"
            onClick={handleSubmit}
          >
            {isPending ? "Enregistrement..." : project ? "Sauvegarder" : "Créer le projet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
