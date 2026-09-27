/* =========================================================================
   Hyrox Journal — journal d'entraînement gamifié
   App statique 100% front-end. Persistance via localStorage.
   ========================================================================= */

'use strict';

/* -------------------------------------------------------------------------
   0. Mise à jour automatique (service worker)
   L'app récupère toujours la dernière version en ligne, fonctionne hors-ligne,
   et recharge automatiquement l'onglet quand une nouvelle version est déployée.
   ------------------------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const check = () => { reg.update().catch(() => {}); };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(() => {});
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return; // pas de reload au tout premier chargement
    reloaded = true;
    window.location.reload();
  });
}

/* -------------------------------------------------------------------------
   1. Configuration des paliers (niveaux) et couleurs de fond
   ------------------------------------------------------------------------- */
const LEVELS = [
  { key: 'endormi',     name: 'Endormi',        adj: { m: 'endormi',        f: 'endormie' },     bg: '#f5f5f5', fg: '#2a2a2a', ring: '#d8d8d8' },
  { key: 'paresseux',   name: 'Paresseux',      adj: { m: 'paresseux',      f: 'paresseuse' },   bg: '#ffd43b', fg: '#4a3600', ring: '#e6b800' },
  { key: 'motive',      name: 'Motivé',         adj: { m: 'motivé',         f: 'motivée' },      bg: '#51cf66', fg: '#08300f', ring: '#2fa347' },
  { key: 'competition', name: 'De compétition', adj: { m: 'de compétition', f: 'de compétition' }, bg: '#339af0', fg: '#04223f', ring: '#1b7fd6' },
  { key: 'survolte',    name: 'Survolté',       adj: { m: 'survolté',       f: 'survoltée' },    bg: '#fa5252', fg: '#3f0202', ring: '#e03131' },
  { key: 'guerre',      name: 'De guerre',      adj: { m: 'de guerre',      f: 'de guerre' },    bg: '#1a1a1a', fg: '#ffffff', ring: '#000000' },
  { key: 'elite',       name: "D'élite",        adj: { m: "d'élite",        f: "d'élite" },      bg: '#9c36b5', fg: '#ffffff', ring: '#7a2690' },
];

/* -------------------------------------------------------------------------
   2. Configuration des exercices
      tiers[i] = seuil (en unité) pour atteindre LEVELS[i]
      tiers[0] doit valoir 0 (niveau "endormi")
   ------------------------------------------------------------------------- */
const EXERCISES = [
  { id: 'burpees',   name: 'Burpees',         animal: 'Chaton',  emoji: '🐱', gender: 'm', unit: 'burpees',  quick: [5, 10, 20],   tiers: [0, 30, 100, 150, 200, 300, 400] },
  { id: 'wallballs', name: 'Wallballs',       animal: 'Gorille', emoji: '🦍', gender: 'm', unit: 'wallballs', quick: [5, 10, 20],   tiers: [0, 30, 100, 150, 200, 300, 400] },
  { id: 'fentes',    name: 'Fentes chargées', animal: 'Lama',    emoji: '🦙', gender: 'm', unit: 'fentes',   quick: [10, 20, 40],  tiers: [0, 40, 100, 200, 300, 400, 600] },
  { id: 'course',    name: 'Course',          animal: 'Guépard', emoji: '🐆', gender: 'm', unit: 'km',       quick: [1, 2, 5],     decimals: true, tiers: [0, 5, 15, 25, 40, 50, 60] },
  { id: 'gainage',   name: 'Gainage',         animal: 'Tortue',  emoji: '🐢', gender: 'f', unit: 's',        quick: [30, 60, 120], tiers: [0, 180, 360, 440, 720, 900, 1200] },
];

const STORAGE_KEY = 'hyrox-journal-v1';

/* -------------------------------------------------------------------------
   3. Utilitaires
   ------------------------------------------------------------------------- */

/** Titre complet d'un exercice pour un niveau donné (genre grammatical géré). */
function titleFor(ex, levelIndex) {
  return `${ex.animal} ${LEVELS[levelIndex].adj[ex.gender]}`;
}

/** Index du niveau atteint pour une valeur donnée. */
function levelIndexFor(value, tiers) {
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (value >= tiers[i]) idx = i;
  }
  return idx;
}

/**
 * Convertit une valeur sur l'échelle du radar : 0 = centre (endormi),
 * 1 = palier paresseux, ..., 6 = palier élite. Interpolation linéaire
 * entre deux seuils. Plafonné à (tiers.length - 1).
 */
function toRadarScale(value, tiers) {
  const maxLevel = tiers.length - 1;
  if (value <= tiers[0]) return 0;
  for (let i = 1; i < tiers.length; i++) {
    if (value <= tiers[i]) {
      const span = tiers[i] - tiers[i - 1] || 1;
      return (i - 1) + (value - tiers[i - 1]) / span;
    }
  }
  return maxLevel;
}

/** Formate une valeur selon l'exercice (décimales pour la course). */
function fmt(ex, value) {
  if (ex.decimals) {
    return (Math.round(value * 10) / 10).toString().replace(/\.0$/, '');
  }
  return Math.round(value).toString();
}

/** Formate une durée en secondes -> "12 min 30 s" pour le gainage. */
function fmtSeconds(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
}

