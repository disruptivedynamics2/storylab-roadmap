import { useMemo } from "react";
import type { Project } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import {
  AlertCircle, Calendar, ChevronRight, TrendingUp, Star, Download,
  Euro, Users, ArrowUpRight, ArrowDownRight, Clock,
} from "lucide-react";

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  ETUDE: { label: "Étude", color: "hsl(270, 60%, 55%)" },
  DEV: { label: "Développement", color: "hsl(38, 80%, 55%)" },
  PROD: { label: "Production", color: "hsl(192, 75%, 42%)" },
  EXPLOITATION: { label: "Exploitation", color: "hsl(142, 50%, 40%)" },
  ABANDON: { label: "Abandonné", color: "hsl(0, 0%, 50%)" },
};

const PHASE_COLORS = ["#8b5cf6", "#f59e0b", "#0891b2", "#16a34a", "#71717a"];

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

function formatMonthFull(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  return `${names[parseInt(mo) - 1]} ${y}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────
// 1. TABLEAU DE BORD SYNTHÈSE
// ────────────────────────────────────────────────────
export function SynthesisDashboard({ projects, onProjectClick }: {
  projects: Project[];
  onProjectClick: (p: Project) => void;
}) {
  const currentMonth = getCurrentMonth();

  // Phase distribution
  const phaseData = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      counts[p.phase] = (counts[p.phase] || 0) + 1;
    });
    return Object.entries(PHASE_CONFIG).map(([key, cfg]) => ({
      name: cfg.label,
      value: counts[key] || 0,
      phase: key,
    })).filter((d) => d.value > 0);
  }, [projects]);

  // By producer
  const producerData = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      const prod = p.producer?.split(" - ")[0]?.split(",")[0]?.trim() || "Non défini";
      counts[prod] = (counts[prod] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [projects]);

  // Average progress by phase
  const progressByPhase = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    projects.forEach((p) => {
      if (!sums[p.phase]) sums[p.phase] = { total: 0, count: 0 };
      sums[p.phase].total += p.progress || 0;
      sums[p.phase].count += 1;
    });
    return Object.entries(PHASE_CONFIG)
      .filter(([key]) => sums[key])
      .map(([key, cfg]) => ({
        name: cfg.label,
        progress: Math.round(sums[key].total / sums[key].count),
        color: cfg.color,
      }));
  }, [projects]);

  // Upcoming rights expirations
  const expiringRights = useMemo(() => {
    return projects
      .filter((p) => p.endOfRights && p.endOfRights.includes("-") && p.endOfRights >= currentMonth && p.phase !== "ABANDON")
      .sort((a, b) => (a.endOfRights || "").localeCompare(b.endOfRights || ""))
      .slice(0, 5);
  }, [projects, currentMonth]);

  // Global KPIs
  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.phase !== "ABANDON").length;
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length)
    : 0;
  const exploitationCount = projects.filter((p) => p.phase === "EXPLOITATION").length;

  return (
    <div className="space-y-6">
      {/* Global KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold tabular-nums">{totalProjects}</p>
          <p className="text-xs text-muted-foreground mt-1">Projets total</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-primary">{activeProjects}</p>
          <p className="text-xs text-muted-foreground mt-1">Projets actifs</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold tabular-nums">{avgProgress}%</p>
          <p className="text-xs text-muted-foreground mt-1">Avancement moyen</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{exploitationCount}</p>
          <p className="text-xs text-muted-foreground mt-1">En exploitation</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Phase distribution pie chart */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Répartition par phase</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie isAnimationActive={false}                 data={phaseData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
                labelLine={false}
              >
                {phaseData.map((entry, i) => (
                  <Cell key={entry.phase} fill={PHASE_COLORS[Object.keys(PHASE_CONFIG).indexOf(entry.phase)] || "#ccc"} />
                ))}
              </Pie>
              <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs">{value}</span>} />
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Projects by producer */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Projets par producteur</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={producerData} layout="vertical" margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Bar dataKey="count" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} name="Projets" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Progress by phase */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Avancement moyen par phase</h3>
          <div className="space-y-3">
            {progressByPhase.map((item) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{item.name}</span>
                  <span className="text-xs tabular-nums font-medium">{item.progress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${item.progress}%`, background: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming rights expirations */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            Fins de droits à venir
          </h3>
          {expiringRights.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucune fin de droits imminente</p>
          ) : (
            <div className="space-y-2">
              {expiringRights.map((p) => {
                const isUrgent = (p.endOfRights && p.endOfRights.includes("-")) ? p.endOfRights <= currentMonth : false;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isUrgent ? "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50" : "bg-muted/50 hover:bg-muted"
                    }`}
                    onClick={() => onProjectClick(p)}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <p className={`text-[11px] ${isUrgent ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                        {formatMonthFull(p.endOfRights || "")}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────
// 2. ÉCHÉANCES & ALERTES
// ────────────────────────────────────────────────────
export function DeadlinesView({ projects, onProjectClick }: {
  projects: Project[];
  onProjectClick: (p: Project) => void;
}) {
  const currentMonth = getCurrentMonth();

  // Collect all future events across all projects
  const allEvents = useMemo(() => {
    const events: { project: Project; month: string; description: string; type: "event" | "rights" }[] = [];

    projects.forEach((p) => {
      if (p.phase === "ABANDON") return;

      // Timeline events
      p.timeline.forEach((t) => {
        if (t.month >= currentMonth) {
          events.push({ project: p, month: t.month, description: t.description, type: "event" });
        }
      });

      // End of rights
      if (p.endOfRights && p.endOfRights >= currentMonth) {
        events.push({ project: p, month: p.endOfRights, description: "Fin des droits", type: "rights" });
      }
    });

    return events.sort((a, b) => a.month.localeCompare(b.month));
  }, [projects, currentMonth]);

  // Group by month
  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof allEvents> = {};
    allEvents.forEach((e) => {
      if (!groups[e.month]) groups[e.month] = [];
      groups[e.month].push(e);
    });
    return Object.entries(groups);
  }, [allEvents]);

  const getUrgency = (month: string) => {
    if (month === currentMonth) return "now";
    const [cy, cm] = currentMonth.split("-").map(Number);
    const nextMonth = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, "0")}`;
    if (month === nextMonth) return "soon";
    return "later";
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold tabular-nums text-red-600">{allEvents.filter((e) => getUrgency(e.month) === "now").length}</p>
          <p className="text-[11px] text-muted-foreground">Ce mois-ci</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold tabular-nums text-orange-500">{allEvents.filter((e) => getUrgency(e.month) === "soon").length}</p>
          <p className="text-[11px] text-muted-foreground">Mois prochain</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold tabular-nums">{allEvents.filter((e) => getUrgency(e.month) === "later").length}</p>
          <p className="text-[11px] text-muted-foreground">Plus tard</p>
        </Card>
      </div>

      {/* Timeline */}
      {groupedEvents.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">Aucun événement à venir</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map(([month, events]) => {
            const urgency = getUrgency(month);
            return (
              <div key={month}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${
                    urgency === "now" ? "bg-red-500" : urgency === "soon" ? "bg-orange-400" : "bg-muted-foreground/40"
                  }`} />
                  <h3 className={`text-sm font-semibold ${
                    urgency === "now" ? "text-red-600 dark:text-red-400" : urgency === "soon" ? "text-orange-600 dark:text-orange-400" : ""
                  }`}>
                    {formatMonthFull(month)}
                    {urgency === "now" && <span className="ml-2 text-[10px] font-medium bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">EN COURS</span>}
                  </h3>
                </div>
                <div className="space-y-2 ml-5 border-l-2 border-border pl-4">
                  {events.map((event, i) => {
                    const cfg = PHASE_CONFIG[event.project.phase];
                    return (
                      <div
                        key={`${event.project.id}-${i}`}
                        className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => onProjectClick(event.project)}
                      >
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: cfg?.color || "#999" }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium truncate">{event.project.name}</span>
                            {event.type === "rights" && (
                              <Badge variant="destructive" className="text-[9px] h-4">Fin de droits</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{event.description}</p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
// 3. VUE TABLEAU
// ────────────────────────────────────────────────────
export function TableView({ projects, onProjectClick }: {
  projects: Project[];
  onProjectClick: (p: Project) => void;
}) {
  const currentMonth = getCurrentMonth();

  const getNextEvent = (project: Project) => {
    const upcoming = project.timeline.filter((t) => t.month >= currentMonth);
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) => a.month.localeCompare(b.month));
    return upcoming[0];
  };

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      // Active phases first, then by name
      const phaseOrder = ["EXPLOITATION", "PROD", "DEV", "ETUDE", "ABANDON"];
      const phaseA = phaseOrder.indexOf(a.phase);
      const phaseB = phaseOrder.indexOf(b.phase);
      if (phaseA !== phaseB) return phaseA - phaseB;
      return a.name.localeCompare(b.name);
    });
  }, [projects]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[200px]">Projet</th>
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[110px]">Phase</th>
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[140px]">Producteur</th>
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[100px]">Avancement</th>
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[180px]">Prochaine étape</th>
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[100px]">Fin de droits</th>
            <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground w-[100px]">Référent</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((project) => {
            const cfg = PHASE_CONFIG[project.phase];
            const nextEvent = getNextEvent(project);
            const rightsExpiring = project.endOfRights && project.endOfRights.includes("-") && project.endOfRights && project.endOfRights <= currentMonth;
            return (
              <tr
                key={project.id}
                className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onProjectClick(project)}
              >
                <td className="py-2.5 px-3">
                  <span className="text-xs font-medium">{project.name}</span>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg?.color }} />
                    <span className="text-xs">{cfg?.label}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs text-muted-foreground truncate block max-w-[130px]">
                    {project.producer?.split(" - ")[0]?.split(",")[0] || "—"}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${project.progress || 0}%`, background: cfg?.color }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">
                      {project.progress || 0}%
                    </span>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  {nextEvent ? (
                    <div>
                      <span className="text-[10px] font-medium text-primary">{formatMonth(nextEvent.month)}</span>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{nextEvent.description}</p>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  {project.endOfRights ? (
                    <span className={`text-xs ${rightsExpiring ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                      {formatMonth(project.endOfRights)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-xs text-muted-foreground truncate block max-w-[90px]">
                    {project.referentName || "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Aucun projet trouvé</p>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
// 4. PERFORMANCE EXPLOITATION
// ────────────────────────────────────────────────────
export function ExploitationPerformance({ projects }: { projects: Project[] }) {
  // Only exploitation projects with data
  const exploitProjects = useMemo(() => {
    return projects.filter((p) => p.phase === "EXPLOITATION");
  }, [projects]);

  // Aggregate stats
  const totalDownloads = exploitProjects.reduce((s, p) => s + (p.downloadCount || 0), 0);
  const totalRevenue = exploitProjects.reduce((s, p) => s + (p.revenue || 0), 0);
  const avgRating = exploitProjects.filter((p) => p.storeRating).length > 0
    ? exploitProjects.filter((p) => p.storeRating).reduce((s, p) => s + (p.storeRating || 0), 0) / exploitProjects.filter((p) => p.storeRating).length
    : 0;
  const totalReviews = exploitProjects.reduce((s, p) => s + (p.storeReviewCount || 0), 0);

  // Rating comparison data
  const ratingData = useMemo(() => {
    return exploitProjects
      .filter((p) => p.storeRating)
      .map((p) => ({
        name: p.name.length > 15 ? p.name.slice(0, 13) + "…" : p.name,
        rating: p.storeRating || 0,
        reviews: p.storeReviewCount || 0,
      }))
      .sort((a, b) => b.rating - a.rating);
  }, [exploitProjects]);

  // Revenue + downloads comparison
  const revenueData = useMemo(() => {
    return exploitProjects
      .filter((p) => (p.revenue || 0) > 0 || (p.downloadCount || 0) > 0)
      .map((p) => ({
        name: p.name.length > 15 ? p.name.slice(0, 13) + "…" : p.name,
        revenue: p.revenue || 0,
        downloads: p.downloadCount || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [exploitProjects]);

  if (exploitProjects.length === 0) {
    return (
      <Card className="p-8 text-center">
        <TrendingUp className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">Aucun projet en exploitation</p>
        <p className="text-xs text-muted-foreground mt-1">Les métriques apparaîtront quand des projets seront en phase d'exploitation.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground">Note moyenne</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{avgRating.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">/5</span></p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Avis total</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{totalReviews.toLocaleString("fr-FR")}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Download className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Téléchargements</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{totalDownloads.toLocaleString("fr-FR")}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Euro className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Revenus</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{totalRevenue.toLocaleString("fr-FR")} <span className="text-sm font-normal">€</span></p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ratings comparison */}
        {ratingData.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Notes des applications</h3>
            <ResponsiveContainer width="100%" height={Math.max(180, ratingData.length * 40)}>
              <BarChart data={ratingData} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={(value: number) => [`${value}/5`, "Note"]} />
                <Bar dataKey="rating" fill="#eab308" radius={[0, 4, 4, 0]} name="Note" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Revenue comparison */}
        {revenueData.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Revenus par application</h3>
            <ResponsiveContainer width="100%" height={Math.max(180, revenueData.length * 40)}>
              <BarChart data={revenueData} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={(value: number) => [`${value.toLocaleString("fr-FR")} €`, "Revenus"]} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Revenus" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Project detail cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Détails par projet</h3>
        {exploitProjects.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">{p.name}</h4>
              {p.metaStoreUrl && (
                <Badge variant="outline" className="text-[10px]">Meta Store</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums">{p.storeRating ? `${p.storeRating.toFixed(1)}/5` : "—"}</p>
                <p className="text-[11px] text-muted-foreground">Note</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{p.storeReviewCount?.toLocaleString("fr-FR") || "—"}</p>
                <p className="text-[11px] text-muted-foreground">Avis</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{p.downloadCount?.toLocaleString("fr-FR") || "—"}</p>
                <p className="text-[11px] text-muted-foreground">Téléchargements</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{p.revenue ? `${p.revenue.toLocaleString("fr-FR")} €` : "—"}</p>
                <p className="text-[11px] text-muted-foreground">Revenus</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
