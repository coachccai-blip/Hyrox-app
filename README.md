# 🏆 Hyrox Journal — Journal d'entraînement gamifié

Application web **100 % statique** (aucun serveur, aucune base de données, aucun build) :
un journal d'exercices gamifié qui se **réinitialise chaque semaine**, garde l'**historique**
des semaines passées et met en avant tes **records all-time**.

## ✨ Fonctionnalités

- **Saisie hebdomadaire** de ton volume pour 5 catégories : Burpees, Wallballs, Fentes chargées, Course, Gainage.
  Pour chaque exercice, deux boutons distincts :
  - **Ajouter à la semaine en cours** — cumule la valeur saisie au total de la semaine.
  - **Écraser les données de la semaine** — remplace le total de la semaine par la valeur saisie.
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

## 🗂️ Structure

```
index.html     # structure de la page
styles.css     # thème sombre, badges, radar, jauges...
app.js         # logique : paliers, titres, semaine ISO, persistance localStorage
logo.png       # logo de l'app (en-tête + favicon) — à déposer ici
netlify.toml   # config Netlify (site statique, publish = ".")
```

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