/** Numéro de semaine ISO + clé stable "YYYY-Www". */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return {
    year: d.getUTCFullYear(),
    week: weekNo,
    key: `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
  };
}

/** Lundi et dimanche (dates locales) de la semaine contenant `date`. */
function weekBounds(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function fmtDate(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/* -------------------------------------------------------------------------
   4. Gestion de l'état (localStorage)
   ------------------------------------------------------------------------- */
function emptyValues() {
  const v = {};
  EXERCISES.forEach((ex) => { v[ex.id] = 0; });
  return v;
}

function loadState() {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    state = null;
  }
  if (!state || typeof state !== 'object') {
    state = { currentWeek: null, current: emptyValues(), history: [], allTime: {} };
  }
  // Garanties de forme
  state.current = Object.assign(emptyValues(), state.current || {});
  state.history = Array.isArray(state.history) ? state.history : [];
  state.allTime = state.allTime || {};
  return state;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Recalcule les records all-time : pour chaque catégorie, on cherche le plus
 * haut volume atteint sur TOUTES les semaines connues — la semaine en cours
 * comme les semaines passées. Ainsi les records restent justes même après un
 * écrasement de données (une valeur plus basse ne "gèle" pas un ancien record).
 */
function recomputeAllTime(state) {
  const allTime = {};
  EXERCISES.forEach((ex) => {
    let best = { value: 0, week: null };
    state.history.forEach((h) => {
      const v = (h.values && h.values[ex.id]) || 0;
      if (v > best.value) best = { value: v, week: h.week };
    });
    const cv = state.current[ex.id] || 0;
    if (cv > best.value) best = { value: cv, week: state.currentWeek };
    allTime[ex.id] = best;
  });
  state.allTime = allTime;
}

/** Archive la semaine courante dans l'historique si elle contient du volume. */
function archiveCurrent(state) {
  if (!state.currentWeek) return;
  const total = EXERCISES.reduce((s, ex) => s + (state.current[ex.id] || 0), 0);
  if (total <= 0) return; // on n'archive pas une semaine vide

  const already = state.history.find((h) => h.week === state.currentWeek);
  const entry = {
    week: state.currentWeek,
    values: Object.assign({}, state.current),
  };
  if (already) {
    Object.assign(already, entry);
  } else {
    state.history.unshift(entry);
  }
  recomputeAllTime(state);
}

/** Vérifie le changement de semaine et réinitialise si nécessaire. */
function ensureCurrentWeek(state) {
  const now = new Date();
  const wk = isoWeek(now).key;
  if (state.currentWeek !== wk) {
    if (state.currentWeek) {
      archiveCurrent(state);
    }
    state.current = emptyValues();
    state.currentWeek = wk;
    saveState(state);
    return true; // une réinitialisation a eu lieu
  }
  return false;
}

/* -------------------------------------------------------------------------
   5. Rendu
   ------------------------------------------------------------------------- */
let STATE = loadState();

/** Applique une nouvelle valeur (déjà calculée) et rafraîchit tout. */
function commitValue(ex, before, newValue) {
  let v = newValue;
  if (isNaN(v) || v < 0) v = 0;
  STATE.current[ex.id] = ex.decimals ? Math.round(v * 10) / 10 : Math.round(v);
  recomputeAllTime(STATE); // records = plus haut volume, semaine en cours incluse
  const after = levelIndexFor(STATE.current[ex.id], ex.tiers);
  saveState(STATE);
  renderAll();
  if (after > before) {
    toast(`${ex.emoji} Nouveau titre débloqué : ${titleFor(ex, after)} !`);
    return true;
  }
  return false;
}

/** Ajoute (ou retire) du volume à la semaine en cours. Renvoie true si un titre est débloqué. */
function addVolume(exId, amount) {
  const ex = EXERCISES.find((e) => e.id === exId);
  const before = levelIndexFor(STATE.current[exId] || 0, ex.tiers);
  return commitValue(ex, before, (STATE.current[exId] || 0) + amount);
}

/** Fixe le total de la semaine en cours à une valeur absolue. Renvoie true si un titre est débloqué. */
function setVolume(exId, value) {
  const ex = EXERCISES.find((e) => e.id === exId);
  const before = levelIndexFor(STATE.current[exId] || 0, ex.tiers);
  return commitValue(ex, before, value);
}

/* ---- Saisie ---- */
function renderInputs() {
  const grid = document.getElementById('inputGrid');
  grid.innerHTML = '';
  EXERCISES.forEach((ex) => {
    const value = STATE.current[ex.id] || 0;
    const lvl = levelIndexFor(value, ex.tiers);

    const card = document.createElement('div');
    card.className = 'ex-card';
    card.innerHTML = `
      <div class="ex-card-top">
        <div class="ex-emoji">${ex.emoji}</div>
        <div>
          <div class="ex-name">${ex.name}</div>
          <div class="ex-title-mini">${titleFor(ex, lvl)}</div>
        </div>
      </div>
      <div class="ex-total-edit">
        <input class="total-input" type="number" inputmode="decimal" min="0" step="${ex.decimals ? '0.1' : '1'}" value="${fmt(ex, value)}" aria-label="Total ${ex.name}" />
        <span class="unit">${ex.unit}</span>
      </div>
      <button type="button" class="btn-save">Sauvegarder</button>
      <div class="quick-adds"></div>
      <div class="custom-actions">
        <button type="button" class="btn-reset">Remise à zéro</button>
      </div>
    `;

    const quick = card.querySelector('.quick-adds');
    ex.quick.forEach((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `+${q}`;
      b.addEventListener('click', () => addVolume(ex.id, q));
      quick.appendChild(b);
    });
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'minus';
    minus.textContent = '−';
    minus.title = `Retirer ${ex.quick[0]} ${ex.unit}`;
    minus.addEventListener('click', () => addVolume(ex.id, -ex.quick[0]));
    quick.appendChild(minus);

    const totalInput = card.querySelector('.total-input');
    const saveBtn = card.querySelector('.btn-save');
    const resetBtn = card.querySelector('.btn-reset');

    const doSave = () => {
      const v = parseFloat(totalInput.value);
      if (isNaN(v)) { totalInput.value = fmt(ex, STATE.current[ex.id] || 0); return; }
      const leveledUp = setVolume(ex.id, v);
      if (!leveledUp) {
        const saved = STATE.current[ex.id] || 0;
        const savedTxt = ex.id === 'gainage' ? fmtSeconds(saved) : `${fmt(ex, saved)} ${ex.unit}`;
        toast(`💾 ${ex.name} enregistré : ${savedTxt}`);
      }
    };
    const doReset = () => {
      const cur = STATE.current[ex.id] || 0;
      if (cur > 0 && !confirm(`Remettre ${ex.name} à zéro pour la semaine en cours ?`)) return;
      setVolume(ex.id, 0);
      toast(`↺ ${ex.name} remis à zéro`);
    };

    saveBtn.addEventListener('click', doSave);
    resetBtn.addEventListener('click', doReset);
    totalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });

    grid.appendChild(card);
  });
}

/* ---- Badge (élément réutilisable) ---- */
function badgeEl(ex, levelIndex, { locked = false, size } = {}) {
  const lvl = LEVELS[levelIndex];
  const el = document.createElement('div');
  el.className = 'badge' + (locked ? ' locked' : '');
  el.style.background = lvl.bg;
  el.style.borderColor = lvl.ring;
  if (size) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
  el.textContent = ex.emoji;
  if (locked) {
    const lock = document.createElement('div');
    lock.className = 'lock';
    lock.textContent = '🔒';
    el.appendChild(lock);
  }
  return el;
}

/* ---- Titres actuels ---- */
function renderCurrentBadges() {
  const row = document.getElementById('currentBadges');
  row.innerHTML = '';
  EXERCISES.forEach((ex) => {
    const value = STATE.current[ex.id] || 0;
    const lvl = levelIndexFor(value, ex.tiers);
    const card = document.createElement('div');
    card.className = 'badge-card';
    card.appendChild(badgeEl(ex, lvl));
    const t = document.createElement('div');
    t.className = 'badge-title';
    t.textContent = titleFor(ex, lvl);
    const c = document.createElement('div');
    c.className = 'badge-cat';
    c.textContent = `${ex.name} · ${fmt(ex, value)} ${ex.unit}`;
    const ln = document.createElement('div');
    ln.className = 'badge-lvlname';
    ln.textContent = `Niveau ${lvl}/6 · ${LEVELS[lvl].name}`;
    card.appendChild(t);
    card.appendChild(c);
    card.appendChild(ln);
    row.appendChild(card);
  });
}

/* ---- Radar (diagramme d'araignée) en SVG ---- */
function renderRadar() {
  const host = document.getElementById('radar');
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 54;
  const maxLevel = LEVELS.length - 1; // 6
  const n = EXERCISES.length;
  const NS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Diagramme araignée du volume par exercice');

  const angleFor = (i) => (-Math.PI / 2) + (i * 2 * Math.PI / n);
  const point = (i, radius) => [cx + radius * Math.cos(angleFor(i)), cy + radius * Math.sin(angleFor(i))];

  // Anneaux + étiquettes des paliers (paresseux..élite = niveaux 1..6)
  for (let ring = 1; ring <= maxLevel; ring++) {
    const rr = R * (ring / maxLevel);
    const poly = document.createElementNS(NS, 'polygon');
    const pts = [];
    for (let i = 0; i < n; i++) { const p = point(i, rr); pts.push(p.join(',')); }
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', LEVELS[ring].ring);
    poly.setAttribute('stroke-opacity', '0.35');
    poly.setAttribute('stroke-width', '1');
    svg.appendChild(poly);
  }

  // Rayons
  for (let i = 0; i < n; i++) {
    const p = point(i, R);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', cx); line.setAttribute('y1', cy);
    line.setAttribute('x2', p[0]); line.setAttribute('y2', p[1]);
    line.setAttribute('stroke', '#2a2e26');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  // Zone du volume réalisé
  const valPts = [];
  EXERCISES.forEach((ex, i) => {
    const scale = toRadarScale(STATE.current[ex.id] || 0, ex.tiers);
    const rr = R * (scale / maxLevel);
    valPts.push(point(i, rr).join(','));
  });
  const area = document.createElementNS(NS, 'polygon');
  area.setAttribute('points', valPts.join(' '));
  area.setAttribute('fill', 'rgba(212, 251, 46, 0.22)');
  area.setAttribute('stroke', '#d4fb2e');
  area.setAttribute('stroke-width', '2.5');
  area.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(area);

  // Points + labels des exercices
  EXERCISES.forEach((ex, i) => {
    const scale = toRadarScale(STATE.current[ex.id] || 0, ex.tiers);
    const rr = R * (scale / maxLevel);
    const p = point(i, rr);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', '#eaffa0');
    svg.appendChild(dot);

    const lp = point(i, R + 26);
    const g = document.createElementNS(NS, 'text');
    g.setAttribute('x', lp[0]);
    g.setAttribute('y', lp[1]);
    g.setAttribute('text-anchor', Math.abs(lp[0] - cx) < 8 ? 'middle' : (lp[0] < cx ? 'end' : 'start'));
    g.setAttribute('dominant-baseline', 'middle');
    g.setAttribute('fill', '#f2f4ec');
    g.setAttribute('font-size', '18');
    g.textContent = ex.emoji;
    svg.appendChild(g);

    const nm = document.createElementNS(NS, 'text');
    nm.setAttribute('x', lp[0]);
    nm.setAttribute('y', lp[1] + 15);
    nm.setAttribute('text-anchor', Math.abs(lp[0] - cx) < 8 ? 'middle' : (lp[0] < cx ? 'end' : 'start'));
    nm.setAttribute('dominant-baseline', 'middle');
    nm.setAttribute('fill', '#969c88');
    nm.setAttribute('font-size', '9');
    nm.textContent = ex.name;
    svg.appendChild(nm);
  });

  host.innerHTML = '';
  host.appendChild(svg);

  // Légende des anneaux
  const legend = document.getElementById('radarLegend');
  legend.innerHTML = '';
  for (let ring = 1; ring <= maxLevel; ring++) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = LEVELS[ring].bg;
    li.appendChild(dot);
    li.appendChild(document.createTextNode(`Anneau ${ring} · ${LEVELS[ring].name}`));
    legend.appendChild(li);
  }
}

/* ---- Jauges de progression ---- */
function renderGauges() {
  const host = document.getElementById('gauges');
  host.innerHTML = '';
  EXERCISES.forEach((ex) => {
    const value = STATE.current[ex.id] || 0;
    const lvl = levelIndexFor(value, ex.tiers);
    const isMax = lvl >= ex.tiers.length - 1;

    let pct, subText, nextText;
    const displayVal = ex.id === 'gainage' ? fmtSeconds(value) : `${fmt(ex, value)} ${ex.unit}`;

    if (isMax) {
      pct = 100;
      nextText = `<strong>Niveau maximum</strong> · ${titleFor(ex, lvl)}`;
      subText = 'Tu es au sommet 🔥 Rien au-dessus de l\'élite !';
    } else {
      const cur = ex.tiers[lvl];
      const nextThr = ex.tiers[lvl + 1];
      const span = nextThr - cur || 1;
      pct = Math.max(0, Math.min(100, ((value - cur) / span) * 100));
      const remain = nextThr - value;
      const remainTxt = ex.id === 'gainage' ? fmtSeconds(remain) : `${fmt(ex, remain)} ${ex.unit}`;
      const nextThrTxt = ex.id === 'gainage' ? fmtSeconds(nextThr) : `${fmt(ex, nextThr)} ${ex.unit}`;
      nextText = `Prochain : <strong>${titleFor(ex, lvl + 1)}</strong>`;
      subText = `Encore <strong style="color:#fff">${remainTxt}</strong> pour atteindre ${nextThrTxt}`;
    }

    const g = document.createElement('div');
    g.className = 'gauge';
    g.innerHTML = `
      <div class="g-emoji">${ex.emoji}</div>
      <div class="g-body">
        <div class="g-top">
          <span class="g-name">${ex.name} — ${displayVal}</span>
          <span class="g-next">${nextText}</span>
        </div>
        <div class="g-track"><div class="g-fill ${isMax ? 'max' : ''}" style="width:${pct}%"></div></div>
        <div class="g-sub">${subText}</div>
      </div>
    `;
    host.appendChild(g);
  });
}

/* ---- Galerie des titres (débloqués + à débloquer avec cadenas) ---- */
function renderTitleGallery() {
  const host = document.getElementById('titleGallery');
  host.innerHTML = '';
  EXERCISES.forEach((ex) => {
    const value = STATE.current[ex.id] || 0;
    const lvl = levelIndexFor(value, ex.tiers);

    const row = document.createElement('div');
    row.className = 'tg-row';

    const head = document.createElement('div');
    head.className = 'tg-head';
    head.innerHTML = `<span>${ex.emoji}</span> <span>${ex.name}</span>
      <span class="tg-count">${lvl + 1}/${LEVELS.length} titres débloqués</span>`;
    row.appendChild(head);

    const scroll = document.createElement('div');
    scroll.className = 'tg-scroll';

    LEVELS.forEach((level, i) => {
      const locked = i > lvl;
      const item = document.createElement('div');
      item.className = 'tg-item' + (locked ? ' locked' : '') + (i === lvl ? ' current-tier' : '');
      item.appendChild(badgeEl(ex, i, { locked }));

      const t = document.createElement('div');
      t.className = 'tg-title';
      t.textContent = titleFor(ex, i);
      item.appendChild(t);

      const thr = document.createElement('div');
      thr.className = 'tg-thr';
      const thrVal = ex.id === 'gainage' ? fmtSeconds(ex.tiers[i]) : `${fmt(ex, ex.tiers[i])} ${ex.unit}`;
      thr.textContent = i === 0 ? 'Départ' : `≥ ${thrVal}`;
      item.appendChild(thr);

      const tag = document.createElement('div');
      tag.className = 'tg-badge-current';
      tag.textContent = i === lvl ? '★ Actuel' : (locked ? ' ' : 'Débloqué');
      item.appendChild(tag);

      scroll.appendChild(item);
    });

    row.appendChild(scroll);
    host.appendChild(row);
  });
}

/* ---- Records all-time ---- */
function renderAllTime() {
  const host = document.getElementById('allTime');
  host.innerHTML = '';
  EXERCISES.forEach((ex) => {
    const rec = STATE.allTime[ex.id];
    const val = rec ? rec.value : 0;
    const lvl = levelIndexFor(val, ex.tiers);
    const card = document.createElement('div');
    card.className = 'at-card';
    const valTxt = ex.id === 'gainage' ? fmtSeconds(val) : `${fmt(ex, val)} ${ex.unit}`;
    card.innerHTML = `
      <div class="at-emoji">${ex.emoji}</div>
      <div>
        <div class="at-cat">Record ${ex.name}</div>
        <div class="at-val">${valTxt}</div>
        <div class="at-week">${rec && rec.week ? titleFor(ex, lvl) + ' · ' + weekLabel(rec.week) : 'Aucun record'}</div>
      </div>
    `;
    host.appendChild(card);
  });
}

/* ---- Historique des semaines ---- */
function weekLabel(key) {
  // key = "YYYY-Www"
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return key;
  return `Semaine ${parseInt(m[2], 10)} · ${m[1]}`;
}

function renderHistory() {
  const host = document.getElementById('history');
  host.innerHTML = '';
  if (!STATE.history.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = "Aucune semaine archivée pour l'instant. Ta première semaine s'affichera ici après le prochain lundi.";
    host.appendChild(p);
    return;
  }
  STATE.history.forEach((h, idx) => {
    const det = document.createElement('details');
    det.className = 'hist-week';
    if (idx === 0) det.open = true;
    const total = EXERCISES.reduce((s, ex) => s + (h.values[ex.id] || 0), 0);

    const sum = document.createElement('summary');
    sum.innerHTML = `<span>${weekLabel(h.week)}</span>
      <span class="chev">›</span>`;
    det.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'hist-body';
    EXERCISES.forEach((ex) => {
      const val = h.values[ex.id] || 0;
      const lvl = levelIndexFor(val, ex.tiers);
      const rec = STATE.allTime[ex.id];
      const isPR = rec && rec.week === h.week && rec.value === val && val > 0;
      const valTxt = ex.id === 'gainage' ? fmtSeconds(val) : `${fmt(ex, val)} ${ex.unit}`;
      const line = document.createElement('div');
      line.className = 'hist-line';
      line.innerHTML = `
        <span class="hl-emoji">${ex.emoji}</span>
        <span class="hl-cat">${ex.name}</span>
        <span class="hl-val">${valTxt}</span>
        <span class="hl-title">${titleFor(ex, lvl)}</span>
        ${isPR ? '<span class="pr">★ Record</span>' : ''}
      `;
      body.appendChild(line);
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'hist-edit-btn';
    editBtn.type = 'button';
    editBtn.textContent = '✎ Éditer cette semaine';
    editBtn.addEventListener('click', () => openWeekEditor(h.week));
    body.appendChild(editBtn);

    det.appendChild(body);
    host.appendChild(det);
  });
}

/** Trie l'historique par semaine décroissante (plus récente en tête). */
function sortHistory() {
  STATE.history.sort((a, b) => String(b.week).localeCompare(String(a.week)));
}

/** Clé ISO de la semaine précédant la semaine en cours (dernière semaine passée). */
function prevWeekKey() {
  const { monday } = weekBounds(new Date());
  const d = new Date(monday);
  d.setDate(d.getDate() - 7);
  return isoWeek(d).key;
}

/* ---- En-tête semaine (bandeau + compte à rebours en direct) ---- */
function renderWeekHeader() {
  const now = new Date();
  const { monday, sunday } = weekBounds(now);
  document.getElementById('weekTag').textContent = 'W' + isoWeek(now).week;
  document.getElementById('weekRange').textContent = `${fmtDate(monday)} → ${fmtDate(sunday)}`;
  updateCountdown();
}

/** Prochain lundi 00:00 (heure locale). */
function nextMondayMidnight(from) {
  const d = new Date(from);
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  const daysUntilNextMonday = (7 - day) % 7 || 7;
  const nm = new Date(d);
  nm.setDate(d.getDate() + daysUntilNextMonday);
  nm.setHours(0, 0, 0, 0);
  return nm;
}

/** Met à jour le compte à rebours "Xj HH:MM:SS" vers le prochain lundi. */
function updateCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  const now = new Date();
  let diff = Math.max(0, nextMondayMidnight(now) - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  el.textContent = `${d}j ${pad(h)}:${pad(m)}:${pad(s)}`;
}

/* ---- Rendu global ---- */
function renderAll() {
  renderWeekHeader();
  renderInputs();
  renderCurrentBadges();
  renderRadar();
  renderGauges();
  renderTitleGallery();
  renderAllTime();
  renderHistory();
}

/* -------------------------------------------------------------------------
   6. Toast
   ------------------------------------------------------------------------- */
let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* -------------------------------------------------------------------------
   8. Navigation par onglets (barre du bas)
   ------------------------------------------------------------------------- */
function switchTab(name) {
  document.querySelectorAll('.page').forEach((p) => {
    p.classList.toggle('active', p.dataset.page === name);
  });
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

/* Sélecteur segmenté de l'historique (Semaines / All-time / Bourse) */
const HIST_VIEWS = { weeks: 'histWeeksView', alltime: 'histAllTimeView', bourse: 'histBourseView' };
document.querySelectorAll('#histSeg .seg-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#histSeg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    const view = b.dataset.view;
    Object.keys(HIST_VIEWS).forEach((k) => {
      document.getElementById(HIST_VIEWS[k]).classList.toggle('hidden', k !== view);
    });
    if (view === 'bourse') renderBourse();
  });
});

/* -------------------------------------------------------------------------
   9bis. Bourse : évolution hebdomadaire de chaque exercice
   ------------------------------------------------------------------------- */

/** Série chronologique : toutes les semaines connues, la plus ancienne d'abord. */
function buildSeries() {
  const map = {};
  STATE.history.forEach((h) => { map[h.week] = h.values || {}; });
  map[STATE.currentWeek] = STATE.current;
  return Object.keys(map).sort().map((w) => ({ week: w, values: map[w] }));
}

/** Libellé court d'une semaine ISO : "2026-W32" -> "W32". */
function shortWeek(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  return m ? 'W' + parseInt(m[2], 10) : key;
}

/** Courbe SVG façon cours de bourse pour une série de valeurs. */
function bourseChart(values, weeks, ex, uid) {
  const W = 320, H = 104, padL = 6, padR = 6, padT = 12, padB = 20;
  const n = values.length;
  const max = Math.max.apply(null, values.concat([1]));
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => (n === 1 ? W / 2 : padL + i * innerW / (n - 1));
  const y = (v) => padT + innerH - (v / max) * innerH;
  const base = padT + innerH;

  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = n === 1 ? '' :
    `M${pts[0][0].toFixed(1)} ${base} ` + pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts[n - 1][0].toFixed(1)} ${base} Z`;

  const recordY = y(max);
  const last = pts[n - 1];
  const grid = [0.25, 0.5, 0.75].map((f) =>
    `<line x1="${padL}" x2="${W - padR}" y1="${(padT + innerH * f).toFixed(1)}" y2="${(padT + innerH * f).toFixed(1)}" class="bc-grid"/>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="bc-svg" role="img" aria-label="Évolution ${ex.name}">
    <defs><linearGradient id="bg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--volt)" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="var(--volt)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <line x1="${padL}" x2="${W - padR}" y1="${recordY.toFixed(1)}" y2="${recordY.toFixed(1)}" class="bc-record"/>
    ${area ? `<path d="${area}" fill="url(#bg${uid})"/>` : ''}
    ${n > 1 ? `<path d="${line}" class="bc-line"/>` : ''}
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === n - 1 ? 4 : 2.3}" class="${i === n - 1 ? 'bc-dot-last' : 'bc-dot'}"/>`).join('')}
    <text x="${padL}" y="${H - 5}" class="bc-x">${shortWeek(weeks[0])}</text>
    ${n > 1 ? `<text x="${W - padR}" y="${H - 5}" text-anchor="end" class="bc-x">${shortWeek(weeks[n - 1])}</text>` : ''}
    <text x="${Math.min(last[0], W - padR).toFixed(1)}" y="${Math.max(padT - 3, last[1] - 8).toFixed(1)}" text-anchor="${n === 1 ? 'middle' : 'end'}" class="bc-lastval">${ex.id === 'gainage' ? fmtSeconds(values[n - 1]) : fmt(ex, values[n - 1])}</text>
  </svg>`;
}

function renderBourse() {
  const host = document.getElementById('bourse');
  const series = buildSeries();
  host.innerHTML = '';

  const active = series.filter((p) => EXERCISES.some((ex) => (p.values[ex.id] || 0) > 0));
  if (!active.length) {
    host.innerHTML = `<p class="empty" style="text-align:center;padding:30px 10px;line-height:1.6">
      Aucune activité enregistrée pour l'instant.<br>Saisis ton volume dans l'onglet <strong>Semaine</strong>
      et ta courbe apparaîtra ici.</p>`;
    return;
  }

  const weeks = series.map((p) => p.week);
  EXERCISES.forEach((ex, idx) => {
    const values = series.map((p) => p.values[ex.id] || 0);
    const n = values.length;
    const last = values[n - 1];
    const prev = n > 1 ? values[n - 2] : null;
    const peak = Math.max.apply(null, values);
    const fmtV = (v) => (ex.id === 'gainage' ? fmtSeconds(v) : `${fmt(ex, v)} ${ex.unit}`);

    let delta = '<span class="bd-flat">— première semaine</span>';
    if (prev !== null) {
      const d = last - prev;
      if (d === 0) delta = '<span class="bd-flat">= stable</span>';
      else {
        const pct = prev > 0 ? ` (${d > 0 ? '+' : ''}${Math.round(d / prev * 100)} %)` : '';
        delta = `<span class="${d > 0 ? 'bd-up' : 'bd-down'}">${d > 0 ? '▲' : '▼'} ${d > 0 ? '+' : '−'}${fmtV(Math.abs(d))}${pct}</span>`;
      }
    }

    const card = document.createElement('div');
    card.className = 'bourse-card';
    card.innerHTML = `
      <div class="bo-head">
        <div class="bo-id"><span class="bo-emoji">${ex.emoji}</span>
          <div><div class="bo-name">${ex.name}</div><div class="bo-sub">${n} sem. · record ${fmtV(peak)} 👑</div></div>
        </div>
        <div class="bo-now"><div class="bo-val">${fmtV(last)}</div><div class="bo-delta">${delta}</div></div>
      </div>
      ${bourseChart(values, weeks, ex, idx)}`;
    host.appendChild(card);
  });
}

/* -------------------------------------------------------------------------
   9. Utilitaires partagés
   ------------------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('weekEditor').classList.contains('hidden')) { closeWeekEditor(); return; }
  if (!document.getElementById('calendarView').classList.contains('hidden')) { toggleCalendar(false); }
});

/* -------------------------------------------------------------------------
   10. Réinitialisation globale
   ------------------------------------------------------------------------- */
document.getElementById('resetAllBtn').addEventListener('click', () => {
  if (!confirm('Effacer TOUTES les données du quest (semaine, historique, records) ? Les plans enregistrés ne sont pas touchés. Action irréversible.')) return;
  localStorage.removeItem(STORAGE_KEY);
  STATE = loadState();
  ensureCurrentWeek(STATE);
  recomputeAllTime(STATE);
  saveState(STATE);
  renderAll();
  toast('🧹 Données du quest effacées');
});

/* -------------------------------------------------------------------------
   11. Horloge : compte à rebours en direct + passage de semaine
   ------------------------------------------------------------------------- */
function tick() {
  updateCountdown();
  // Passage de semaine à la frontière du lundi
  if (isoWeek(new Date()).key !== STATE.currentWeek) {
    ensureCurrentWeek(STATE);
    recomputeAllTime(STATE);
    saveState(STATE);
    renderAll();
    toast('🔄 Nouvelle semaine : compteurs remis à zéro !');
  }
}
setInterval(tick, 1000);

/* -------------------------------------------------------------------------
   12. Éditeur de semaines passées (historique)
   ------------------------------------------------------------------------- */
let editingWeekKey = null;

function openWeekEditor(weekKey) {
  editingWeekKey = weekKey || null;
  const existing = editingWeekKey ? STATE.history.find((h) => h.week === editingWeekKey) : null;
  document.getElementById('weekEditorTitle').textContent =
    editingWeekKey ? 'Modifier ' + weekLabel(editingWeekKey) : 'Ajouter une semaine';

  const pick = document.getElementById('weekPick');
  pick.value = editingWeekKey || '';
  pick.disabled = !!editingWeekKey;
  pick.max = prevWeekKey(); // uniquement des semaines passées, jamais le futur
  document.getElementById('weekDeleteBtn').classList.toggle('hidden', !editingWeekKey);
  const msg = document.getElementById('weekEditorMsg');
  msg.classList.add('hidden'); msg.textContent = '';

  const host = document.getElementById('weekValues');
  host.innerHTML = '';
  EXERCISES.forEach((ex) => {
    const v = existing && existing.values ? (existing.values[ex.id] || 0) : 0;
    const lab = document.createElement('label');
    lab.appendChild(document.createTextNode(`${ex.emoji} ${ex.name} (${ex.unit})`));
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = ex.decimals ? '0.1' : '1';
    inp.value = fmt(ex, v); inp.dataset.ex = ex.id;
    inp.addEventListener('focus', () => inp.select()); // saisie remplace la valeur pré-remplie
    lab.appendChild(inp);
    host.appendChild(lab);
  });
  document.getElementById('weekEditor').classList.remove('hidden');
}
function closeWeekEditor() {
  document.getElementById('weekEditor').classList.add('hidden');
  editingWeekKey = null;
}
function weekEditorMsg(t) {
  const m = document.getElementById('weekEditorMsg');
  m.textContent = t; m.classList.remove('hidden');
}

document.getElementById('addWeekBtn').addEventListener('click', () => openWeekEditor(null));
document.getElementById('weekCancelBtn').addEventListener('click', closeWeekEditor);
document.getElementById('weekSaveBtn').addEventListener('click', () => {
  const wk = (editingWeekKey || (document.getElementById('weekPick').value || '')).trim();
  if (!/^\d{4}-W\d{2}$/.test(wk)) { weekEditorMsg('Semaine invalide. Format attendu : 2026-W30.'); return; }
  if (!editingWeekKey) {
    if (wk === STATE.currentWeek) { weekEditorMsg("C'est la semaine en cours : édite-la dans l'onglet Semaine."); return; }
    if (wk > STATE.currentWeek) { weekEditorMsg('Cette semaine est dans le futur.'); return; }
  }
  const values = emptyValues();
  document.querySelectorAll('#weekValues input').forEach((inp) => {
    const ex = EXERCISES.find((e) => e.id === inp.dataset.ex);
    let v = parseFloat(inp.value);
    if (isNaN(v) || v < 0) v = 0;
    values[inp.dataset.ex] = ex.decimals ? Math.round(v * 10) / 10 : Math.round(v);
  });
  const existing = STATE.history.find((h) => h.week === wk);
  if (existing) existing.values = values;
  else STATE.history.push({ week: wk, values });
  sortHistory();
  recomputeAllTime(STATE);
  saveState(STATE);
  renderAll();
  closeWeekEditor();
  toast('✅ Semaine enregistrée');
});
document.getElementById('weekDeleteBtn').addEventListener('click', () => {
  if (!editingWeekKey) return;
  if (!confirm('Supprimer ' + weekLabel(editingWeekKey) + " de l'historique ?")) return;
  STATE.history = STATE.history.filter((h) => h.week !== editingWeekKey);
  recomputeAllTime(STATE);
  saveState(STATE);
  renderAll();
  closeWeekEditor();
  toast('🗑️ Semaine supprimée');
});

/* -------------------------------------------------------------------------
   13. Timer : chrono, minuteur, intervalles (avec sons Web Audio)
   ------------------------------------------------------------------------- */
let audioCtx = null;
let soundOn = true;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur, vol) {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.15));
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + (dur || 0.15) + 0.03);
}
function beepCue(type) {
  if (type === 'count') beep(880, 0.12, 0.25);
  else if (type === 'work') beep(1250, 0.25, 0.35);
  else if (type === 'rest') beep(560, 0.25, 0.30);
  else if (type === 'prep') beep(760, 0.18, 0.25);
  else if (type === 'done') { beep(1400, 0.2, 0.35); setTimeout(() => beep(1400, 0.2, 0.35), 240); setTimeout(() => beep(1760, 0.45, 0.4), 480); }
}
document.getElementById('soundToggle').addEventListener('change', (e) => {
  soundOn = e.target.checked;
  if (soundOn) ensureAudio();
});

/* Petit clic sur tous les boutons (UX) */
function uiClick() {
  if (!soundOn) return;
  beep(520, 0.035, 0.10);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) uiClick();
}, true);

/* Active/désactive une animation de scène */
function setAnim(id, on) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('running', !!on);
}

/* Sous-onglets timer */
document.querySelectorAll('#timerSeg .seg-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#timerSeg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    const mode = b.dataset.mode;
    ['chrono', 'minuteur', 'intervalles'].forEach((m) => {
      document.getElementById('mode-' + m).classList.toggle('hidden', m !== mode);
    });
  });
});

/* Formatage */
function fmtClock(ms) {
  ms = Math.max(0, ms);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function fmtChrono(ms) {
  ms = Math.max(0, ms);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const d = Math.floor((ms % 1000) / 100);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${d}` : `${pad(m)}:${pad(s)}.${d}`;
}

