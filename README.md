# StoryLab Roadmap — France Télévisions

Dashboard de suivi de projets immersifs (VR/XR) pour le StoryLab de France Télévisions. Application fullstack permettant de gérer le cycle de vie complet des projets, de l'étude à l'exploitation, avec analyse IA des retours utilisateurs.

![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-cyan) ![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Table des matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
  - [Dashboard principal](#1-dashboard-principal)
  - [Fiche projet détaillée](#2-fiche-projet-détaillée)
  - [Vue Timeline / Gantt](#3-vue-timeline--gantt)
  - [Dashboard Exploitation](#4-dashboard-exploitation--retours-utilisateurs)
  - [Analyse IA des commentaires](#5-analyse-ia-des-commentaires)
  - [Récupération automatique des avis Meta Store](#6-récupération-automatique-des-avis-meta-store)
  - [Système de backup](#7-système-de-backup)
  - [Export des analyses IA](#8-export-des-analyses-ia)
- [Stack technique](#stack-technique)
- [Installation](#installation)
- [Développement](#développement)
- [Déploiement production](#déploiement-production)
- [Structure du projet](#structure-du-projet)
- [API REST](#api-rest)
- [Modèle de données](#modèle-de-données)
- [Configuration](#configuration)
- [Variables d'environnement](#variables-denvironnement)

---

## Aperçu

StoryLab Roadmap est un outil interne conçu pour le suivi et la gestion du portefeuille de projets immersifs VR/XR de France Télévisions. L'interface est entièrement en **français** et utilise un **thème clair** par défaut.

L'application couvre le cycle de vie complet d'un projet :

```
Étude → Développement → Production → Exploitation → (Abandon)
```

---

## Fonctionnalités

### 1. Dashboard principal

- **5 cartes KPI** affichant le nombre de projets par phase (Étude, Développement, Production, Exploitation, Abandonné) avec codes couleurs distincts
- **Barre de recherche** pour filtrer les projets par nom
- **Filtres par phase** (onglets : Tous, Étude, Dev, Prod, Exploit, Abandon)
- **3 vues** disponibles :
  - **Grille** : cartes de projets avec badge de phase, résumé, progression, producteur, épisodes et langues
  - **Timeline** : vue chronologique linéaire
  - **Gantt** : vue compacte avec barres temporelles globales par projet
- **Création de projet** via le bouton "+ Nouveau projet"
- **Logo France TV** affiché dans le header de l'application
- **Thème clair/sombre** avec toggle (clair par défaut)

### 2. Fiche projet détaillée

Accessible en cliquant sur une carte projet. Affiche :

- **Informations générales** :
  - Phase (badge coloré) et détail de phase
  - Résumé / synopsis
  - Producteur
  - Plateformes de diffusion
  - Formats (VR Standalone, PCVR, Dôme, etc.)
  - Langues
  - Contrat
  - Nom du référent projet
  - E-mail du référent (lien mailto cliquable)

- **Prochaine étape** : mise en évidence du prochain jalon à venir avec date

- **Timeline des jalons** : affichage chronologique avec distinction passé/futur et mise en avant du prochain événement

- **Historique du projet** (chronologique, le plus récent en haut) :
  - Ajout de notes textuelles avec horodatage
  - Ajout de fichiers (PDF, images, Word, Excel, etc.) encodés en base64
  - Suppression d'entrées individuelles

- **Barre de progression** (avancement global en %)

- **Modification** : formulaire complet d'édition avec tous les champs
- **Suppression** du projet

### 3. Vue Timeline / Gantt

- **Vue Gantt compacte** : affiche uniquement les titres de projets avec des barres représentant la période active (du premier au dernier jalon)
- **Grille mensuelle** couvrant janvier 2025 à juin 2026
- **Indicateur "Aujourd'hui"** (ligne verticale rouge)
- **Jalons visibles** sur la barre temporelle
- Respecte les filtres actifs (phase + recherche)

### 4. Dashboard Exploitation — Retours utilisateurs

Visible lorsque le filtre "Exploit" est actif. Layout split (50/50) :

**Panneau gauche** — Liste des projets en exploitation :
- Nom du projet + lien Meta Store
- **Note moyenne sur 5** (étoiles visuelles + valeur numérique)
- **Nombre d'évaluations** (star ratings)
- **Nombre d'avis** (commentaires écrits)
- **Téléchargements** (saisie manuelle)
- **Revenus** en euros (saisie manuelle)
- Date de dernière mise à jour des stats manuelles
- Bouton **"Récupérer avis"** + date de dernière récupération
- Bouton **"Importer CSV"** pour import d'avis au format CSV
- Bouton **"Analyser IA"** pour lancer l'analyse des commentaires

**Panneau droit** — Détail du projet sélectionné :
- En-tête avec métriques identiques au panneau gauche (cohérence garantie)
- Résultat de l'analyse IA (texte structuré)
- Bouton "Actualiser" pour relancer l'analyse
- Bouton **"Exporter"** pour télécharger l'analyse en fichier texte
- Liste chronologique de tous les commentaires avec note et date

### 5. Analyse IA des commentaires

- Utilise l'API **Anthropic Claude** (modèle Haiku) pour analyser les avis utilisateurs
- Génère un rapport structuré en français :
  1. **Sentiment général** : tendance positive/négative/mitigée
  2. **Points appréciés** : éléments positifs récurrents
  3. **Problèmes identifiés** : critiques et suggestions d'amélioration
  4. **Recommandation prioritaire** : action suggérée
- **Fallback statistique** si l'API IA n'est pas disponible (note moyenne, % positifs/négatifs)
- L'analyse est spécifiquement contextualisée pour les expériences immersives VR/XR

### 6. Récupération automatique des avis Meta Store

- **Scraping Playwright** des pages Meta Quest Store
- Récupère automatiquement :
  - Note globale du store
  - Nombre total d'évaluations (star ratings)
  - Nombre de commentaires écrits
  - **Tous les avis** (pas seulement les premiers visibles)
- Clique automatiquement sur "Show more reviews" jusqu'à 50 fois pour charger tous les avis
- Développe les avis tronqués ("See more")
- **Préserve les dates originales** des avis (pas la date de récupération)
- Remplace les avis existants à chaque récupération pour éviter les doublons

### 7. Système de backup

- **Bouton "Backup"** dans le header principal
- Télécharge un fichier JSON contenant l'intégralité des données :
  - Tous les projets avec leurs métadonnées
  - Toutes les entrées d'historique (notes + fichiers)
  - Tous les avis utilisateurs
- Date du dernier backup affichée sous le bouton
- Format : `storylab-backup-YYYY-MM-DD.json`

### 8. Export des analyses IA

Deux niveaux d'export disponibles :

- **Export individuel** : bouton "Exporter" dans le panneau droit, génère un fichier texte contenant :
  - Métriques du projet (note, évaluations, avis, téléchargements, revenus)
  - Analyse IA complète
  - Liste de tous les commentaires avec notes et dates
  - Format : `analyse-ia-[nom-projet]-YYYY-MM-DD.txt`

- **Export global** : bouton "Export Analyses IA (n)" dans le header de la section exploitation
  - Exporte toutes les analyses disponibles en un seul fichier
  - Un projet par section avec séparateurs visuels
  - N'apparaît qu'après avoir lancé au moins une analyse
  - Format : `analyses-ia-storylab-YYYY-MM-DD.txt`

### Autres fonctionnalités

- **Saisie manuelle des métriques** : champs inline éditables pour téléchargements et revenus par projet d'exploitation, avec date de dernière mise à jour
- **Import CSV d'avis** : format `rating,comment` (séparateur virgule ou point-virgule, header optionnel)
- **Persistance des données** : toutes les données (projets, historique, avis) sont stockées dans un fichier JSON qui survit aux redémarrages du serveur
- **Dark mode** : toggle dans le header (thème clair par défaut)
- **Interface responsive** avec composants shadcn/ui
- **Données initiales** : 21 projets pré-configurés avec des données seed au premier lancement

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Frontend** | React 18, TypeScript, Vite 7, Tailwind CSS 3, shadcn/ui |
| **Backend** | Express 5, TypeScript, Node.js 20+ |
| **IA** | Anthropic Claude API (Haiku) |
| **Scraping** | Playwright (Chromium headless) |
| **Routing** | wouter (hash-based pour compatibilité iframe) |
| **State** | TanStack Query v5 |
| **Validation** | Zod |
| **Persistance** | Fichier JSON (`data/storage.json`) |
| **Build** | esbuild (serveur), Vite (client) |

---

## Installation

### Prérequis

- **Node.js** 20 ou supérieur
- **npm** 9 ou supérieur

### Étapes

```bash
# Cloner le repository
git clone https://github.com/<votre-repo>/storylab-roadmap.git
cd storylab-roadmap

# Installer les dépendances
npm install

# Installer Playwright (pour le scraping Meta Store)
npx playwright install chromium
```

---

## Développement

```bash
# Lancer le serveur de développement (hot-reload)
npm run dev
```

L'application est accessible sur **http://localhost:5000**.

Le serveur Express et le serveur Vite HMR tournent sur le même port. Les modifications du frontend sont rechargées instantanément.

---

## Déploiement production

```bash
# Build du projet (frontend + backend)
npm run build

# Lancer en production
npm start
# ou
NODE_ENV=production node dist/index.cjs
```

Le build génère :
- `dist/public/` — fichiers statiques du frontend (HTML, CSS, JS)
- `dist/index.cjs` — bundle serveur Express

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `5000` |
| `NODE_ENV` | Environnement (`development` / `production`) | `development` |
| `ANTHROPIC_API_KEY` | Clé API Anthropic pour l'analyse IA | — |

> **Note** : L'analyse IA nécessite une clé API Anthropic valide. Sans clé, un fallback statistique est utilisé automatiquement.

---

## Structure du projet

```
storylab-roadmap/
├── client/                       # Frontend React
│   ├── src/
│   │   ├── pages/
│   │   │   └── dashboard.tsx     # Page principale (tout le dashboard)
│   │   ├── components/
│   │   │   └── ui/               # Composants shadcn/ui
│   │   ├── hooks/                # Hooks personnalisés
│   │   ├── lib/
│   │   │   ├── queryClient.ts    # Configuration TanStack Query
│   │   │   └── utils.ts          # Utilitaires (cn, etc.)
│   │   ├── App.tsx               # Routeur principal
│   │   ├── index.css             # Styles Tailwind + thème
│   │   └── main.tsx              # Point d'entrée React
│   └── index.html                # Template HTML
├── server/                       # Backend Express
│   ├── index.ts                  # Point d'entrée serveur
│   ├── routes.ts                 # Routes API REST
│   ├── storage.ts                # Couche de persistance (FileStorage)
│   ├── meta-scraper.ts           # Scraper Playwright pour Meta Store
│   ├── static.ts                 # Serveur de fichiers statiques
│   └── vite.ts                   # Configuration Vite dev middleware
├── shared/
│   └── schema.ts                 # Schémas Zod (partagés client/serveur)
├── data/
│   └── storage.json              # Données persistantes (généré au runtime)
├── attached_assets/
│   └── francetv-logo.png         # Logo France Télévisions
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## API REST

### Projets

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/projects` | Liste tous les projets |
| `GET` | `/api/projects/:id` | Détail d'un projet |
| `POST` | `/api/projects` | Créer un projet |
| `PATCH` | `/api/projects/:id` | Modifier un projet |
| `DELETE` | `/api/projects/:id` | Supprimer un projet |
| `PATCH` | `/api/projects/:id/stats` | Mettre à jour téléchargements/revenus |

### Historique

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/projects/:id/history` | Historique d'un projet (notes + fichiers) |
| `POST` | `/api/projects/:id/history` | Ajouter une entrée d'historique |
| `DELETE` | `/api/history/:entryId` | Supprimer une entrée |

### Avis utilisateurs

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/reviews` | Tous les avis (tous projets) |
| `GET` | `/api/projects/:id/reviews` | Avis d'un projet |
| `POST` | `/api/projects/:id/reviews` | Ajouter un avis |
| `POST` | `/api/projects/:id/reviews/csv` | Import CSV d'avis |
| `DELETE` | `/api/reviews/:reviewId` | Supprimer un avis |

### Analyse & Scraping

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/projects/:id/reviews/analyze` | Analyse IA des avis |
| `POST` | `/api/projects/:id/scrape-reviews` | Récupérer avis depuis Meta Store |

### Backup

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/backup` | Télécharger un backup JSON complet |

---

## Modèle de données

### Project

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Identifiant unique |
| `name` | string | Nom du projet |
| `phase` | enum | ETUDE, DEV, PROD, EXPLOITATION, ABANDON |
| `phaseDetail` | string? | Détail libre sur l'état de la phase |
| `summary` | string | Résumé / synopsis |
| `formats` | string[] | Formats (VR Standalone, PCVR, Dôme, etc.) |
| `producer` | string | Nom du producteur |
| `platforms` | string | Plateformes de diffusion |
| `languages` | string[] | Langues disponibles |
| `contract` | string | Statut du contrat |
| `endOfRights` | string | Date de fin de droits |
| `timeline` | TimelineEvent[] | Jalons du projet |
| `progress` | number (0-100) | Avancement global |
| `metaStoreUrl` | string? | URL de la page Meta Quest Store |
| `storeRating` | number? | Note moyenne du store (0-5) |
| `storeRatingCount` | number? | Nombre d'évaluations (étoiles) |
| `storeReviewCount` | number? | Nombre d'avis écrits |
| `lastScrapedAt` | string? | Date de dernière récupération Meta Store |
| `downloadCount` | number? | Nombre de téléchargements (saisie manuelle) |
| `revenue` | number? | Revenus en euros (saisie manuelle) |
| `statsUpdatedAt` | string? | Date de dernière mise à jour manuelle |
| `referentName` | string? | Nom du référent projet |
| `referentEmail` | string? | E-mail du référent projet |

### HistoryEntry

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Identifiant unique |
| `projectId` | string | Projet associé |
| `type` | enum | "note" ou "file" |
| `content` | string | Texte de la note ou description du fichier |
| `fileName` | string? | Nom du fichier (pour type "file") |
| `fileData` | string? | Contenu base64 du fichier |
| `fileMimeType` | string? | Type MIME du fichier |
| `createdAt` | string (ISO) | Date de création |

### UserReview

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Identifiant unique |
| `projectId` | string | Projet associé |
| `rating` | number (1-5) | Note |
| `comment` | string | Commentaire |
| `createdAt` | string (ISO) | Date de l'avis |

---

## Configuration

### Personnalisation du thème

Les couleurs sont définies dans `client/src/index.css` via des variables CSS HSL. Le thème par défaut est clair avec des accents teal/emerald.

### Données initiales (seed)

Au premier lancement (quand `data/storage.json` n'existe pas), l'application crée automatiquement 21 projets avec des données réalistes et des avis seed pour les projets en exploitation. Ces données sont définies dans `server/storage.ts` dans la méthode `seedData()`.

### Playwright (scraping)

Le scraping Meta Store nécessite Chromium. Installer avec :

```bash
npx playwright install chromium
```

Sur un serveur sans display, Playwright tourne en mode headless par défaut.

---

## Licence

MIT
