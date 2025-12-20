## Gestion du Contexte, le Maillon Faible au Cœur du Développement Assisté par l'IA
# Puffin & Le Pattern SAM

---

# PLAN

## Le Pattern SAM

### Qu'est-ce que SAM ?
### SAM vs Autres Patterns
### SAM en Pratique

## Puffin

### Le Problème - Gestion du Contexte dans le Développement IA
### Claude Code CLI - Gestion des Sessions
### Le Problème - L'Historique Éphémère
### Qu'est-ce que Puffin ?
### Vue d'Ensemble de l'Architecture
### Conversations par Branches
### Sélection du Modèle
### Contexte Dynamique (CLAUDE.md)
### Le Défi du Design UI & GUI Designer
### User Stories & Workflow du Backlog
### Vérification des Critères d'Acceptation
### Implémentation SAM dans Puffin
### Démo
### Leçons Apprises & Futur

---

# CONTENU DES SLIDES

---

## PARTIE 1 : LE PATTERN SAM

---

### Slide 1 : Qu'est-ce que SAM ?

**State-Action-Model : Un Pattern Fonctionnel Réactif**

```
Intention Utilisateur → Action → Model → State → Vue → Intention Utilisateur...
                          ↑                  │
                          └── États de Contrôle ┘
```

**Trois Composants Principaux :**

| Composant | Responsabilité |
|-----------|----------------|
| **Action** | Traduit l'intention utilisateur en proposition |
| **Model** | Valide et applique les propositions via des accepteurs |
| **State** | Calcule l'état dérivé et les états de contrôle |

