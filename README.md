# 🏆 Hyrox Journal — Journal d'entraînement gamifié

Application web **100 % statique** (aucun serveur, aucune base de données, aucun build) :
un journal d'exercices gamifié qui se **réinitialise chaque semaine**, garde l'**historique**
des semaines passées et met en avant tes **records all-time**.

## ✨ Fonctionnalités

- **Saisie hebdomadaire** de ton volume pour 5 catégories : Burpees, Wallballs, Fentes chargées, Course, Gainage.
  Le total de chaque exercice est **éditable** (bouton **Sauvegarder**), avec des ajouts
  rapides (+5 / +10 / …) et un bouton **Remise à zéro** par exercice.
- **Navigation par barre d'onglets en bas** : `Semaine · Progrès · Plan · Timer · Historique · Journal`,
  plus un bouton **Agenda** en haut à droite.
- **Timer** : chronomètre (avec tours), minuteur (compte à rebours, **presets enregistrables**) et
  **entraînement par intervalles** personnalisable (préparation / effort / repos / tours) avec
  **effets sonores** et **presets enregistrables**. Animations dédiées : un **chat qui court dans une
  roue de hamster** pour le chrono, un **chat en gainage** (qui tremble et transpire) pour le minuteur.
- **Bruitages d'interface** : un petit clic sonore sur chaque bouton (désactivable via 🔊 dans l'onglet Timer).
- **Plan d'entraînement** : choisis ton **objectif** (palier visé), ton nombre de **séances muscu** et de
  **séances course** par semaine → l'app pose les séances en **doubles séances** (matin + soir le même jour)
  pour libérer un maximum de jours de repos. L'ordre est optimisé pour la récupération : jamais deux séances
  dures collées, alternance muscu/course, et enchaînement dimanche → lundi valide pour répéter la semaine.
  **Jour** et **moment (matin / midi / soir)** se changent sur chaque carte.
  Les **valeurs sont modifiables** avant d'adopter le plan, le **type de séance de course**
  se change à la volée (sortie longue / tempo / fractionné / footing), et un **récapitulatif des totaux**
  compare en direct ce qui est programmé à l'objectif visé.
  Le **fractionné est plafonné à 4 km** par séance (prévention des blessures) : le surplus de
  kilométrage est automatiquement redistribué sur les autres sorties.
- **Plans enregistrés** : sauvegarde un plan une fois ajusté et recharge-le en un clic les semaines suivantes.
- **Agenda** (bouton en haut à droite) : le plan adopté s'y affiche jour par jour (avec le jour du jour mis
  en avant), et un bouton permet de **vider le plan de la semaine** pour en choisir un autre.
- **Mise à jour automatique** : un service worker sert toujours la dernière version en ligne, recharge
  l'onglet quand une nouvelle version est déployée, et permet l'usage **hors-ligne** (PWA installable).
- **Historique éditable** : modifie le volume d'une semaine passée, supprime-la, ou **ajoute une semaine
  oubliée** (choix de la semaine ISO) — les records se recalculent automatiquement.
- **Compte à rebours en direct** vers le prochain lundi 00:00, au format `Xj HH:MM:SS`.
- **Story Journal** (onglet *Journal*) : une galerie mosaïque de tes séances marquantes
  (titre, **date**, description, plusieurs photos, lightbox plein écran). **Sans champ prix.**
  Photos redimensionnées dans le navigateur (max 1200 px) et stockées à part.
- **Réinitialisation automatique chaque lundi** (semaine ISO). Le volume de la semaine écoulée est archivé.
- **Historique consultable** de chaque semaine passée, avec le titre atteint dans chaque catégorie.
- **Records all-time** par catégorie : recalculés comme le **plus haut volume atteint** sur toutes les
  semaines connues (semaine en cours **ou** semaines passées), donc toujours justes même après un écrasement.
