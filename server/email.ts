interface InviteParams {
  to: string;
  username: string;
  password: string;
  displayName: string;
  role: string;
  appUrl: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur (accès complet)",
  editor: "Éditeur (lecture et écriture)",
  viewer: "Lecteur (lecture seule)",
};

export async function sendInvitationEmail(params: InviteParams): Promise<void> {
  const { to, username, password, displayName, role, appUrl } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY doit être configuré pour envoyer des emails");
  }

  const roleLabel = ROLE_LABELS[role] || role;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #1e293b; padding: 24px 32px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 18px; font-weight: 600;">Storylab Roadmap</h1>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 13px;">France TV — Gestion de projets</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Bonjour <strong>${displayName}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #475569; line-height: 1.6;">
        Vous avez été invité(e) à rejoindre <strong>Storylab Roadmap</strong>. Voici vos identifiants de connexion :
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
        <table style="width: 100%; font-size: 14px; color: #334155;">
          <tr>
            <td style="padding: 4px 0; color: #64748b; width: 100px;">Identifiant</td>
            <td style="padding: 4px 0; font-weight: 600;">${username}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Mot de passe</td>
            <td style="padding: 4px 0; font-weight: 600;">${password}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Rôle</td>
            <td style="padding: 4px 0;">${roleLabel}</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="${appUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Se connecter
        </a>
      </div>
      <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
        Nous vous recommandons de changer votre mot de passe après votre première connexion.
      </p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Storylab Roadmap <noreply@disruptivedynamics.fr>",
      to: [to],
      subject: "Invitation — Storylab Roadmap (France TV)",
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Erreur API Resend (${res.status})`);
  }

  console.log(`[email] Invitation sent to ${to} for user ${username}`);
}


// ── Task assignment email ──

interface TaskEmailParams {
  to: string;
  assigneeName: string;
  creatorName: string;
  taskTitle: string;
  taskDescription?: string;
  projectNames: string[];
  dueDate?: string;
  priority: string;
  appUrl: string;
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "Haute", color: "#ef4444" },
  medium: { label: "Moyenne", color: "#f59e0b" },
  low: { label: "Basse", color: "#22c55e" },
};

export async function sendTaskAssignmentEmail(params: TaskEmailParams): Promise<void> {
  const { to, assigneeName, creatorName, taskTitle, taskDescription, projectNames, dueDate, priority, appUrl } = params;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY doit être configuré pour envoyer des emails");
  }

  const prioConf = PRIORITY_LABELS[priority] || PRIORITY_LABELS.medium;
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const projectsHtml = projectNames.length > 0
    ? projectNames.map(n => `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:2px 10px;border-radius:12px;font-size:12px;margin:2px 4px 2px 0;">${n}</span>`).join("")
    : '<span style="color:#94a3b8;font-size:13px;">Aucun projet lié</span>';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: #1e293b; padding: 24px 32px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 18px; font-weight: 600;">Storylab Roadmap</h1>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 13px;">Nouvelle tâche assignée</p>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">Bonjour <strong>${assigneeName}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #475569; line-height: 1.6;">
        <strong>${creatorName}</strong> vous a assigné une nouvelle tâche :
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
        <h2 style="margin: 0 0 12px; font-size: 16px; color: #1e293b;">${taskTitle}</h2>
        ${taskDescription ? `<p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">${taskDescription}</p>` : ""}
        <table style="width: 100%; font-size: 13px; color: #334155;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 100px;">Priorité</td>
            <td style="padding: 6px 0;">
              <span style="display:inline-block;background:${prioConf.color}15;color:${prioConf.color};padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${prioConf.label}</span>
            </td>
          </tr>
          ${dueDateStr ? `<tr>
            <td style="padding: 6px 0; color: #64748b;">Échéance</td>
            <td style="padding: 6px 0; font-weight: 500;">${dueDateStr}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 6px 0; color: #64748b; vertical-align: top;">Projet(s)</td>
            <td style="padding: 6px 0;">${projectsHtml}</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="${appUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          Voir mes tâches
        </a>
      </div>
      <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
        Cet email a été envoyé automatiquement depuis Storylab Roadmap.
      </p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Storylab Roadmap <noreply@disruptivedynamics.fr>",
      to: [to],
      subject: `Nouvelle tâche : ${taskTitle}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Erreur API Resend (${res.status})`);
  }

  console.log(`[email] Task assignment sent to ${to} \u2014 "\u0024{taskTitle}"`);
}