**Principes Clés :**
- **Arbre d'État Unique** - Une seule source de vérité
- **Flux de Données Unidirectionnel** - Mutations prévisibles
- **Accepteurs** - Le Model décide ce qui est appliqué
- **États de Contrôle** - L'état détermine les actions permises
- **Variables Prime** - x' désigne la valeur de x dans l'état suivant ; les actions définissent les transitions (x' = x + 1)
- **Logique Temporelle** - Raisonner sur l'état dans le temps : invariants (toujours vrai), vivacité (finit par arriver)

**Créateur :** Jean-Jacques Dubray (2015)
**Site Web :** https://sam.js.org
**Article  :** [Three Approximations You Should Never Use When Coding](https://dzone.com/articles/the-three-approximations-you-should-never-use-when)

---

### Slide 2 : SAM vs Autres Patterns

| Aspect | MVC | Redux | SAM |
|--------|-----|-------|-----|
| **Flux de Données** | Bidirectionnel | Unidirectionnel | Unidirectionnel + Contrôle |
| **Mutation** | Directe | Reducers | Accepteurs |
| **Effets de Bord** | Contrôleur | Middleware | Actions |
| **Dérivation d'État** | Vue | Sélecteurs | Fonction State |
| **Flux de Contrôle** | Implicite | Implicite | **Explicite (FSM)** |

**Ce qui Rend SAM Différent :**

1. **États de Contrôle Explicites**
   - Pas seulement "quelles sont les données ?" mais "que peut-il se passer ensuite ?"
   - Les FSM rendent les transitions d'état valides explicites

2. **Pattern Accepteur**
   - Le Model peut accepter, accepter partiellement ou rejeter des propositions
   - Validation à la frontière, pas dispersée

3. **Logique Temporelle**
   - Influence TLA+ : les transitions d'état sont de première classe
   - Chaque action a des préconditions et postconditions

**Quand Utiliser SAM :**
- Workflows complexes avec états clairs (en attente, en cours, terminé)
- Applications où "que peut faire l'utilisateur maintenant ?" compte
- Systèmes nécessitant des pistes d'audit ou du débogage time-travel

---

### Slide 3 : SAM en Pratique

**L'Étape SAM (un cycle) :**

```javascript
// 1. ACTION : L'utilisateur clique "Soumettre"
const proposal = actions.submitPrompt({ content: "Construis un formulaire de connexion" })

// 2. MODEL : L'accepteur valide et applique
const submitPromptAcceptor = model => proposal => {
  if (proposal.type !== 'SUBMIT_PROMPT') return
  if (!proposal.content?.trim()) return  // Rejette si vide

  model.pendingPromptId = generateId()
  model.prompts.push({
    id: model.pendingPromptId,
    content: proposal.content,
    status: 'pending'
  })
}

// 3. STATE : Dérive les états de contrôle
const state = model => ({
  ...model,
  // États de contrôle
  canSubmit: !model.pendingPromptId,
  canCancel: !!model.pendingPromptId,
  isProcessing: !!model.pendingPromptId
})

// 4. VUE : Rendu basé sur l'état
render(state) // Bouton désactivé si !canSubmit
```

**Bénéfices Réalisés :**
- **Débogage** : Savoir exactement quelle action a causé quel changement
- **Tests** : Tester les actions et les accepteurs isolément
- **Raisonnement** : Les états de contrôle rendent la logique UI explicite

---

## PARTIE 2 : PUFFIN

---

### Slide 4 : Le Problème - Gestion du Contexte dans le Développement IA

**Le Défi avec les Assistants de Code IA :**

Quand les conversations s'allongent et les projets deviennent complexes :
- L'IA perd le focus
- Une requête UI déclenche des suggestions backend
- Des requêtes simples dérivent vers des changements architecturaux
- Le contexte de travaux non liés pollue les nouvelles tâches

**Cause Racine : Pollution du Contexte**

```
Une conversation = Tout visible = L'IA adresse tout
```

**Exemple Réel :**
> "Ajoute un bouton dans le header"
>
> Réponse IA : "Je vais ajouter le bouton, mais d'abord laisse-moi
> refactoriser ton système d'authentification et mettre à jour le schéma de base de données..."

**L'Insight :**
- Claude Code CLI est extraordinairement capable
- Mais gérer le contexte sur des projets de 10k-100k lignes de code est difficile
- Besoin : Contexte focalisé, historique organisé, progression traçable

---

### Slide 5 : Claude Code CLI - Gestion des Sessions

**Comment Fonctionnent les Sessions :**

Claude Code stocke les conversations localement et attribue à chacune un ID de session unique.

```bash
# Reprendre avec sélecteur interactif
claude --resume

# Reprendre la conversation la plus récente
claude --continue

# Reprendre une session spécifique
claude --resume abc123 "Continuer ma tâche"

# Utiliser un ID de session spécifique (doit être UUID)
claude --session-id "550e8400-e29b-41d4-a716-446655440000"

# Forker une session (brancher la conversation)
claude --resume abc123 --fork-session
```

**Persistance des Sessions :**

| Aspect | Comportement |
|--------|--------------|
| **Stockage** | Local sur votre machine |
| **Durée de vie** | Persistant après fermeture du terminal |
| **Expiration** | Pas d'expiration documentée |
| **Sauvegarde auto** | Toutes les conversations sauvegardées automatiquement |

**Ce Qui Est Restauré à la Reprise :**

- Historique complet des messages
- Utilisation des outils et résultats
- Modèle et configuration
- Contexte du répertoire de travail

**Le Sélecteur Interactif (`--resume`) :**

```
┌─────────────────────────────────────────────────────────────┐
│  Sélectionner une conversation à reprendre :                │
│                                                             │
│  > "Build authentication system"  (il y a 2h, 15 msgs, main)│
│    "Fix login bug"                (il y a 1j, 8 msgs, dev)  │
│    "Add user dashboard"           (il y a 3j, 22 msgs, main)│
│                                                             │
│  ↑/↓ Naviguer  Enter Sélectionner  Esc Annuler              │
└─────────────────────────────────────────────────────────────┘
```

**Insight Clé :** Les sessions permettent des conversations multi-tours avec contexte complet - mais il faut les connaître et les utiliser.

---

### Slide 6 : Le Problème - L'Historique Éphémère

**Vous Pouvez Tout Perdre**

```
┌─────────────────────────────────────────────────────────────┐
│  Fenêtre Terminal                                           │
│  ─────────────────                                          │
│  $ claude                                                   │
│  > Construis-moi un système d'authentification utilisateur  │
│  [Claude construit 15 fichiers en 2 heures]                 │
│  > Ajoute le support OAuth                                  │
│  [Claude ajoute Google/GitHub OAuth]                        │
│  > Maintenant ajoute le rate limiting                       │
│  [Claude implémente le rate limiting]                       │
│                                                             │
│  [Vous fermez le terminal]                                  │
│                                                             │
│  💀 TOUT L'HISTORIQUE DE CONVERSATION EST PERDU 💀         │
└─────────────────────────────────────────────────────────────┘
```

**Quand Vous Perdez le Contexte :**

| Scénario | Ce Qui Est Perdu |
|----------|------------------|
| **Fermer le terminal** | Tout l'historique de conversation |
| **Fenêtre de contexte pleine** | Claude "oublie" les décisions initiales |
| **Nouvelle session** | Aucune mémoire de ce qui a été construit ou pourquoi |
| **Revenir demain** | Impossible de reprendre où vous en étiez |

**Le Coût Caché :**

- Vous pensiez pouvoir revenir à cette conversation — vous ne pouvez pas
- Vous pensiez que Claude se souvenait de vos décisions d'architecture — non
- Vous pensiez que l'ID de session permettrait de reprendre — il a peut-être disparu
- Vous avez construit quelque chose de complexe, mais le "pourquoi" est perdu à jamais

**Ce que Cela Signifie :**

> "Claude, pourquoi as-tu implémenté ça de cette façon ?"
>
> "Je n'ai aucun contexte sur les implémentations précédentes..."

**La Solution Puffin :**

- **Historique persistant** dans `.puffin/history.json`
- **Chaque prompt et réponse** sauvegardé avec horodatage
- **IDs de session suivis** par branche pour reprise
- **Survit à la fermeture du terminal**, redémarrage de l'app, reboot système
- **Arbre de conversation** recherchable, navigable

```
Fermer Puffin → Rouvrir demain → Tout est encore là
```

---

### Slide 6 : Qu'est-ce que Puffin ?

**Puffin : Une Couche de Gestion pour Claude Code CLI**

```
┌─────────────────────────────────────────────────┐
│                    PUFFIN                       │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Branches   │  │ Backlog  │  │   CLAUDE.md  │ │
│  │& Historique│  │& Stories │  │  Dynamique   │ │
│  └────────────┘  └──────────┘  └──────────────┘ │
└─────────────────────────────────────────────────┘
                       │
                       ▼ lance & gère
┌─────────────────────────────────────────────────┐
│              Claude Code CLI                    │
│   (Capacités agentiques complètes - LE BUILDER) │
└─────────────────────────────────────────────────┘
                       │
                       ▼ construit
┌─────────────────────────────────────────────────┐
│              Votre Projet                       │
└─────────────────────────────────────────────────┘
```

**Ce que Puffin Fait :**
- **Organise** les conversations en branches thématiques
- **Suit** les prompts, réponses et modifications de fichiers
- **Injecte** du contexte dynamiquement selon la branche active
- **Gère** les user stories de la spécification à la complétion

---

### Slide 7 : Vue d'Ensemble de l'Architecture

**Stack Technologique :**

| Couche | Technologie |
|--------|-------------|
| Plateforme | Electron |
| Frontend | JavaScript Vanilla (ES6+) |
| Gestion d'État | Pattern SAM |
| Intégration CLI | Node.js child_process |
| Stockage | Fichiers (.puffin/ directory) |

**Architecture des Processus :**

```
┌─────────────────────────────────────────────────┐
│           Processus Principal Electron          │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Handlers IPC │  │    Service Claude        │ │
│  │              │  │  (lance subprocess CLI)  │ │
│  └──────────────┘  └──────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ État Puffin  │  │  Générateur CLAUDE.md    │ │
│  │ (.puffin/)   │  │  (contexte dynamique)    │ │
│  └──────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────┘
              ↕ IPC (contextBridge)
┌─────────────────────────────────────────────────┐
│           Processus Renderer Electron           │
│ ┌───────────────┐  ┌──────────────────────────┐ │
│ │  Model SAM    │  │      Composants          │ │
│ │(44 accepteurs)│  │(Prompt, Historique, etc.)│ │
│ └───────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Stockage des Données (répertoire .puffin/) :**

```
votre-projet/
└── .puffin/
    ├── config.json       # Paramètres du projet
    ├── history.json      # Historique des conversations
    ├── user-stories.json # Backlog
    ├── architecture.md   # Documentation vivante
    └── ui-guidelines.json # Design system
```

---

### Slide 8 : Conversations par Branches

**L'Insight Principal : Séparation Cognitive**

Chaque branche a sa propre :
- Historique de conversation (session Claude)
- Injection de contexte (contenu CLAUDE.md)
- Zone de focus

**Branches par Défaut :**

| Branche | Focus | Contexte Injecté |
|---------|-------|------------------|
| **Specifications** | Exigences, user stories | Description projet, hypothèses |
| **Architecture** | Design système, APIs | Document d'architecture |
| **UI** | Composants, styling | Design tokens, patterns composants |
| **Backend** | APIs, base de données | Modèle de données, conventions API |
| **Deployment** | CI/CD, infrastructure | Architecture de déploiement |

**Comment les Sessions Fonctionnent :**

```
Branche Specifications (Session: abc-123)
├── Tour 1: "Définir les exigences d'authentification..."
├── Tour 2: "Et les fournisseurs OAuth ?"
└── Tour 3: "Voici les critères d'acceptation..."

Branche UI (Session: def-456)  ← Session différente !
├── Tour 1: "Créer un composant formulaire de connexion..."
└── Tour 2: "Styliser avec nos design tokens..."
```

**Changer de branche = Changer de session = Contexte frais et focalisé**

---

### Slide 9 : Sélection du Modèle

**Choisir le Bon Outil pour la Tâche**

Puffin permet de sélectionner quel modèle Claude utiliser :

| Modèle | Forces | Idéal Pour |
|--------|--------|------------|
| **Opus** | Le plus capable, meilleur raisonnement | Décisions architecturales complexes, gros refactorings, design nuancé |
| **Sonnet** | Performance & vitesse équilibrées | Développement quotidien, implémentation de fonctionnalités (défaut) |
| **Haiku** | Rapide et léger | Questions rapides, corrections simples, explications de code |

**Deux Niveaux de Configuration :**

1. **Défaut du Projet** (vue Config)
   - Persisté dans `.puffin/config.json`
   - Appliqué à tous les nouveaux threads

2. **Override par Thread** (zone de prompt)
   - Sélectionner un modèle différent avant de soumettre
   - Utile pour adapter selon la complexité de la tâche

**Quand Choisir Chaque Modèle :**

```
Revue d'architecture complexe ?      → Opus (réfléchir en profondeur, prendre son temps)
Implémenter une user story ?         → Sonnet (bon équilibre)
"Que fait cette fonction ?"          → Haiku (réponse rapide, coût bas)
```

**Compromis Coût-Performance :**

- Opus : Qualité maximale, coût le plus élevé, plus lent
- Sonnet : Bonne qualité, coût modéré, vitesse raisonnable
- Haiku : Qualité adéquate, coût le plus bas, le plus rapide

**Astuce :** Commencer avec Haiku pour l'exploration, escalader vers Sonnet/Opus si nécessaire.

---

### Slide 10 : Contexte Dynamique (CLAUDE.md)

**Le Mécanisme :**

Claude Code lit automatiquement `.claude/CLAUDE.md` pour le contexte projet.
Puffin génère ce fichier **dynamiquement selon la branche active**.

**Structure des Fichiers :**

```
votre-projet/
└── .claude/
    ├── CLAUDE.md              ← Actif (auto-généré)
    ├── CLAUDE_base.md         ← Contexte partagé
    ├── CLAUDE_specifications.md
    ├── CLAUDE_ui.md
    └── CLAUDE_backend.md
```

**Ce que Chaque Branche Voit :**

**Contexte de Base (toujours) :**
- Nom et description du projet
- Préférences de codage (style, tests, nommage)
- User stories actives

**La Branche UI ajoute :**
```markdown
## Focus Branche : UI/UX

### Tokens Couleur
| Token | Valeur | Usage |
|-------|--------|-------|
| --color-primary | #6c63ff | Marque principale |

### Patterns Composants
#### Bouton Principal
**HTML :** <button class="btn-primary">...</button>
**CSS :** .btn-primary { background: var(--color-primary); }
```

**Régénération Automatique :**

| Changement | Déclenche |
|------------|-----------|
| Config mise à jour | Base + branche active |
| User story ajoutée | Base + branche active |
| Architecture mise à jour | Architecture + Backend |
| Changement de branche | Swap CLAUDE.md actif |

---

### Slide 10 : Le Défi du Design UI & GUI Designer

**Le Problème : Décrire une UI avec des Mots**

Dire à une IA ce que vous voulez visuellement est *difficile* :

```
Vous: "Crée un formulaire de connexion avec le champ email au-dessus
      du mot de passe, une checkbox 'se souvenir de moi' alignée à
      gauche, et le bouton soumettre doit être pleine largeur avec
      des coins arrondis, couleur primaire, et le lien mot de passe
      oublié centré en dessous mais plus petit et en gris..."

Claude: [Construit quelque chose... mais pas tout à fait ce que vous imaginiez]

Vous: "Non, l'espacement est faux, et je voulais la checkbox
      en ligne avec le label, et le bouton a besoin de plus de padding..."

Claude: [Reconstruit... toujours pas ça]

[30 minutes plus tard, toujours en train d'itérer sur le layout]
```

**Pourquoi Cela Arrive :**

| Défi | Impact |
|------|--------|
| **Langage ambigu** | "Aligné à gauche" par rapport à quoi ? |
| **Détails manquants** | Vous avez oublié de mentionner l'espacement |
| **Décalage de modèle mental** | Votre image ≠ interprétation de Claude |
| **Coût d'itération** | Chaque aller-retour prend des minutes |

**L'Insight : Dessiner est Plus Rapide**

```
Dessiner ce que vous voulez :   30 secondes
Décrire ce que vous voulez :    5 minutes + itérations
```

**Le GUI Designer de Puffin :**

Un canvas visuel drag-and-drop pour les maquettes UI :

```
┌─────────────────────────────────────────────────┐
│  Palette Éléments         Canvas                │
│  ┌───────────┐     ┌─────────────────────────┐  │
│  │ Container │     │  ┌─────────────────┐    │  │
│  │ Texte     │     │  │   Login Form    │    │  │
│  │ Input     │     │  │ ┌─────────────┐ │    │  │
│  │ Bouton    │     │  │ │ Email       │ │    │  │
│  │ Image     │     │  │ └─────────────┘ │    │  │
│  │ Liste     │     │  │ ┌─────────────┐ │    │  │
│  │ Form      │     │  │ │ Mot de passe│ │    │  │
│  │ Card      │     │  │ └─────────────┘ │    │  │
│  │ Modal     │     │  │ [x] Se souvenir │    │  │
│  └───────────┘     │  │ ┌─────────────┐ │    │  │
│                    │  │ │  Connexion  │ │    │  │
│  Propriétés:       │  │ └─────────────┘ │    │  │
│  x: 100, y: 50     │  └─────────────────┘    │  │
│  largeur: 300      └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Comment Ça Marche :**

1. **Glissez des éléments** sur un canvas basé grille
2. **Positionnez et redimensionnez** visuellement
3. **Définissez les propriétés** (texte, couleurs, comportement)
4. **Exportez** en description lisible par Claude
5. **Attachez au prompt** via l'option "Inclure GUI"

**Description Générée :**

```markdown
## Description du Layout UI

Container à (100, 50), 300x400px:
  - Texte "Login Form" en haut, centré, heading 24px
  - Input "Email" à (20, 60), pleine largeur, placeholder "email@example.com"
  - Input "Mot de passe" à (20, 120), pleine largeur, type: password
  - Checkbox "Se souvenir de moi" à (20, 180), aligné gauche
  - Bouton "Connexion" à (20, 240), pleine largeur, style primaire
```

**Bénéfices :**

| Traditionnel | Avec GUI Designer |
|--------------|-------------------|
| Décrire → Construire → "Non, pas ça" → Répéter | Dessiner → Construire → Terminé |
| 5-10 itérations | 1-2 itérations |
| Exigences vagues | Layout précis |
| Frustration | Clarté |

**Intégration Design Tokens :**

Le GUI Designer utilise vos design tokens configurés :
- Bouton primaire → utilise `--color-primary`
- Espacement → utilise votre échelle d'espacement
- Polices → utilise vos familles de polices

**Résultat :** Claude construit une UI qui correspond à votre design system *et* à votre intention visuelle.

---

### Slide 11 : User Stories & Workflow du Backlog

**Le Workflow Piloté par le Backlog :**

```
Prompt → Dériver Stories → Réviser → Backlog → Implémenter → Vérifier → Terminer
```

**Dérivation de Stories :**

1. L'utilisateur écrit la spécification dans la branche Specifications
2. Coche "Dériver User Stories"
3. Claude extrait des stories structurées :

```json
{
  "title": "Ajouter Formulaire de Connexion",
  "description": "En tant qu'utilisateur, je veux me connecter...",
  "acceptanceCriteria": [
    "Le formulaire a des champs email et mot de passe",
    "La validation affiche des erreurs inline",
    "Le bouton soumettre est désactivé jusqu'à validation"
  ]
}
```

4. L'utilisateur révise, édite, approuve
5. Les stories sont ajoutées au backlog

**Implémentation Consciente des Branches :**

Chaque story suit :
- `branchId` : Où elle a été dérivée
- `implementedOn[]` : Quelles branches ont travaillé dessus

```
Story: "Ajouter Formulaire de Connexion"

Implémenté sur branche UI:
  → Contexte: Design tokens, patterns composants
  → Focus: Implémentation visuelle

Implémenté sur branche Backend:
  → Contexte: Conventions API, modèle de données
  → Focus: Endpoint d'authentification
```

---

### Slide 12 : Vérification des Critères d'Acceptation

**Le Problème :** L'IA dit "terminé" mais les critères ne sont pas vérifiés

**La Solution :** Critères numérotés avec vérification obligatoire

**Prompt d'Implémentation :**

```markdown
**Critères d'Acceptation :**
1. Le formulaire a des champs email et mot de passe
2. La validation affiche des erreurs inline
3. Le bouton soumettre est désactivé jusqu'à validation

**Exigences de Vérification des Critères :**
Après implémentation, vérifier chaque critère :

- ✅ Critère 1 : [Comment il a été satisfait]
- ⚠️ Critère 2 : [Partiel - ce qui manque]
- ❌ Critère 3 : [Non fait - pourquoi]
```

**Exemple de Sortie :**

```markdown
## Vérification des Critères

- ✅ Critère 1 : Créé composant LoginForm avec composants
     TextField email et mot de passe
- ✅ Critère 2 : Ajouté validation Formik avec schéma yup,
     erreurs affichées sous chaque champ
- ⚠️ Critère 3 : Bouton se désactive sur formulaire invalide, mais
     reste actif pendant l'appel API - besoin état de chargement
```

**Bénéfices :**
- Rien n'est oublié
- Statut clair par critère
- Suivi facile des éléments partiels/bloqués

---

### Slide 13 : Implémentation SAM dans Puffin

**Pourquoi SAM pour Puffin ?**

1. **Workflows Complexes**
   - Dérivation de stories : idle → deriving → reviewing → implementing
   - Cycle de vie du prompt : composing → submitted → streaming → complete

2. **Multiples FSMs**
   - État App, état Prompt, état Story
   - Besoin de clarté sur "que peut-il se passer ensuite ?"

3. **Exigences de Débogage**
   - Time-travel à travers les changements d'état
   - Piste d'audit de toutes les actions

**Configuration SAM dans Puffin :**

```javascript
// instance.js
import { sam } from 'sam-pattern'
import { acceptors } from './model.js'
import { computeState } from './state.js'
import { actions } from './actions.js'

const instance = sam({
  acceptors,
  state: computeState,
  render: (state) => {
    document.dispatchEvent(
      new CustomEvent('puffin-state-change', { detail: { state } })
    )
  }
})

export const intents = actions(instance.intents)
```

---

### Slide 14 : Le Model - 44 Accepteurs

**Structure du Model :**

```javascript
{
  // Application
  initialized: boolean,
  projectPath: string,

  // Configuration
  config: { name, description, options, uxStyle },

  // Conversations
  history: { branches, activeBranch, activePromptId },
  currentPrompt: { content, branchId },
  streamingResponse: string,

  // Workflows
  userStories: Array<Story>,
  storyDerivation: { status, pendingStories },

  // Suivi d'Activité
  activity: { currentTool, activeTools, filesModified }
}
```

**Catégories d'Accepteurs :**

| Catégorie | Nombre | Exemples |
|-----------|--------|----------|
| Application | 4 | initialize, loadState, appError |
| Config | 2 | updateConfig, updateOptions |
| Prompt/Historique | 15 | submitPrompt, completeResponse, selectBranch |
| GUI Designer | 7 | addElement, moveElement, selectElement |
| Architecture | 2 | updateArchitecture, reviewArchitecture |
| User Stories | 14 | deriveStories, addToBacklog, startImplementation |
| Activité | 9 | toolStart, toolEnd, addModifiedFile |
| Navigation | 4 | switchView, toggleSidebar |

**Pattern Accepteur :**

```javascript
export const submitPromptAcceptor = model => proposal => {
  if (proposal?.type !== 'SUBMIT_PROMPT') return

  // Valider
  if (!proposal.payload?.content?.trim()) return

  // Muter
  const promptId = generateId()
  model.pendingPromptId = promptId
  model.history.branches[branchId].prompts.push({
    id: promptId,
    content: proposal.payload.content,
    timestamp: Date.now()
  })
}
```

---

### Slide 15 : Machines à États Finis

**FSM Application :**

```
INITIALIZING → LOADING → READY ↔ PROCESSING → ERROR
                          ↑_________|
```

**FSM Prompt :**

```
IDLE → COMPOSING → SUBMITTED → STREAMING → COMPLETED
  ↑                                            │
  └────────────────────────────────────────────┘
```

**FSM Dérivation de Stories :**

```
idle → deriving → reviewing → implementing → idle
         ↓            ↓
       error      cancelled
```

**États de Contrôle en Pratique :**

```javascript
const computeState = model => ({
  ...model,

  // États de contrôle
  canSubmitPrompt:
    model.currentPrompt?.content?.trim() &&
    !model.pendingPromptId,

  canDeriveStories:
    model.storyDerivation.status === 'idle' &&
    model.history.activeBranch === 'specifications',

  canStartImplementation:
    model.selectedStories?.length > 0 &&
    model.storyDerivation.status === 'idle',

  isProcessing: !!model.pendingPromptId
})
```

**L'UI Répond aux États de Contrôle :**

```javascript
// Bouton désactivé basé sur l'état de contrôle
submitButton.disabled = !state.canSubmitPrompt

// Actions disponibles uniquement dans certains états
if (state.canDeriveStories) {
  showDeriveCheckbox()
}
```

---

### Slide 16 : Démo / Captures d'Écran

**[DÉMO EN DIRECT OU CAPTURES D'ÉCRAN]**

1. **Configuration du Projet**
   - Ouvrir un projet
   - Configurer les préférences
   - Mettre en place les guidelines UI (design tokens)

2. **Workflow par Branches**
   - Écrire les specs dans la branche Specifications
   - Dériver les user stories
   - Passer à la branche UI (noter le changement de contexte)

3. **Implémentation de Story**
   - Sélectionner des stories du backlog
   - Démarrer l'implémentation
   - Voir la sortie de vérification des critères

4. **Debugger SAM**
   - Ouvrir le debugger (Ctrl+Shift+D)
   - Voir l'historique des actions
   - Time-travel à travers les états

5. **CLAUDE.md Dynamique**
   - Montrer le contenu du fichier changeant au changement de branche
   - Montrer les design tokens apparaissant dans la branche UI

---

### Slide 17 : Résultats & Leçons Apprises

**Résultats :**

| Métrique | Avant Puffin | Avec Puffin |
|----------|--------------|-------------|
| Pollution du contexte | Fréquente | Rare |
| Suggestions hors-sujet | Communes | Minimales |
| Suivi complétion stories | Manuel | Automatique |
| Cohérence des patterns | Variable | Imposée via tokens |
| Débogage problèmes d'état | Difficile | Time-travel |

**Leçons Clés :**

1. **Le Contexte est Tout**
   - La même IA avec un contexte différent se comporte très différemment
   - Gestion délibérée du contexte >> espérer le meilleur

2. **SAM Scale Bien**
   - 44 accepteurs, 3 FSMs - toujours gérable
   - Frontières claires entre les concerns

3. **Explicite > Implicite**
   - Les états de contrôle rendent "ce qui peut arriver" évident
   - Les FSMs préviennent les transitions d'état impossibles

4. **L'IA a Besoin de Structure**
   - Critères numérotés avec exigences de vérification
   - Instructions de focus spécifiques à la branche
   - Attentes claires sur le format de sortie

**Prochaines Étapes :**
- Intégration serveur MCP
- Suivi des coûts à travers les sessions
- Fonctionnalités de collaboration d'équipe

---

## Q&R

**Questions Anticipées :**

1. **Pourquoi ne pas juste utiliser la fonctionnalité Projects de Claude ?**
   - Les Projects sont au niveau conversation, pas au niveau branche
   - Pas de changement de contexte dynamique
   - Pas de workflow story/backlog

2. **Pourquoi SAM plutôt que Redux/Zustand ?**
   - États de contrôle explicites pour workflows complexes
   - Intégration FSM pour les transitions d'état
   - Débogage time-travel intégré

3. **Puffin peut-il fonctionner avec d'autres modèles IA ?**
   - Actuellement spécifique à Claude Code CLI
   - L'architecture pourrait supporter d'autres modèles

4. **Comment fonctionne la reprise de session ?**
   - Claude Code CLI supporte `--resume <sessionId>`
   - Chaque branche maintient sa propre session
   - Puffin suit et passe les IDs de session

5. **Quelle est la courbe d'apprentissage ?**
   - Usage basique : minutes
   - Workflow stories : ~30 min
   - Comprendre SAM : ~2 heures

---

## NOTES DU PRÉSENTATEUR

### Guide de Timing

| Section | Durée | Cumulatif |
|---------|-------|-----------|
| Intro | 2 min | 2 min |
| Pattern SAM (3 slides) | 8 min | 10 min |
| Problèmes : Contexte + Historique Éphémère (2 slides) | 5 min | 15 min |
| Qu'est-ce que Puffin + Architecture (2 slides) | 4 min | 19 min |
| Conversations par Branches + Contexte Dynamique (2 slides) | 5 min | 24 min |
| GUI Designer (1 slide) | 3 min | 27 min |
| User Stories + Vérification Critères (2 slides) | 4 min | 31 min |
| SAM dans Puffin (3 slides) | 5 min | 36 min |
| Démo | 4 min | 40 min |
| Résultats | 3 min | 43 min |
| Buffer | -3 min | 40 min |
| Q&R | 20 min | 60 min |

### Points Clés à Souligner

1. **Section SAM :**
   - Les états de contrôle sont le différenciateur
   - Accepteurs = validation à la frontière
   - Les FSMs rendent les transitions d'état explicites

2. **Section Problème :**
   - **L'historique éphémère est le tueur silencieux** - tout semble bien jusqu'à ce que vous fermiez le terminal
   - Histoire vraie : "J'ai construit quelque chose d'incroyable... et perdu toute la conversation"
   - Compression de la fenêtre de contexte = Claude "oublie" vos décisions antérieures

3. **Section Puffin :**
   - Puffin orchestre, Claude construit
   - Branche = contexte séparé = IA focalisée
   - Les stories circulent entre branches avec suivi

4. **GUI Designer :**
   - "Une image vaut mille prompts"
   - Dessiner prend 30 secondes, décrire prend 5 minutes + itérations
   - L'intégration des design tokens signifie une sortie cohérente

5. **Démo :**
   - Montrer CLAUDE.md changeant au changement de branche
   - Montrer le time-travel du debugger SAM
   - Montrer la sortie de vérification des critères
   - Montrer GUI Designer → intégration prompt

### Approfondissements Potentiels (si temps/intérêt)

- Théorie SAM (TLA+, logique temporelle)
- Architecture IPC dans Electron
- Design des templates de prompt
- Internals de Claude Code CLI

---

*Présentation créée pour Puffin v1.1.0*
