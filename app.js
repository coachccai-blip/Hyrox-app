/* =========================================================================
   Hyrox Journal — journal d'entraînement gamifié
   App statique 100% front-end. Persistance via localStorage.
   ========================================================================= */

'use strict';

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
    det.appendChild(body);
    host.appendChild(det);
  });
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

/* Sélecteur segmenté de l'historique (Semaines / All-time) */
document.querySelectorAll('#histSeg .seg-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#histSeg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    const alltime = b.dataset.view === 'alltime';
    document.getElementById('histWeeksView').classList.toggle('hidden', alltime);
    document.getElementById('histAllTimeView').classList.toggle('hidden', !alltime);
  });
});

/* -------------------------------------------------------------------------
   9. Story Journal (galerie de séances marquantes, sans prix)
   ------------------------------------------------------------------------- */
const STORY_KEY = 'hyrox-journal-stories-v1';
let STORIES = loadStories();
let editingStoryId = null;
let draftPhotos = [];

function loadStories() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORY_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveStories() {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify(STORIES));
    return true;
  } catch (e) {
    return false; // quota dépassé
  }
}
function storyId() {
  // identifiant sans Date.now()/Math.random() : basé sur le max existant
  const max = STORIES.reduce((m, s) => Math.max(m, s.id || 0), 0);
  return max + 1;
}
function fmtStoryDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderStories() {
  const grid = document.getElementById('storyGrid');
  const empty = document.getElementById('storyEmpty');
  grid.innerHTML = '';
  empty.classList.toggle('hidden', STORIES.length > 0);

  STORIES.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'story-card';
    const cover = (s.photos && s.photos[0]) || null;
    const count = s.photos ? s.photos.length : 0;
    card.innerHTML = `
      <div class="story-cover">
        ${cover ? `<img src="${cover}" alt="" />` : '<div class="no-photo">✦</div>'}
        ${count > 1 ? `<span class="story-count">${count} photos</span>` : ''}
      </div>
      <div class="story-body">
        <p class="story-title">${escapeHtml(s.title || 'Sans titre')}</p>
        ${s.desc ? `<p class="story-desc">${escapeHtml(s.desc)}</p>` : ''}
        <div class="story-date">${fmtStoryDate(s.created)}</div>
      </div>
    `;
    card.addEventListener('click', () => openStoryEditor(s.id));
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---- Éditeur ---- */
function openStoryEditor(id) {
  editingStoryId = id != null ? id : null;
  const s = editingStoryId != null ? STORIES.find((x) => x.id === editingStoryId) : null;
  document.getElementById('storyEditorTitle').textContent = s ? 'Modifier la story' : 'Nouvelle story';
  document.getElementById('storyTitleInput').value = s ? (s.title || '') : '';
  document.getElementById('storyDescInput').value = s ? (s.desc || '') : '';
  draftPhotos = s && s.photos ? s.photos.slice() : [];
  document.getElementById('storyDeleteBtn').classList.toggle('hidden', !s);
  document.getElementById('storyQuota').classList.add('hidden');
  renderDraftPhotos();
  document.getElementById('storyEditor').classList.remove('hidden');
}
function closeStoryEditor() {
  document.getElementById('storyEditor').classList.add('hidden');
  editingStoryId = null;
  draftPhotos = [];
}
function renderDraftPhotos() {
  const host = document.getElementById('storyPhotos');
  host.innerHTML = '';
  draftPhotos.forEach((src, i) => {
    const t = document.createElement('div');
    t.className = 'sp-thumb';
    t.innerHTML = `<img src="${src}" alt="" /><button type="button" aria-label="Retirer">✕</button>`;
    t.querySelector('img').addEventListener('click', () => openLightbox(src));
    t.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      draftPhotos.splice(i, 1);
      renderDraftPhotos();
    });
    host.appendChild(t);
  });
}

/** Redimensionne une image (max 1200 px, JPEG 0.72) avant stockage. */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        let { width, height } = img;
        if (width > max || height > max) {
          if (width >= height) { height = Math.round(height * max / width); width = max; }
          else { width = Math.round(width * max / height); height = max; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('storyPhotoInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    try { draftPhotos.push(await resizePhoto(f)); }
    catch (err) { /* ignore fichier illisible */ }
  }
  e.target.value = '';
  renderDraftPhotos();
});

document.getElementById('newStoryBtn').addEventListener('click', () => openStoryEditor(null));
document.getElementById('storyCancelBtn').addEventListener('click', closeStoryEditor);
document.getElementById('storySaveBtn').addEventListener('click', () => {
  const title = document.getElementById('storyTitleInput').value.trim();
  const desc = document.getElementById('storyDescInput').value.trim();
  if (!title && !desc && draftPhotos.length === 0) { closeStoryEditor(); return; }

  if (editingStoryId != null) {
    const s = STORIES.find((x) => x.id === editingStoryId);
    if (s) { s.title = title; s.desc = desc; s.photos = draftPhotos.slice(); }
  } else {
    STORIES.unshift({ id: storyId(), title, desc, photos: draftPhotos.slice(), created: new Date().toISOString() });
  }

  if (!saveStories()) {
    document.getElementById('storyQuota').textContent =
      "Stockage plein : réduis le nombre de photos et réessaie.";
    document.getElementById('storyQuota').classList.remove('hidden');
    // on annule l'ajout non persistable
    STORIES = loadStories();
    return;
  }
  renderStories();
  closeStoryEditor();
  toast('📖 Story enregistrée');
});
document.getElementById('storyDeleteBtn').addEventListener('click', () => {
  if (editingStoryId == null) return;
  if (!confirm('Supprimer cette story ?')) return;
  STORIES = STORIES.filter((x) => x.id !== editingStoryId);
  saveStories();
  renderStories();
  closeStoryEditor();
  toast('🗑️ Story supprimée');
});

/* ---- Lightbox ---- */
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightboxImg').src = '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!document.getElementById('lightbox').classList.contains('hidden')) { closeLightbox(); return; }
  if (!document.getElementById('storyEditor').classList.contains('hidden')) { closeStoryEditor(); }
});

/* ---- Ouverture / fermeture du journal ---- */
function toggleJournal(open) {
  const j = document.getElementById('storyJournal');
  const show = open != null ? open : j.classList.contains('hidden');
  j.classList.toggle('hidden', !show);
  document.getElementById('tabbar').style.display = show ? 'none' : '';
  document.querySelectorAll('.page').forEach((p) => { p.style.visibility = show ? 'hidden' : ''; });
  document.querySelector('.topbar').style.display = show ? 'none' : '';
  if (show) { renderStories(); window.scrollTo(0, 0); }
}
document.getElementById('journalToggle').addEventListener('click', () => toggleJournal(true));
document.getElementById('journalClose').addEventListener('click', () => toggleJournal(false));

/* -------------------------------------------------------------------------
   10. Réinitialisation globale
   ------------------------------------------------------------------------- */
document.getElementById('resetAllBtn').addEventListener('click', () => {
  if (!confirm('Effacer TOUTES les données du quest (semaine, historique, records) ? Le story journal n\'est pas touché. Action irréversible.')) return;
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
   12. Démarrage
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
