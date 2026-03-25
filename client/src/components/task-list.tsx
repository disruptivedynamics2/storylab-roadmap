import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { Task, Project, SafeUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  User,
  FolderOpen,
  CalendarDays,
} from "lucide-react";

const PRIORITY_CONFIG = {
  high: { label: "Haute", icon: ArrowUp, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
  medium: { label: "Moyenne", icon: Minus, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  low: { label: "Basse", icon: ArrowDown, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
};

const STATUS_CONFIG = {
  todo: { label: "À faire", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "En cours", icon: Clock, color: "text-blue-500" },
  done: { label: "Terminé", icon: CheckCircle2, color: "text-emerald-500" },
};

interface TaskListProps {
  projects: Project[];
  onProjectClick?: (p: Project) => void;
}

export function TaskList({ projects, onProjectClick }: TaskListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"mine" | "assigned" | "all">("mine");
  const [showDone, setShowDone] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: users = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Tâche créée" });
      closeForm();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Tâche supprimée" });
    },
  });

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    if (!user) return [];
    let list = tasks;

    if (filter === "mine") {
      list = list.filter((t) => t.assigneeId === user.id);
    } else if (filter === "assigned") {
      list = list.filter((t) => t.createdById === user.id && t.assigneeId !== user.id);
    }

    if (!showDone) {
      list = list.filter((t) => t.status !== "done");
    }

    // Sort: high priority first, then by creation date
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      const pa = priorityOrder[a.priority] ?? 1;
      const pb = priorityOrder[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [tasks, user, filter, showDone]);

  // Count of pending tasks assigned to me
  const myPendingCount = useMemo(() => {
    if (!user) return 0;
    return tasks.filter((t) => t.assigneeId === user.id && t.status !== "done").length;
  }, [tasks, user]);

  const openForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssigneeId(user?.id || "");
    setSelectedProjects([]);
    setDueDate("");
    setShowForm(true);
  };

  const closeForm = () => setShowForm(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      description,
      priority,
      assigneeId: assigneeId || user?.id,
      projectIds: selectedProjects,
      dueDate: dueDate || undefined,
    });
  };

  const toggleStatus = (task: Task) => {
    const nextStatus = task.status === "done" ? "todo" : task.status === "todo" ? "in_progress" : "done";
    updateMutation.mutate({ id: task.id, data: { status: nextStatus } });
  };

  const quickComplete = (task: Task) => {
    updateMutation.mutate({ id: task.id, data: { status: task.status === "done" ? "todo" : "done" } });
  };

  const getUserName = (userId: string) => {
    const u = (users as SafeUser[])?.find((u) => u.id === userId);
    return u?.displayName || "Inconnu";
  };

  const getProjectName = (projectId: string) => {
    const p = projects.find((p) => p.id === projectId);
    return p?.name || "Projet supprimé";
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setFilter("mine")}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filter === "mine" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Mes tâches
              {myPendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {myPendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter("assigned")}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filter === "assigned" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Assignées
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${filter === "all" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              Toutes
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={showDone} onCheckedChange={(c) => setShowDone(!!c)} className="h-3.5 w-3.5" />
            Terminées
          </label>
        </div>
        <Button size="sm" onClick={openForm}>
          <Plus className="h-4 w-4 mr-1" /> Nouvelle tâche
        </Button>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="p-6 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500 opacity-50" />
          <p className="text-sm text-muted-foreground">
            {filter === "mine" ? "Aucune tâche en cours — bien joué !" : "Aucune tâche trouvée"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const prioConf = PRIORITY_CONFIG[task.priority];
            const statusConf = STATUS_CONFIG[task.status];
            const PrioIcon = prioConf.icon;
            const StatusIcon = statusConf.icon;
            const isAssignedToMe = task.assigneeId === user?.id;
            const isCreatedByMe = task.createdById === user?.id;
            const isOverdue = task.dueDate && task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10);

            return (
              <Card
                key={task.id}
                className={`p-3 flex items-start gap-3 transition-all ${task.status === "done" ? "opacity-60" : ""} ${isOverdue ? "border-red-300 dark:border-red-800" : ""}`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => quickComplete(task)}
                  className={`mt-0.5 shrink-0 ${statusConf.color} hover:text-emerald-500 transition-colors`}
                >
                  <StatusIcon className="h-5 w-5" />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </span>
                    <PrioIcon className={`h-3.5 w-3.5 ${prioConf.color} shrink-0`} />
                    {isOverdue && (
                      <Badge variant="destructive" className="text-[9px] h-4 gap-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" /> En retard
                      </Badge>
                    )}
                  </div>

                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {/* Assignee */}
                    {!isAssignedToMe && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3" />
                        {getUserName(task.assigneeId)}
                      </span>
                    )}
                    {isAssignedToMe && !isCreatedByMe && (
                      <span className="text-[11px] text-primary font-medium">
                        Assignée par {getUserName(task.createdById)}
                      </span>
                    )}

                    {/* Projects */}
                    {task.projectIds.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <FolderOpen className="h-3 w-3" />
                        {task.projectIds.map((pid) => getProjectName(pid)).join(", ")}
                      </span>
                    )}

                    {/* Due date */}
                    {task.dueDate && (
                      <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                        <CalendarDays className="h-3 w-3" />
                        {new Date(task.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Select
                    value={task.status}
                    onValueChange={(v) => updateMutation.mutate({ id: task.id, data: { status: v } })}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">À faire</SelectItem>
                      <SelectItem value="in_progress">En cours</SelectItem>
                      <SelectItem value="done">Terminé</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Supprimer cette tâche ?")) deleteMutation.mutate(task.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create task dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle tâche</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Titre</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ex: Relire le contrat Impulse"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-desc">Description (optionnelle)</Label>
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <ArrowUp className="h-3.5 w-3.5 text-red-500" /> Haute
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <Minus className="h-3.5 w-3.5 text-orange-500" /> Moyenne
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <ArrowDown className="h-3.5 w-3.5 text-blue-500" /> Basse
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigner à</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(users as SafeUser[])?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.displayName} {u.id === user?.id ? "(moi)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Date d'échéance (optionnelle)</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Projets liés</Label>
              <div className="max-h-[140px] overflow-y-auto border rounded-md p-2 space-y-1">
                {projects.filter((p) => p.phase !== "ABANDON").map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={selectedProjects.includes(p.id)}
                      onCheckedChange={() => toggleProjectSelection(p.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Créer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Badge component to show in header
export function TaskBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
      {count}
    </span>
  );
}