/* ---- Chrono ---- */
const chrono = { running: false, startTs: 0, elapsed: 0, raf: null, laps: [] };
function chronoNow() { return chrono.elapsed + (chrono.running ? performance.now() - chrono.startTs : 0); }
function chronoRender() { document.getElementById('chronoDisplay').textContent = fmtChrono(chronoNow()); }
function chronoLoop() { chronoRender(); if (chrono.running) chrono.raf = requestAnimationFrame(chronoLoop); }
function chronoToggle() {
  if (chrono.running) {
    chrono.elapsed = chronoNow(); chrono.running = false; cancelAnimationFrame(chrono.raf);
    document.getElementById('chronoStart').textContent = 'Reprendre';
  } else {
    ensureAudio(); chrono.startTs = performance.now(); chrono.running = true;
    document.getElementById('chronoStart').textContent = 'Pause';
    chronoLoop();
  }
  setAnim('chronoAnim', chrono.running);
}
function chronoReset() {
  chrono.running = false; cancelAnimationFrame(chrono.raf); chrono.elapsed = 0; chrono.laps = [];
  document.getElementById('chronoStart').textContent = 'Démarrer';
  document.getElementById('chronoLaps').innerHTML = '';
  setAnim('chronoAnim', false);
  chronoRender();
}
function chronoLap() {
  if (!chrono.running && chrono.elapsed === 0) return;
  chrono.laps.unshift(chronoNow());
  const ol = document.getElementById('chronoLaps'); ol.innerHTML = '';
  chrono.laps.forEach((lp, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>Tour ${chrono.laps.length - i}</span><span>${fmtChrono(lp)}</span>`;
    ol.appendChild(li);
  });
}
document.getElementById('chronoStart').addEventListener('click', chronoToggle);
document.getElementById('chronoLap').addEventListener('click', chronoLap);
document.getElementById('chronoReset').addEventListener('click', chronoReset);

/* ---- Minuteur ---- */
const minuteur = { running: false, endsAt: 0, remaining: 60000, interval: null, lastSec: null };
function minInputMs() {
  const m = parseInt(document.getElementById('minMinutes').value) || 0;
  const s = parseInt(document.getElementById('minSeconds').value) || 0;
  return (m * 60 + s) * 1000;
}
function minRender() { document.getElementById('minuteurDisplay').textContent = fmtClock(minuteur.remaining); }
function minTick() {
  minuteur.remaining = minuteur.endsAt - performance.now();
  if (minuteur.remaining <= 0) {
    minuteur.remaining = 0; minRender();
    clearInterval(minuteur.interval); minuteur.running = false;
    document.getElementById('minStart').textContent = 'Démarrer';
    setAnim('minAnim', false);
    beepCue('done');
    return;
  }
  const sec = Math.ceil(minuteur.remaining / 1000);
  if (sec <= 3 && sec !== minuteur.lastSec) { minuteur.lastSec = sec; beepCue('count'); }
  minRender();
}
function minToggle() {
  if (minuteur.running) {
    minuteur.remaining = minuteur.endsAt - performance.now();
    clearInterval(minuteur.interval); minuteur.running = false;
    document.getElementById('minStart').textContent = 'Reprendre';
    setAnim('minAnim', false);
    return;
  }
  ensureAudio();
  if (minuteur.remaining <= 0) minuteur.remaining = minInputMs();
  if (minuteur.remaining <= 0) return;
  minuteur.endsAt = performance.now() + minuteur.remaining;
  minuteur.lastSec = null; minuteur.running = true;
  document.getElementById('minStart').textContent = 'Pause';
  minuteur.interval = setInterval(minTick, 100);
  setAnim('minAnim', true);
}
function minReset() {
  clearInterval(minuteur.interval); minuteur.running = false;
  minuteur.remaining = minInputMs(); minuteur.lastSec = null;
  document.getElementById('minStart').textContent = 'Démarrer';
  setAnim('minAnim', false);
  minRender();
}
['minMinutes', 'minSeconds'].forEach((id) => {
  document.getElementById(id).addEventListener('input', () => {
    if (!minuteur.running) { minuteur.remaining = minInputMs(); minRender(); }
  });
});
document.getElementById('minStart').addEventListener('click', minToggle);
document.getElementById('minReset').addEventListener('click', minReset);
(function buildQuickTimers() {
  const list = [[0, 30], [1, 0], [3, 0], [5, 0], [10, 0]];
  const host = document.getElementById('quickTimers');
  list.forEach(([m, s]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s ? `${m ? m + 'm' : ''}${s}s` : `${m}m`;
    b.addEventListener('click', () => {
      document.getElementById('minMinutes').value = m;
      document.getElementById('minSeconds').value = s;
      if (!minuteur.running) { minuteur.remaining = minInputMs(); minRender(); }
    });
    host.appendChild(b);
  });
})();

/* Presets de minuteur */
const MIN_PRESETS_KEY = 'hyrox-timer-min-presets-v1';
let minPresets = loadMinPresets();
function loadMinPresets() {
  try { const a = JSON.parse(localStorage.getItem(MIN_PRESETS_KEY)); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function saveMinPresets() {
  try { localStorage.setItem(MIN_PRESETS_KEY, JSON.stringify(minPresets)); } catch (e) { /* quota */ }
}
function renderMinPresets() {
  const host = document.getElementById('minPresetList');
  host.innerHTML = '';
  if (!minPresets.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = 'Aucun preset de minuteur enregistré.';
    host.appendChild(p); return;
  }
  minPresets.forEach((pr, i) => {
    const total = (pr.m || 0) * 60 + (pr.s || 0);
    const el = document.createElement('div');
    el.className = 'preset-item';
    el.innerHTML = `<div><div class="pi-name">${escapeHtml(pr.name)}</div>
      <div class="pi-detail">${fmtClock(total * 1000)}</div></div>
      <span class="spacer"></span>
      <button class="pi-load" type="button">Charger</button>
      <button class="pi-del" type="button" aria-label="Supprimer">✕</button>`;
    el.querySelector('.pi-load').addEventListener('click', () => {
      document.getElementById('minMinutes').value = pr.m || 0;
      document.getElementById('minSeconds').value = pr.s || 0;
      if (!minuteur.running) { minuteur.remaining = minInputMs(); minRender(); }
      toast(`⏱️ Minuteur « ${pr.name} » chargé`);
    });
    el.querySelector('.pi-del').addEventListener('click', () => {
      minPresets.splice(i, 1); saveMinPresets(); renderMinPresets();
    });
    host.appendChild(el);
  });
}
document.getElementById('minSavePreset').addEventListener('click', () => {
  const name = document.getElementById('minPresetName').value.trim();
  if (!name) { toast('Donne un nom au preset'); return; }
  const m = parseInt(document.getElementById('minMinutes').value) || 0;
  const s = parseInt(document.getElementById('minSeconds').value) || 0;
  if (m === 0 && s === 0) { toast('Règle une durée avant d\'enregistrer'); return; }
  minPresets.push({ name: name, m: m, s: s });
  saveMinPresets();
  document.getElementById('minPresetName').value = '';
  renderMinPresets();
  toast('⏱️ Preset de minuteur enregistré');
});

/* ---- Intervalles ---- */
const IV_PRESETS_KEY = 'hyrox-timer-presets-v1';
let ivPresets = loadPresets();
const iv = { running: false, phases: [], idx: 0, endsAt: 0, remaining: 0, interval: null, lastSec: null };

function clampInt(id, min) {
  let v = parseInt(document.getElementById(id).value);
  if (isNaN(v)) v = min;
  return Math.max(min, v);
}
function ivReadConfig() {
  return { prep: clampInt('ivPrep', 0), work: clampInt('ivWork', 1), rest: clampInt('ivRest', 0), rounds: clampInt('ivRounds', 1) };
}
function ivBuildPhases(cfg) {
  const ph = [];
  if (cfg.prep > 0) ph.push({ type: 'prep', dur: cfg.prep, label: 'Préparation' });
  for (let r = 1; r <= cfg.rounds; r++) {
    ph.push({ type: 'work', dur: cfg.work, label: 'Effort', round: r });
    if (cfg.rest > 0 && r < cfg.rounds) ph.push({ type: 'rest', dur: cfg.rest, label: 'Repos', round: r });
  }
  return ph;
}
function ivSetClass(type) {
  const disp = document.getElementById('ivDisplay');
  const name = document.getElementById('ivPhase');
  ['phase-prep', 'phase-work', 'phase-rest', 'phase-done'].forEach((c) => { disp.classList.remove(c); name.classList.remove(c); });
  if (type) { disp.classList.add('phase-' + type); name.classList.add('phase-' + type); }
}
function ivRender() { document.getElementById('ivDisplay').textContent = fmtClock(iv.remaining); }
function ivStartPhase() {
  const p = iv.phases[iv.idx];
  iv.remaining = p.dur * 1000;
  iv.endsAt = performance.now() + iv.remaining;
  iv.lastSec = null;
  document.getElementById('ivPhase').textContent = p.label;
  ivSetClass(p.type);
  const rounds = ivReadConfig().rounds;
  document.getElementById('ivRound').textContent = p.round ? `Tour ${p.round}/${rounds}` : 'Prépare-toi';
  beepCue(p.type);
  ivRender();
}
function ivTick() {
  iv.remaining = iv.endsAt - performance.now();
  const sec = Math.ceil(iv.remaining / 1000);
  if (iv.remaining > 0 && sec <= 3 && sec !== iv.lastSec) { iv.lastSec = sec; beepCue('count'); }
  if (iv.remaining <= 0) {
    iv.idx++;
    if (iv.idx >= iv.phases.length) { ivFinish(); return; }
    ivStartPhase();
    return;
  }
  ivRender();
}
function ivToggle() {
  if (iv.running) { // pause
    iv.remaining = iv.endsAt - performance.now();
    clearInterval(iv.interval); iv.running = false;
    document.getElementById('ivStart').textContent = 'Reprendre';
    return;
  }
  ensureAudio();
  if (iv.phases.length === 0 || iv.idx >= iv.phases.length) { // départ neuf
    iv.phases = ivBuildPhases(ivReadConfig()); iv.idx = 0;
    if (iv.phases.length === 0) return;
    iv.running = true;
    document.getElementById('ivStart').textContent = 'Pause';
    iv.interval = setInterval(ivTick, 100);
    ivStartPhase();
    return;
  }
  // reprise après pause
  iv.endsAt = performance.now() + iv.remaining;
  iv.running = true;
  document.getElementById('ivStart').textContent = 'Pause';
  iv.interval = setInterval(ivTick, 100);
}
function ivFinish() {
  clearInterval(iv.interval); iv.running = false; iv.phases = []; iv.idx = 0; iv.remaining = 0;
  document.getElementById('ivStart').textContent = 'Démarrer';
  document.getElementById('ivPhase').textContent = 'Terminé 💪';
  ivSetClass('done');
  document.getElementById('ivDisplay').textContent = '00:00';
  document.getElementById('ivRound').textContent = 'Séance finie';
  beepCue('done');
}
function ivStop() {
  clearInterval(iv.interval); iv.running = false; iv.phases = []; iv.idx = 0; iv.remaining = 0; iv.lastSec = null;
  document.getElementById('ivStart').textContent = 'Démarrer';
  document.getElementById('ivPhase').textContent = 'Prêt';
  ivSetClass(null);
  document.getElementById('ivDisplay').textContent = '00:00';
  document.getElementById('ivRound').textContent = '—';
}
document.getElementById('ivStart').addEventListener('click', ivToggle);
document.getElementById('ivStop').addEventListener('click', ivStop);

function loadPresets() {
  try { const a = JSON.parse(localStorage.getItem(IV_PRESETS_KEY)); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function savePresets() {
  try { localStorage.setItem(IV_PRESETS_KEY, JSON.stringify(ivPresets)); } catch (e) { /* quota */ }
}
function renderPresets() {
  const host = document.getElementById('presetList');
  host.innerHTML = '';
  if (!ivPresets.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = 'Aucun preset enregistré.';
    host.appendChild(p); return;
  }
  ivPresets.forEach((pr, i) => {
    const el = document.createElement('div');
    el.className = 'preset-item';
    el.innerHTML = `<div><div class="pi-name">${escapeHtml(pr.name)}</div>
      <div class="pi-detail">Prép ${pr.prep}s · Effort ${pr.work}s · Repos ${pr.rest}s · ${pr.rounds} tours</div></div>
      <span class="spacer"></span>
      <button class="pi-load" type="button">Charger</button>
      <button class="pi-del" type="button" aria-label="Supprimer">✕</button>`;
    el.querySelector('.pi-load').addEventListener('click', () => {
      document.getElementById('ivPrep').value = pr.prep;
      document.getElementById('ivWork').value = pr.work;
      document.getElementById('ivRest').value = pr.rest;
      document.getElementById('ivRounds').value = pr.rounds;
      toast(`⏱️ Preset « ${pr.name} » chargé`);
    });
    el.querySelector('.pi-del').addEventListener('click', () => {
      ivPresets.splice(i, 1); savePresets(); renderPresets();
    });
    host.appendChild(el);
  });
}
document.getElementById('ivSavePreset').addEventListener('click', () => {
  const name = document.getElementById('ivPresetName').value.trim();
  if (!name) { toast('Donne un nom au preset'); return; }
  ivPresets.push(Object.assign({ name: name }, ivReadConfig()));
  savePresets();
  document.getElementById('ivPresetName').value = '';
  renderPresets();
  toast('⏱️ Preset enregistré');
});

/* Initialisation des affichages timer */
minReset();
renderPresets();
renderMinPresets();

/* -------------------------------------------------------------------------
   14. Plan d'entraînement
   ------------------------------------------------------------------------- */
const PLAN_KEY = 'hyrox-plan-v1';
const MUSCU_IDS = ['burpees', 'wallballs', 'fentes', 'gainage'];

/* Archétypes de séances. Chaque séance a une dominante différente : on ne
   répartit pas le volume à parts égales, on le concentre là où la séance a un
   objectif précis (puissance, jambes, spécifique course...). Les poids sont
   normalisés, donc le total hebdo reste exactement celui de l'objectif. */
const MUSCU_SESSIONS = [
  { name: 'Puissance', emoji: '💥', rpe: 'RPE 8 · qualité',
    w: { burpees: 0.8, wallballs: 1.4, fentes: 0.8, gainage: 1 },
    tip: 'Séries courtes et explosives, récup complète (90 s). La qualité prime sur la fatigue.' },
  { name: 'Jambes & Grip', emoji: '🦵', rpe: 'RPE 7 · volume',
    w: { burpees: 0.8, wallballs: 0.8, fentes: 1.5, gainage: 1 },
    tip: 'Fentes en blocs de 20 m, gainage entre les blocs. Amplitude complète avant la charge.' },
  { name: 'Simulation Hyrox', emoji: '🏁', rpe: 'RPE 9 · spécifique',
    w: { burpees: 1.4, wallballs: 1, fentes: 0.9, gainage: 1 },
    tip: 'Enchaîne station + 400 m de course sans pause : apprends à courir sur jambes fatiguées.' },
  { name: 'Capacité', emoji: '🔋', rpe: 'RPE 7 · continu',
    w: { burpees: 1, wallballs: 1, fentes: 1, gainage: 1 },
    tip: 'Rythme régulier, récup courte (30–45 s). Objectif : tenir le volume proprement.' },
];

/* Volume max de fractionné par séance (km) : au-delà, le risque de blessure
   grimpe nettement pour un gain marginal. Le surplus part sur les autres sorties. */
const FRACTIONNE_MAX_KM = 4;

const COURSE_SESSIONS = [
  { name: 'Sortie longue', rpe: 'RPE 5–6 · facile', w: 1.6,
    tip: 'Allure facile : tu dois pouvoir parler en courant. C’est le socle de ton endurance.' },
  { name: 'Fractionné', rpe: 'RPE 9 · intense', w: 0.65, cap: FRACTIONNE_MAX_KM,
    tip: `Ex. 8×400 m rapides, 1 min de récup. Plafonné à ${FRACTIONNE_MAX_KM} km de qualité pour éviter la blessure.` },
  { name: 'Tempo', rpe: 'RPE 7–8 · soutenu', w: 1.0,
    tip: 'Allure soutenue et tenue, proche de ton rythme de course visé en compétition.' },
  { name: 'Footing récup', rpe: 'RPE 4–5 · récup', w: 0.8,
    tip: 'Très facile, jambes légères. Cette séance sert à récupérer, pas à performer.' },
];

/**
 * Répartit le kilométrage entre les sorties en respectant les plafonds
 * (ex. fractionné ≤ 4 km) : le surplus est redistribué sur les sorties
 * non plafonnées, proportionnellement à leur poids.
 */
function distributeCourse(total, profiles) {
  const n = profiles.length;
  if (!n) return [];
  const alloc = new Array(n).fill(0);
  const locked = new Array(n).fill(false);
  for (let pass = 0; pass <= n; pass++) {
    let wSum = 0, lockedSum = 0;
    for (let i = 0; i < n; i++) {
      if (locked[i]) lockedSum += alloc[i]; else wSum += profiles[i].w;
    }
    if (wSum <= 0) break;
    const rest = Math.max(0, total - lockedSum);
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (locked[i]) continue;
      alloc[i] = rest * profiles[i].w / wSum;
      const cap = profiles[i].cap;
      if (cap != null && alloc[i] > cap) { alloc[i] = cap; locked[i] = true; changed = true; }
    }
    if (!changed) break;
  }
  const out = alloc.map((v) => Math.round(v * 10) / 10);
  // La dernière sortie non plafonnée absorbe l'arrondi pour tomber juste.
  let lastOpen = -1;
  for (let i = n - 1; i >= 0; i--) if (!locked[i]) { lastOpen = i; break; }
  if (lastOpen >= 0) {
    const others = out.reduce((s, v, i) => s + (i === lastOpen ? 0 : v), 0);
    out[lastOpen] = Math.max(0, Math.round((total - others) * 10) / 10);
  }
  return out;
}

/**
 * Répartit un volume total selon des poids, en garantissant que la somme
 * des valeurs affichées vaut exactement le total (la dernière absorbe le reste).
 */
function distribute(total, weights, decimals) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const out = [];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const raw = total * weights[i] / sum;
    const v = decimals ? Math.round(raw * 10) / 10 : roundNice(raw);
    out.push(v); acc += v;
  }
  let last = Math.max(0, total - acc);
  last = decimals ? Math.round(last * 10) / 10 : Math.round(last);
  out.push(last);
  return out;
}

const WEEK_PLAN_KEY = 'hyrox-week-plan-v1';
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/* Charge (1–10) utilisée pour espacer les séances dures dans la semaine. */
const CHARGE = {
  'Puissance': 8, 'Jambes & Grip': 7, 'Simulation Hyrox': 9, 'Capacité': 6, 'Séance type': 7,
  'Sortie longue': 7, 'Fractionné': 9, 'Tempo': 7, 'Footing récup': 3, 'Course': 6,
};

/* Moments de la journée (modifiables sur chaque carte). */
const PARTS = ['Matin', 'Midi', 'Soir'];
const PART_EMOJI = { 'Matin': '🌅', 'Midi': '☀️', 'Soir': '🌙' };
function partIndex(p) { const i = PARTS.indexOf(p); return i === -1 ? 0 : i; }
function sortSessions(list) {
  return list.sort((a, b) => (a.day - b.day) || (partIndex(a.part) - partIndex(b.part)));
}

/* Organisation par défaut : deux séances le même jour (matin + soir) pour
   libérer un maximum de jours de repos complets. Tout reste modifiable. */
const PLAN_LAYOUT = {
  id: 'double', name: 'Doubles séances', icon: '⚡',
  moment: (d, slot) => (slot === 0 ? 'Matin' : 'Soir'),
};

function planExercise(id) { return EXERCISES.find((e) => e.id === id); }
function loadPlan() { try { return JSON.parse(localStorage.getItem(PLAN_KEY)) || {}; } catch (e) { return {}; } }
function savePlan(p) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {} }
/** Le plan adopté est conçu pour tourner en boucle : on le reporte sur la
    semaine en cours tant que l'utilisateur ne l'a pas vidé. */
function loadWeekPlan() {
  try {
    const p = JSON.parse(localStorage.getItem(WEEK_PLAN_KEY));
    if (!p) return null;
    if (typeof STATE !== 'undefined' && STATE && p.week !== STATE.currentWeek) {
      p.week = STATE.currentWeek;
      saveWeekPlan(p);
    }
    return p;
  } catch (e) { return null; }
}
function saveWeekPlan(p) { try { localStorage.setItem(WEEK_PLAN_KEY, JSON.stringify(p)); } catch (e) {} }

/** Créneaux (jour + rang dans la journée) pour n séances : 2 par jour. */
function slotsFor(n) {
  if (n <= 0) return [];
  const base = [0, 2, 4, 6, 1, 3, 5];
  const days = base.slice(0, Math.ceil(n / 2)).sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < n; k++) out.push({ day: days[Math.floor(k / 2)], slot: k % 2 });
  return out;
}

/** Alterne muscu / course pour éviter deux séances du même type d'affilée. */
function interleaveByKind(sessions) {
  const m = sessions.filter((s) => s.kind === 'muscu');
  const c = sessions.filter((s) => s.kind === 'course');
  const out = [];
  const [long, short] = m.length >= c.length ? [m, c] : [c, m];
  while (long.length || short.length) {
    if (long.length) out.push(long.shift());
    if (short.length) out.push(short.shift());
  }
  return out;
}

/**
 * Pénalise un enchaînement : deux séances dures collées, deux fois le même
 * type d'affilée, et le passage d'une semaine à l'autre (dimanche → lundi)
 * pour que le plan puisse tourner en boucle chaque semaine.
 */
function schedulePenalty(order, slots) {
  let p = 0;
  for (let i = 1; i < order.length; i++) {
    const gap = slots[i].day - slots[i - 1].day;
    const a = order[i - 1], b = order[i];
    if (gap <= 1) {
      if (a.charge >= 8 && b.charge >= 8) p += 10;
      if (a.kind === b.kind) p += 3;
      if (gap === 0) p += (a.charge + b.charge) / 4;
    }
  }
  if (order.length > 1) {
    const wrap = (6 - slots[slots.length - 1].day) + slots[0].day; // dimanche → lundi suivant
    if (wrap <= 1 && order[order.length - 1].charge >= 8 && order[0].charge >= 8) p += 8;
  }
  return p;
}

/** Place les séances sur la semaine et optimise l'enchaînement par échanges. */
function schedulePlan(sessions) {
  const slots = slotsFor(sessions.length);
  let best = interleaveByKind(sessions);
  let bestP = schedulePenalty(best, slots);
  for (let pass = 0; pass < 40 && bestP > 0; pass++) {
    let improved = false;
    for (let i = 0; i < best.length && !improved; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = best.slice();
        const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
        const p = schedulePenalty(cand, slots);
        if (p < bestP) { best = cand; bestP = p; improved = true; break; }
      }
    }
    if (!improved) break;
  }
  return best.map((s, i) => Object.assign({}, s, {
    day: slots[i].day,
    part: PLAN_LAYOUT.moment(slots[i].day, slots[i].slot, s.charge),
  }));
}

/** Arrondit un volume à une valeur "propre" selon son ordre de grandeur. */
function roundNice(v) {
  if (v <= 20) return Math.round(v);
  if (v < 100) return Math.round(v / 5) * 5;
  return Math.round(v / 10) * 10;
}

function generatePlan() {
  const target = parseInt(document.getElementById('planTarget').value) || 1;
  let nM = parseInt(document.getElementById('planMuscu').value); if (isNaN(nM) || nM < 0) nM = 0; nM = Math.min(7, nM);
  let nC = parseInt(document.getElementById('planCourse').value); if (isNaN(nC) || nC < 0) nC = 0; nC = Math.min(7, nC);
  const equal = document.getElementById('planEqual').checked;
  document.getElementById('planMuscu').value = nM;
  document.getElementById('planCourse').value = nC;
  savePlan({ target: target, muscu: nM, course: nC, equal: equal, generated: true });

  const weekly = {};
  EXERCISES.forEach((ex) => { weekly[ex.id] = ex.tiers[target]; });

  // Récapitulatif de l'objectif
  let note = '';
  if (nM === 0) note += 'Ajoute au moins 1 séance muscu pour répartir burpees, wallballs, fentes et gainage. ';
  if (nC === 0 && weekly.course > 0) note += 'Ajoute au moins 1 séance course pour la distance visée.';
  renderPlanSummary(target, equal, note);

  // --- Construction des séances (contenu identique dans les 4 variantes) ---
  const sessions = [];

  const mProfiles = [];
  for (let s = 0; s < nM; s++) {
    mProfiles.push(equal
      ? { name: 'Séance type', emoji: '🏋️', rpe: 'RPE 7 · continu',
          w: { burpees: 1, wallballs: 1, fentes: 1, gainage: 1 },
          tip: 'Rythme régulier, récup courte (30–45 s). Volume identique à chaque séance.' }
      : MUSCU_SESSIONS[s % MUSCU_SESSIONS.length]);
  }
  const mSplit = {};
  MUSCU_IDS.forEach((id) => {
    mSplit[id] = distribute(weekly[id], mProfiles.map((p) => p.w[id]), false);
  });
  mProfiles.forEach((p, s) => {
    sessions.push({
      kind: 'muscu', name: p.name, emoji: p.emoji, rpe: p.rpe, tip: p.tip,
      charge: CHARGE[p.name] || 7,
      items: MUSCU_IDS.map((id) => {
        const ex = planExercise(id);
        return { id: id, label: ex.name, emoji: ex.emoji, unit: ex.unit,
                 value: mSplit[id][s], isTime: id === 'gainage', decimals: false };
      }),
    });
  });

  const cProfiles = [];
  for (let s = 0; s < nC; s++) {
    cProfiles.push(equal
      ? { name: 'Course', rpe: 'RPE 6–7 · régulier', w: 1,
          tip: 'Allure régulière. Distance identique à chaque séance.' }
      : COURSE_SESSIONS[s % COURSE_SESSIONS.length]);
  }
  const cSplit = distributeCourse(weekly.course, cProfiles);
  cProfiles.forEach((p, s) => {
    sessions.push({
      kind: 'course', name: p.name, emoji: '🏃', rpe: p.rpe, tip: p.tip,
      charge: CHARGE[p.name] || 6, cap: p.cap != null ? p.cap : null,
      items: [{ id: 'course', label: 'Distance', emoji: '🐆', unit: 'km',
                value: cSplit[s], isTime: false, decimals: true }],
    });
  });

  PLAN_STATE = {
    target: target,
    weekly: weekly,
    sessions: sortSessions(schedulePlan(sessions)),
  };
  renderPlanCards();
}

let PLAN_STATE = null;

/** Encart d'objectif : volume hebdo visé + méthode de répartition. */
function renderPlanSummary(target, equal, note) {
  const goals = EXERCISES.map((ex) => {
    const goal = ex.tiers[target];
    const v = ex.id === 'gainage' ? fmtSeconds(goal) : `${fmt(ex, goal)} ${ex.unit}`;
    return `<span class="ps-goal"><span class="g-em">${ex.emoji}</span>${ex.name} : ${v}</span>`;
  }).join('');
  const method = equal
    ? 'Répartition égale : chaque séance est identique. Simple, mais moins efficace pour progresser.'
    : 'Répartition intelligente : chaque séance a une dominante (puissance, jambes, spécifique) et la course est polarisée — une sortie longue facile, un fractionné court et intense, un tempo. Jour, moment et valeurs restent modifiables.';
  document.getElementById('planSummary').innerHTML = `
    <div class="ps-card">
      <div class="ps-title">Objectif : <strong>${LEVELS[target].name}</strong> — volume hebdo à viser</div>
      <div class="ps-goals">${goals}</div>
      <div class="ps-method">${method}</div>
      ${note ? `<div class="ps-note">⚠️ ${note}</div>` : ''}
    </div>`;
}

function daySummary(sessions) {
  const days = [];
  sessions.forEach((s) => { if (days.indexOf(s.day) === -1) days.push(s.day); });
  days.sort((a, b) => a - b);
  const rest = 7 - days.length;
  return `${days.map((d) => DAYS[d].slice(0, 3)).join(' · ')} — ${rest} jour${rest > 1 ? 's' : ''} de repos`;
}

/** Affiche les cartes du plan : jour, moment, valeurs et type tous éditables. */
function renderPlanCards() {
  if (!PLAN_STATE) return;
  const v = PLAN_STATE;
  sortSessions(v.sessions);
  const host = document.getElementById('planCards');
  host.innerHTML = '';

  v.sessions.forEach((s, si) => {
    const items = s.items.map((it, ii) => `
      <li>
        <span class="pc-ex">${it.emoji} ${it.label}</span>
        <span class="pc-edit">
          <input type="number" min="0" step="${it.decimals ? '0.1' : '1'}" value="${it.value}"
                 data-s="${si}" data-i="${ii}" aria-label="${it.label}" />
          <span class="pc-unit">${it.isTime ? 's' : it.unit}</span>
        </span>
      </li>`).join('');
    // Sélecteur de type pour les séances de course
    let typeSel = '';
    if (s.kind === 'course') {
      const names = COURSE_SESSIONS.map((c) => c.name);
      const opts = (names.indexOf(s.name) === -1 ? [s.name] : []).concat(names);
      typeSel = `<div class="pc-type">
        <label>Type de séance</label>
        <select data-s="${si}">${opts.map((n) =>
          `<option value="${escapeHtml(n)}"${n === s.name ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select>
      </div>`;
    }

    const card = document.createElement('div');
    card.className = 'plan-card ' + s.kind;
    card.innerHTML = `
      <div class="pc-when">
        <select class="pc-daysel" data-s="${si}" aria-label="Jour">
          ${DAYS.map((d, di) => `<option value="${di}"${di === s.day ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
        <select class="pc-partsel" data-s="${si}" aria-label="Moment">
          ${PARTS.map((p) => `<option value="${p}"${p === s.part ? ' selected' : ''}>${PART_EMOJI[p]} ${p}</option>`).join('')}
        </select>
      </div>
      <div class="pc-head">
        <div class="pc-emoji">${s.emoji}</div>
        <div><div class="pc-kind">${s.kind === 'muscu' ? 'Muscu' : 'Course'}</div>
          <div class="pc-title">${escapeHtml(s.name)}<span class="pc-sub">${s.rpe}</span></div></div>
      </div>
      ${typeSel}
      <ul class="pc-list">${items}</ul>
      <div class="pc-tip">${s.tip}</div>`;

    card.querySelectorAll('.pc-edit input').forEach((inp) => {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('change', () => {
        const sess = v.sessions[+inp.dataset.s];
        const it = sess.items[+inp.dataset.i];
        let val = parseFloat(inp.value);
        if (isNaN(val) || val < 0) val = 0;
        val = it.decimals ? Math.round(val * 10) / 10 : Math.round(val);
        if (sess.kind === 'course' && sess.cap != null && val > sess.cap) {
          val = sess.cap;
          toast(`⚠️ Fractionné plafonné à ${sess.cap} km pour éviter la blessure`);
        }
        it.value = val;
        inp.value = val;
        renderPlanTotals();
      });
    });

    const daySel = card.querySelector('.pc-daysel');
    daySel.addEventListener('change', () => {
      v.sessions[+daySel.dataset.s].day = parseInt(daySel.value, 10);
      renderPlanCards();
    });
    const partSel = card.querySelector('.pc-partsel');
    partSel.addEventListener('change', () => {
      v.sessions[+partSel.dataset.s].part = partSel.value;
      renderPlanCards();
    });

    const sel = card.querySelector('.pc-type select');
    if (sel) {
      sel.addEventListener('change', () => {
        const sess = v.sessions[+sel.dataset.s];
        const prof = COURSE_SESSIONS.find((c) => c.name === sel.value);
        if (!prof) return;
        sess.name = prof.name;
        sess.rpe = prof.rpe;
        sess.tip = prof.tip;
        sess.charge = CHARGE[prof.name] || 6;
        sess.cap = prof.cap != null ? prof.cap : null;
        if (sess.cap != null && sess.items[0].value > sess.cap) {
          sess.items[0].value = sess.cap;
          toast(`⚠️ Distance ramenée à ${sess.cap} km (plafond fractionné)`);
        }
        renderPlanCards();
      });
    }

    host.appendChild(card);
  });

  document.getElementById('planAdoptBar').classList.toggle('hidden', v.sessions.length === 0);
  renderPlanTotals();
}

/** Récapitulatif des totaux réellement programmés vs objectif. */
function renderPlanTotals() {
  const host = document.getElementById('planTotals');
  if (!PLAN_STATE) { host.classList.add('hidden'); return; }
  const v = PLAN_STATE;
  if (!v || !v.sessions.length) { host.classList.add('hidden'); return; }

  const totals = {};
  EXERCISES.forEach((ex) => { totals[ex.id] = 0; });
  v.sessions.forEach((s) => s.items.forEach((it) => {
    totals[it.id] = (totals[it.id] || 0) + (it.value || 0);
  }));

  let short = 0;
  const rows = EXERCISES.map((ex) => {
    const got = ex.decimals ? Math.round(totals[ex.id] * 10) / 10 : Math.round(totals[ex.id]);
    const goal = PLAN_STATE.weekly[ex.id];
    const ok = got >= goal;
    if (!ok) short++;
    const f = (x) => (ex.id === 'gainage' ? fmtSeconds(x) : `${fmt(ex, x)} ${ex.unit}`);
    const diff = ok ? '' : ` <span class="pt-diff">−${f(Math.round((goal - got) * 10) / 10)}</span>`;
    return `<div class="pt-row ${ok ? 'ok' : 'under'}">
      <span class="pt-ex">${ex.emoji} ${ex.name}</span>
      <span class="pt-val">${f(got)} <span class="pt-goal">/ ${f(goal)}</span> ${ok ? '✓' : ''}${diff}</span>
    </div>`;
  }).join('');

  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="pt-card">
      <div class="pt-title">Total programmé cette semaine</div>
      ${rows}
      <div class="pt-note ${short ? 'under' : 'ok'}">${short
        ? `⚠️ ${short} catégorie${short > 1 ? 's' : ''} sous l'objectif <strong>${LEVELS[PLAN_STATE.target].name}</strong> — ajuste les valeurs ou ajoute une séance.`
        : `✅ Objectif <strong>${LEVELS[PLAN_STATE.target].name}</strong> couvert dans toutes les catégories.`}</div>
    </div>`;
}

/* ---- Adoption du plan → agenda ---- */
document.getElementById('planAdopt').addEventListener('click', () => {
  if (!PLAN_STATE) return;
  const v = PLAN_STATE;
  saveWeekPlan({
    week: STATE.currentWeek,
    variantId: PLAN_LAYOUT.id,
    variantName: v.name || ('Objectif ' + LEVELS[v.target].name),
    icon: PLAN_LAYOUT.icon,
    sessions: JSON.parse(JSON.stringify(v.sessions)),
  });
  renderCalendar();
  toast('📅 Plan adopté — retrouve-le dans l’agenda');
  toggleCalendar(true);
});

/* ---- Bibliothèque de plans enregistrés ---- */
const PLAN_LIB_KEY = 'hyrox-plan-library-v1';
function loadLibrary() {
  try { const a = JSON.parse(localStorage.getItem(PLAN_LIB_KEY)); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function saveLibrary(lib) {
  try { localStorage.setItem(PLAN_LIB_KEY, JSON.stringify(lib)); return true; } catch (e) { return false; }
}

function renderLibrary() {
  const host = document.getElementById('planLibrary');
  const lib = loadLibrary();
  host.innerHTML = '';
  if (!lib.length) {
    host.innerHTML = '<p class="empty">Aucun plan enregistré. Génère un plan, ajuste-le, puis enregistre-le pour le recharger les semaines suivantes.</p>';
    return;
  }
  lib.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'preset-item';
    el.innerHTML = `<div><div class="pi-name">${escapeHtml(p.name)}</div>
      <div class="pi-detail">Objectif ${LEVELS[p.target] ? LEVELS[p.target].name : '?'} · ${p.sessions.length} séance${p.sessions.length > 1 ? 's' : ''} · ${daySummary(p.sessions)}</div></div>
      <span class="spacer"></span>
      <button class="pi-load" type="button">Charger</button>
      <button class="pi-del" type="button" aria-label="Supprimer">✕</button>`;
    el.querySelector('.pi-load').addEventListener('click', () => {
      const weekly = {};
      EXERCISES.forEach((ex) => { weekly[ex.id] = ex.tiers[p.target]; });
      PLAN_STATE = {
        target: p.target, weekly: weekly, name: p.name,
        sessions: JSON.parse(JSON.stringify(p.sessions)),
      };
      document.getElementById('planTarget').value = p.target;
      renderPlanSummary(p.target, false);
      renderPlanCards();
      document.getElementById('planCards').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(`📋 Plan « ${p.name} » chargé`);
    });
    el.querySelector('.pi-del').addEventListener('click', () => {
      if (!confirm(`Supprimer le plan « ${p.name} » ?`)) return;
      const cur = loadLibrary(); cur.splice(i, 1); saveLibrary(cur); renderLibrary();
    });
    host.appendChild(el);
  });
}

document.getElementById('planSave').addEventListener('click', () => {
  if (!PLAN_STATE || !PLAN_STATE.sessions.length) { toast('Génère d’abord un plan'); return; }
  const input = document.getElementById('planSaveName');
  const name = input.value.trim();
  if (!name) { toast('Donne un nom à ton plan'); return; }
  const lib = loadLibrary();
  const entry = {
    name: name, target: PLAN_STATE.target,
    sessions: JSON.parse(JSON.stringify(PLAN_STATE.sessions)),
  };
  const existing = lib.findIndex((p) => p.name === name);
  if (existing >= 0) {
    if (!confirm(`Un plan « ${name} » existe déjà. Le remplacer ?`)) return;
    lib[existing] = entry;
  } else {
    lib.push(entry);
  }
  if (!saveLibrary(lib)) { toast('⚠️ Stockage plein'); return; }
  PLAN_STATE.name = name;
  input.value = '';
  renderLibrary();
  toast('💾 Plan enregistré');
});

/* ---- Agenda ---- */
function renderCalendar() {
  const host = document.getElementById('calendarBody');
  const actions = document.getElementById('calendarActions');
  const plan = loadWeekPlan();
  host.innerHTML = '';

  if (!plan || !plan.sessions || !plan.sessions.length) {
    actions.classList.add('hidden');
    host.innerHTML = `<p class="empty cal-empty">Aucun plan adopté pour cette semaine.<br>
      Va dans l'onglet <strong>Plan</strong>, génère des suggestions et adopte celle qui te convient.</p>`;
    return;
  }
  actions.classList.remove('hidden');

  const head = document.createElement('div');
  head.className = 'cal-plan-head';
  head.innerHTML = `<span class="vp-icon">${plan.icon || '📅'}</span>
    <div><div class="cal-plan-name">${escapeHtml(plan.variantName || 'Mon plan')}</div>
    <div class="muted">${plan.sessions.length} séance${plan.sessions.length > 1 ? 's' : ''} cette semaine</div></div>`;
  host.appendChild(head);

  const todayIdx = (new Date().getDay() + 6) % 7;
  for (let d = 0; d < 7; d++) {
    const daySessions = plan.sessions.filter((s) => s.day === d);
    const row = document.createElement('div');
    row.className = 'cal-day' + (d === todayIdx ? ' today' : '') + (daySessions.length ? '' : ' rest');
    let inner = `<div class="cal-dayname">${DAYS[d]}${d === todayIdx ? ' <span class="cal-today">aujourd\'hui</span>' : ''}</div>`;
    if (!daySessions.length) {
      inner += '<div class="cal-rest">😴 Repos</div>';
    } else {
      inner += daySessions.map((s) => `
        <div class="cal-session ${s.kind}">
          <div class="cs-top">
            <span class="cs-part">${(PART_EMOJI[s.part] || '🌙')} ${escapeHtml(s.part || 'Soir')}</span>
            <span class="cs-name">${s.emoji} ${escapeHtml(s.name)}</span>
            <span class="cs-rpe">${escapeHtml(s.rpe)}</span>
          </div>
          <div class="cs-items">${s.items.map((it) =>
            `<span class="cs-item">${it.emoji} ${it.isTime ? fmtSeconds(it.value) : it.value + ' ' + it.unit}</span>`).join('')}</div>
        </div>`).join('');
    }
    row.innerHTML = inner;
    host.appendChild(row);
  }
}

function toggleCalendar(open) {
  const c = document.getElementById('calendarView');
  const show = open != null ? open : c.classList.contains('hidden');
  if (show) renderCalendar();
  c.classList.toggle('hidden', !show);
  document.getElementById('tabbar').style.display = show ? 'none' : '';
  document.querySelectorAll('.page').forEach((p) => { p.style.visibility = show ? 'hidden' : ''; });
  document.querySelector('.topbar').style.display = show ? 'none' : '';
  if (show) window.scrollTo(0, 0);
}
document.getElementById('calendarToggle').addEventListener('click', () => toggleCalendar(true));
document.getElementById('calendarClose').addEventListener('click', () => toggleCalendar(false));
document.getElementById('planClear').addEventListener('click', () => {
  if (!confirm('Vider le plan de la semaine ? Tu pourras en générer un nouveau dans l’onglet Plan.')) return;
  localStorage.removeItem(WEEK_PLAN_KEY);
  renderCalendar();
  toast('🧹 Plan de la semaine vidé');
});

function initPlanUI() {
  const sel = document.getElementById('planTarget');
  sel.innerHTML = '';
  for (let i = 1; i < LEVELS.length; i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = LEVELS[i].name;
    sel.appendChild(o);
  }
  const saved = loadPlan();
  sel.value = saved.target || 3;
  document.getElementById('planMuscu').value = saved.muscu != null ? saved.muscu : 3;
  document.getElementById('planCourse').value = saved.course != null ? saved.course : 2;
  document.getElementById('planEqual').checked = !!saved.equal;
  document.getElementById('planGenerate').addEventListener('click', generatePlan);
  renderLibrary();
  if (saved.generated) generatePlan();
}
initPlanUI();

/* -------------------------------------------------------------------------
   14bis. Simulateur de course Hyrox
   Format officiel : 8 × (1 km de course + 1 station), plus le temps de
   transition (roxzone) entre chaque bloc.
   ------------------------------------------------------------------------- */
const SIM_KEY = 'hyrox-sim-v1';

const HYROX_STATIONS = [
  { name: 'SkiErg',            detail: '1000 m',    emoji: '🎿', t: [225, 270, 300, 360] },
  { name: 'Sled Push',         detail: '50 m',      emoji: '🛷', t: [120, 180, 240, 330] },
  { name: 'Sled Pull',         detail: '50 m',      emoji: '🪢', t: [150, 210, 270, 360] },
  { name: 'Burpee Broad Jump', detail: '80 m',      emoji: '🤸', t: [210, 300, 390, 540] },
  { name: 'Rowing',            detail: '1000 m',    emoji: '🚣', t: [220, 260, 300, 360] },
  { name: 'Farmers Carry',     detail: '200 m',     emoji: '🧳', t: [105, 135, 165, 210] },
  { name: 'Sandbag Lunges',    detail: '100 m',     emoji: '🎒', t: [200, 270, 330, 420] },
  { name: 'Wall Balls',        detail: '100 reps',  emoji: '🏐', t: [240, 330, 420, 540] },
];

const SIM_PRESETS = [
  { name: 'Élite (~1 h 00)',          idx: 0, pace: 255, rox: 20 },
  { name: 'Compétiteur (~1 h 15)',    idx: 1, pace: 300, rox: 30 },
  { name: 'Intermédiaire (~1 h 30)',  idx: 2, pace: 345, rox: 40 },
  { name: 'Découverte (~1 h 50)',     idx: 3, pace: 405, rox: 60 },
];

/** Accepte "5:30", "5 30", "330" (=330 s) ou "5.30" et renvoie des secondes. */
function parseTime(str) {
  if (typeof str === 'number') return Math.max(0, Math.round(str));
  const s = String(str || '').trim().replace(/[.,\s]/g, ':');
  if (!s) return 0;
  const parts = s.split(':').filter((p) => p !== '').map((p) => parseInt(p, 10) || 0);
  if (!parts.length) return 0;
  if (parts.length === 1) return Math.max(0, parts[0]);
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
}
function fmtMMSS(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtHMS(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

let SIM = null;
function simDefaults(presetIdx) {
  // Attention : l'index 0 (Élite) est falsy — on borne explicitement.
  let i = parseInt(presetIdx, 10);
  if (isNaN(i)) i = 1;
  i = Math.max(0, Math.min(SIM_PRESETS.length - 1, i));
  const p = SIM_PRESETS[i];
  return {
    preset: i,
    runs: new Array(8).fill(p.pace),
    stations: HYROX_STATIONS.map((s) => s.t[p.idx]),
    rox: p.rox,
  };
}
function loadSim() {
  try {
    const s = JSON.parse(localStorage.getItem(SIM_KEY));
    if (s && Array.isArray(s.runs) && s.runs.length === 8 && Array.isArray(s.stations) && s.stations.length === 8) return s;
  } catch (e) { /* ignore */ }
  return simDefaults(1);
}
function saveSim() { try { localStorage.setItem(SIM_KEY, JSON.stringify(SIM)); } catch (e) {} }

function simVerdict(total) {
  if (total <= 0) return { label: '—', cls: '' };
  if (total < 3900) return { label: '🔥 Niveau élite', cls: 'v-elite' };
  if (total < 4800) return { label: '💪 Niveau compétiteur', cls: 'v-comp' };
  if (total < 5700) return { label: '⚡ Niveau intermédiaire', cls: 'v-inter' };
  return { label: '🚀 Niveau découverte', cls: 'v-dec' };
}

function renderSim() {
  const totalRun = SIM.runs.reduce((a, b) => a + b, 0);
  const totalSt = SIM.stations.reduce((a, b) => a + b, 0);
  const totalRox = SIM.rox * 8;
  const total = totalRun + totalSt + totalRox;
  const pct = (x) => (total ? (x / total * 100) : 0);

  document.getElementById('simTotal').textContent = fmtHMS(total);
  const v = simVerdict(total);
  const verdict = document.getElementById('simVerdict');
  verdict.textContent = v.label;
  verdict.className = 'sim-verdict ' + v.cls;

  document.getElementById('simBar').innerHTML = `
    <div class="sb-seg sb-run" style="width:${pct(totalRun)}%"></div>
    <div class="sb-seg sb-st" style="width:${pct(totalSt)}%"></div>
    <div class="sb-seg sb-rox" style="width:${pct(totalRox)}%"></div>`;
  document.getElementById('simLegend').innerHTML = `
    <span><i class="lg-run"></i>Course ${fmtHMS(totalRun)}</span>
    <span><i class="lg-st"></i>Stations ${fmtHMS(totalSt)}</span>
    <span><i class="lg-rox"></i>Roxzone ${fmtHMS(totalRox)}</span>`;

  // Les 8 blocs
  const rows = document.getElementById('simRows');
  rows.innerHTML = '';
  let cum = 0;
  HYROX_STATIONS.forEach((st, i) => {
    cum += SIM.runs[i] + SIM.stations[i] + SIM.rox;
    const block = document.createElement('div');
    block.className = 'sim-block';
    block.innerHTML = `
      <div class="sb-head"><span class="sb-num">Bloc ${i + 1}</span><span class="sb-cum">Cumul ${fmtHMS(cum)}</span></div>
      <div class="sb-line run">
        <span class="sb-ico">🏃</span>
        <span class="sb-name">Course<em>1 km</em></span>
        <input type="text" inputmode="numeric" data-kind="run" data-i="${i}" value="${fmtMMSS(SIM.runs[i])}" aria-label="Course ${i + 1}" />
      </div>
      <div class="sb-line st">
        <span class="sb-ico">${st.emoji}</span>
        <span class="sb-name">${st.name}<em>${st.detail}</em></span>
        <input type="text" inputmode="numeric" data-kind="st" data-i="${i}" value="${fmtMMSS(SIM.stations[i])}" aria-label="${st.name}" />
      </div>
      <div class="sb-roxline">🔁 Roxzone <strong>${fmtMMSS(SIM.rox)}</strong></div>`;
    block.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('change', () => {
        const val = parseTime(inp.value);
        if (inp.dataset.kind === 'run') SIM.runs[+inp.dataset.i] = val;
        else SIM.stations[+inp.dataset.i] = val;
        saveSim(); renderSim();
      });
    });
    rows.appendChild(block);
  });

  // Analyse
  let slow = 0, fast = 0;
  SIM.stations.forEach((t, i) => {
    if (t > SIM.stations[slow]) slow = i;
    if (t < SIM.stations[fast]) fast = i;
  });
  const stats = [
    ['🏃 Temps de course', `${fmtHMS(totalRun)} · ${Math.round(pct(totalRun))} %`],
    ['💪 Temps de stations', `${fmtHMS(totalSt)} · ${Math.round(pct(totalSt))} %`],
    ['🔁 Roxzone totale', `${fmtHMS(totalRox)} · ${Math.round(pct(totalRox))} %`],
    ['⏱️ Allure moyenne', `${fmtMMSS(totalRun / 8)} / km`],
    ['🐌 Station la plus lente', `${HYROX_STATIONS[slow].name} — ${fmtMMSS(SIM.stations[slow])}`],
    ['⚡ Station la plus rapide', `${HYROX_STATIONS[fast].name} — ${fmtMMSS(SIM.stations[fast])}`],
  ];
  document.getElementById('simStats').innerHTML = stats.map(([k, val]) =>
    `<div class="ss-row"><span class="ss-k">${k}</span><span class="ss-v">${val}</span></div>`).join('');

  document.getElementById('simPace').value = fmtMMSS(Math.round(totalRun / 8));
  document.getElementById('simRox').value = fmtMMSS(SIM.rox);
}

function initSim() {
  SIM = loadSim();
  const sel = document.getElementById('simPreset');
  sel.innerHTML = SIM_PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  sel.value = SIM.preset != null ? SIM.preset : 1;
  sel.addEventListener('change', () => {
    SIM = simDefaults(parseInt(sel.value, 10));
    saveSim(); renderSim();
    toast(`🏁 Profil « ${SIM_PRESETS[SIM.preset].name} » chargé`);
  });
  document.getElementById('simRox').addEventListener('change', (e) => {
    SIM.rox = parseTime(e.target.value); saveSim(); renderSim();
  });
  document.getElementById('simApplyPace').addEventListener('click', () => {
    const pace = parseTime(document.getElementById('simPace').value);
    if (pace <= 0) { toast('Indique une allure valide (ex. 5:00)'); return; }
    SIM.runs = new Array(8).fill(pace);
    saveSim(); renderSim();
    toast(`🏃 Allure ${fmtMMSS(pace)}/km appliquée aux 8 km`);
  });
  document.getElementById('simReset').addEventListener('click', () => {
    if (!confirm('Réinitialiser le simulateur avec le profil sélectionné ?')) return;
    SIM = simDefaults(parseInt(sel.value, 10));
    saveSim(); renderSim();
    toast('↺ Simulateur réinitialisé');
  });
  renderSim();
}
initSim();

/* -------------------------------------------------------------------------
   15. Démarrage
   ------------------------------------------------------------------------- */
(function init() {
  const didReset = ensureCurrentWeek(STATE);
  recomputeAllTime(STATE); // records à jour dès le chargement (semaine en cours + passées)
  saveState(STATE);
  renderAll();
  if (didReset) {
    toast('🔄 Nouvelle semaine : compteurs remis à zéro !');
  }
})();
