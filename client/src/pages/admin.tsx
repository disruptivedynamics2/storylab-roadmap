import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { SafeUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  Shield,
  Pencil,
  Eye,
  Loader2,
  Users,
  LogOut,
  Mail,
  Send,
  Check,
} from "lucide-react";
import franceTvLogo from "@assets/francetv-logo.png";

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Shield; variant: "default" | "secondary" | "outline" }> = {
  admin: { label: "Administrateur", icon: Shield, variant: "default" },
  editor: { label: "Éditeur", icon: Pencil, variant: "secondary" },
  viewer: { label: "Lecteur", icon: Eye, variant: "outline" },
};

export default function AdminPage() {
  const { user: currentUser, logout } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUser, setInviteUser] = useState<SafeUser | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");

  // Form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");

  // "Create + invite" mode
  const [sendInviteAfterCreate, setSendInviteAfterCreate] = useState(false);
  const [createInviteEmail, setCreateInviteEmail] = useState("");

  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; displayName: string; email?: string; role: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json() as Promise<SafeUser>;
    },
    onSuccess: async (newUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (sendInviteAfterCreate && createInviteEmail) {
        // Auto-send invitation
        try {
          await apiRequest("POST", `/api/admin/users/${newUser.id}/invite`, {
            email: createInviteEmail,
            password,
          });
          toast({ title: "Utilisateur créé et invitation envoyée", description: `Email envoyé à ${createInviteEmail}` });
        } catch (err: any) {
          toast({ title: "Utilisateur créé", description: `Mais l'email n'a pas pu être envoyé : ${err.message}`, variant: "destructive" });
        }
      } else {
        toast({ title: "Utilisateur créé" });
      }
      closeForm();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur modifié" });
      closeForm();
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur supprimé" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ userId, email, pw }: { userId: string; email: string; pw: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/invite`, { email, password: pw });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Invitation envoyée", description: data.message });
      setShowInvite(false);
      setInviteUser(null);
    },
    onError: (err: any) => {
      toast({ title: "Erreur d'envoi", description: err.message, variant: "destructive" });
    },
  });

  const openCreateForm = () => {
    setEditUser(null);
    setUsername("");
    setPassword("");
    setDisplayName("");
    setEmail("");
    setRole("viewer");
    setSendInviteAfterCreate(false);
    setCreateInviteEmail("");
    setShowForm(true);
  };

  const openEditForm = (u: SafeUser) => {
    setEditUser(u);
    setUsername(u.username);
    setPassword("");
    setDisplayName(u.displayName);
    setEmail((u).email || "");
    setRole(u.role);
    setSendInviteAfterCreate(false);
    setCreateInviteEmail("");
    setShowForm(true);
  };

  const openInviteDialog = (u: SafeUser) => {
    setInviteUser(u);
    setInviteEmail("");
    setInvitePassword("");
    setShowInvite(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditUser(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editUser) {
      const data: Record<string, any> = { displayName, role, email: email || "" };
      if (password) data.password = password;
      updateMutation.mutate({ id: editUser.id, data });
    } else {
      const data: any = { username, password, displayName, role };
      if (email) data.email = email;
      createMutation.mutate(data);
    }
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUser) return;
    inviteMutation.mutate({ userId: inviteUser.id, email: inviteEmail, pw: invitePassword });
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={franceTvLogo} alt="France TV" className="h-6 w-auto" />
            <div className="w-px h-5 bg-border" />
            <a href="#/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {currentUser?.displayName}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Gestion des utilisateurs</h1>
          </div>
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="h-4 w-4 mr-1" /> Nouvel utilisateur
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((u) => {
              const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.viewer;
              const RoleIcon = roleConf.icon;
              const isCurrentUser = u.id === currentUser?.id;
              return (
                <Card key={u.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <RoleIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{u.displayName}</span>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-[10px] h-4">vous</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>@{u.username}</span>
                        {(u).email && (
                          <>
                            <span className="text-border">|</span>
                            <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" />{(u).email}</span>
                          </>
                        )}
                        <span className="text-border">|</span>
                        <Badge variant={roleConf.variant} className="text-[10px] h-4">
                          {roleConf.label}
                        </Badge>
                        {u.lastLoginAt && (
                          <>
                            <span className="text-border">|</span>
                            <span>Dernière connexion : {new Date(u.lastLoginAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Envoyer une invitation par email"
                      onClick={() => openInviteDialog(u)}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(u)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    {!isCurrentUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Supprimer l'utilisateur "${u.displayName}" ?`)) {
                            deleteMutation.mutate(u.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Create/Edit user dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editUser ? `Modifier — ${editUser.displayName}` : "Nouvel utilisateur"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-username">Identifiant</Label>
              <Input
                id="form-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!!editUser}
                required
                minLength={3}
                placeholder="ex: jdupont"
              />
              {editUser && (
                <p className="text-xs text-muted-foreground">L'identifiant ne peut pas être modifié.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-displayName">Nom affiché</Label>
              <Input
                id="form-displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="ex: Jean Dupont"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-email">Email <span className="text-muted-foreground font-normal">(pour les notifications de tâches)</span></Label>
              <Input
                id="form-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@francetv.fr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-password">
                Mot de passe {editUser && <span className="text-muted-foreground font-normal">(laisser vide pour ne pas changer)</span>}
              </Label>
              <Input
                id="form-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!editUser}
                minLength={8}
                placeholder={editUser ? "••••••" : "Min. 8 car., 1 maj., 1 min., 1 chiffre"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-role">Rôle</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" /> Administrateur — accès complet
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-2">
                      <Pencil className="h-3.5 w-3.5" /> Éditeur — lecture et écriture
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5" /> Lecteur — lecture seule
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Option to send invite on create */}
            {!editUser && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="send-invite"
                    checked={sendInviteAfterCreate}
                    onChange={(e) => setSendInviteAfterCreate(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="send-invite" className="text-sm font-normal cursor-pointer flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Envoyer une invitation par email
                  </Label>
                </div>
                {sendInviteAfterCreate && (
                  <div className="space-y-2 pl-6">
                    <Label htmlFor="invite-email-create">Adresse email</Label>
                    <Input
                      id="invite-email-create"
                      type="email"
                      value={createInviteEmail}
                      onChange={(e) => setCreateInviteEmail(e.target.value)}
                      required={sendInviteAfterCreate}
                      placeholder="prenom.nom@francetv.fr"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editUser ? "Enregistrer" : sendInviteAfterCreate ? "Créer et inviter" : "Créer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite email dialog (for existing users) */}
      <Dialog open={showInvite} onOpenChange={(open) => { if (!open) { setShowInvite(false); setInviteUser(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Inviter {inviteUser?.displayName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              L'email contiendra les identifiants de connexion et un lien vers l'application.
            </p>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Adresse email du destinataire</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="prenom.nom@francetv.fr"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-pw">Mot de passe à inclure dans l'email</Label>
              <Input
                id="invite-pw"
                type="text"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                required
                minLength={4}
                placeholder="Le mot de passe de cet utilisateur"
              />
              <p className="text-xs text-muted-foreground">
                Ce mot de passe sera envoyé en clair dans l'email. L'utilisateur pourra le changer ensuite.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowInvite(false); setInviteUser(null); }}>
                Annuler
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Envoyer l'invitation
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