- **Titres gamifiés** débloqués (et re-débloqués chaque semaine) selon le volume réalisé :
  - 🐱 Burpees → *Chaton* (endormi → paresseux → motivé → de compétition → survolté → de guerre → d'élite)
  - 🦍 Wallballs → *Gorille*
  - 🦙 Fentes chargées → *Lama*
  - 🐆 Course → *Guépard*
  - 🐢 Gainage → *Tortue*
- **Diagramme d'araignée** (radar) de ton volume face aux 6 paliers (*paresseux* → *élite*).
- **Jauges de progression** vers l'objectif suivant pour chaque exercice.
- **Badges** avec l'animal de la catégorie, dont le **fond change selon le niveau** :
  blanc (endormi), jaune (paresseux), vert (motivé), bleu (compétition), rouge (survolté),
  noir (de guerre), violet (d'élite).
- **Galerie des titres** défilable : les titres débloqués sont en couleur, ceux encore à
  débloquer sont grisés avec un petit 🔒.

## 🚀 Déploiement sur Netlify

### Option 1 — Glisser-déposer (le plus simple)
1. Va sur **https://app.netlify.com/drop**
2. Glisse-dépose **le dossier complet** (celui qui contient `index.html`).
3. C'est en ligne. 🎉

### Option 2 — Depuis Git
1. Connecte ce dépôt à Netlify (New site from Git).
2. Laisse le **build command vide** et le **publish directory** sur `.` (déjà configuré dans `netlify.toml`).
3. Déploie.

## 🌐 Déploiement sur GitHub Pages

Le site est 100 % statique et un fichier `.nojekyll` est présent, il se publie donc
directement depuis la branche. Une seule action à faire une fois dans le dépôt :

1. **Settings → Pages**
2. **Build and deployment → Source : _Deploy from a branch_**
3. **Branch : `claude/gamified-exercise-app-1x061w`** — dossier **`/ (root)`** → **Save**
4. Attends ~1 minute : le site est en ligne sur
   **`https://coachccai-blip.github.io/Hyrox-app/`**

Toutes les URL (styles, scripts, logo, icônes, manifest) sont relatives : l'app fonctionne
donc parfaitement sous le sous-chemin `/Hyrox-app/`.

## 🗂️ Structure

```
index.html            # pages à onglets, barre de navigation, story journal, lightbox
styles.css            # thème Hyrox (noir + volt), badges, radar, jauges, journal
app.js                # paliers, titres, semaine ISO, radar, story journal, localStorage
logo.png              # logo de l'app (en-tête) — à déposer ici
icon-192/512.png      # icônes favicon + PWA (dérivées de logo.png)
manifest.webmanifest  # métadonnées PWA (icône au téléchargement/installation)
netlify.toml          # config Netlify (site statique, publish = ".")
```

## 🎨 Thème

Charte inspirée de l'univers **Hyrox** : fond noir, accent **volt** (jaune-vert néon),
typographie athlétique en capitales italiques, icônes ligne. Les 7 couleurs de badge
(blanc → violet) restent imposées par la gamification.

## 💾 Données (localStorage)

- `hyrox-journal-v1` — quest hebdomadaire (semaine en cours, historique, records).
- `hyrox-journal-stories-v1` — story journal (indépendant du quest).
- `hyrox-timer-presets-v1` / `hyrox-timer-min-presets-v1` — presets d'intervalles et de minuteur.
- `hyrox-plan-v1` — réglages du plan (objectif + nombre de séances).
- `hyrox-week-plan-v1` — plan adopté pour la semaine (agenda).
- `hyrox-plan-library-v1` — bibliothèque de plans enregistrés.

## 🖼️ Logo & icône d'application

- **`logo.png`** (racine, à côté de `index.html`) : logo affiché dans l'en-tête.
  Si le fichier est absent, l'app affiche un emoji 🐱 de secours — rien n'est cassé.
- **`icon-192.png` et `icon-512.png`** : icônes utilisées comme **favicon** (onglet)
  et comme **icône d'application au téléchargement/installation** (Ajouter à l'écran
  d'accueil / PWA), déclarées dans `manifest.webmanifest`.

Pour changer le logo/l'icône : remplace `logo.png` par ta nouvelle image (carrée,
idéalement 512×512 px), puis régénère les deux icônes aux bonnes tailles
(`icon-192.png`, `icon-512.png`) à partir de ce même visuel.

## 💾 Données

Tout est stocké **localement dans le navigateur** (`localStorage`, clé `hyrox-journal-v1`).
Aucune donnée n'est envoyée sur un serveur. Les données sont donc propres à chaque appareil/navigateur.

## 🎯 Paliers (seuils par titre)

| Catégorie | Unité | paresseux | motivé | compétition | survolté | de guerre | d'élite |
|-----------|-------|-----------|--------|-------------|----------|-----------|---------|
| Burpees   | reps  | 30  | 100 | 150 | 200 | 300 | 400 |
| Wallballs | reps  | 30  | 100 | 150 | 200 | 300 | 400 |
| Fentes    | reps  | 40  | 100 | 200 | 300 | 400 | 600 |
| Course    | km    | 5   | 15  | 25  | 40  | 50  | 60  |
| Gainage   | s     | 180 | 360 | 440 | 720 | 900 | 1200 |

Le niveau « endormi » correspond à 0 (départ de chaque semaine).
