const STORAGE_KEY = 'collectionLogProgress.v1';
const CATEGORIES = ['Bosses', 'Raids', 'Clues', 'Minigames', 'Other'];

// One-time static snapshots (not a live WikiSync integration) - see data/loadouts/.
const LOADOUTS = [
  { label: 'lebronathan', file: 'data/loadouts/lebronathan.json' },
  { label: 'fapital one', file: 'data/loadouts/fapital-one.json' },
];

let items = [];
let state = {}; // id -> { obtained: bool, notes: string }
let sort = { key: null, dir: 1 };
let filters = { search: '', category: '', source: '', status: '' };

const tableBody = document.getElementById('tableBody');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sourceFilter = document.getElementById('sourceFilter');
const statusFilter = document.getElementById('statusFilter');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle = document.getElementById('confirmTitle');
const confirmBody = document.getElementById('confirmBody');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmActionBtn = document.getElementById('confirmActionBtn');
const statObtained = document.getElementById('statObtained');
const statTotal = document.getElementById('statTotal');
const statPct = document.getElementById('statPct');
const progressFill = document.getElementById('progressFill');
const categoryProgress = document.getElementById('categoryProgress');
const loadoutButtons = document.getElementById('loadoutButtons');

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : {};
  } catch (e) {
    state = {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getEntry(id) {
  if (!state[id]) state[id] = { obtained: false, notes: '' };
  return state[id];
}

function init() {
  loadState();
  fetch('data/items.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      items = data;
      populateSourceFilter();
      populateLoadouts();
      render();
    })
    .catch(err => {
      tableBody.innerHTML = '';
      emptyState.textContent = 'Failed to load collection log data.';
      emptyState.classList.remove('hidden');
      console.error(err);
    });
}

function populateLoadouts() {
  loadoutButtons.innerHTML = '';
  for (const loadout of LOADOUTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loadout-btn';
    btn.textContent = loadout.label;
    btn.addEventListener('click', () => applyLoadout(loadout));
    loadoutButtons.appendChild(btn);
  }
}

function applyLoadout(loadout) {
  fetch(loadout.file, { cache: 'no-store' })
    .then(r => r.json())
    .then(parsed => {
      const loadoutState = parsed && typeof parsed === 'object' ? parsed.state : null;
      if (!loadoutState || typeof loadoutState !== 'object') {
        alert(`Couldn't load ${loadout.label}'s loadout.`);
        return;
      }
      const count = Object.keys(loadoutState).length;
      showConfirm({
        title: `Load ${loadout.label}'s loadout?`,
        body: `This sets your obtained checks to match ${loadout.label}'s (${count.toLocaleString()} items), a one-time snapshot rather than a live sync. Your notes are kept as-is; only obtained checkboxes change. This cannot be undone.`,
        actionLabel: 'Load loadout',
        onConfirm: () => {
          const newState = {};
          for (const item of items) {
            const existingNotes = (state[item.id] && state[item.id].notes) || '';
            const obtained = !!(loadoutState[item.id] && loadoutState[item.id].obtained);
            newState[item.id] = { obtained, notes: existingNotes };
          }
          state = newState;
          saveState();
          render();
        },
      });
    })
    .catch(() => alert(`Couldn't load ${loadout.label}'s loadout.`));
}

function populateSourceFilter() {
  const scoped = filters.category ? items.filter(i => i.category === filters.category) : items;
  const sources = Array.from(new Set(scoped.map(i => i.source))).sort((a, b) => a.localeCompare(b));

  sourceFilter.innerHTML = '<option value="">All sources</option>';
  for (const s of sources) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sourceFilter.appendChild(opt);
  }
}

function matchesFilters(item) {
  const entry = getEntry(item.id);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    if (!item.item.toLowerCase().includes(q) && !item.source.toLowerCase().includes(q)) {
      return false;
    }
  }
  if (filters.category && item.category !== filters.category) return false;
  if (filters.source && item.source !== filters.source) return false;
  if (filters.status === 'obtained' && !entry.obtained) return false;
  if (filters.status === 'missing' && entry.obtained) return false;
  if (filters.status === 'notes' && !entry.notes) return false;
  return true;
}

function sortItems(list) {
  if (!sort.key) return list;
  const key = sort.key;
  return list.slice().sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (key === 'comp') {
      av = av === null || av === undefined ? -1 : av;
      bv = bv === null || bv === undefined ? -1 : bv;
      return (av - bv) * sort.dir;
    }
    av = (av || '').toLowerCase();
    bv = (bv || '').toLowerCase();
    if (av < bv) return -1 * sort.dir;
    if (av > bv) return 1 * sort.dir;
    return 0;
  });
}

function render() {
  const filtered = sortItems(items.filter(matchesFilters));

  tableBody.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const item of filtered) {
    const entry = getEntry(item.id);
    const tr = document.createElement('tr');
    tr.className = entry.obtained ? 'obtained' : '';
    tr.dataset.id = item.id;

    const checkTd = document.createElement('td');
    checkTd.className = 'col-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'row-check';
    checkbox.checked = entry.obtained;
    checkbox.addEventListener('change', () => toggleObtained(item.id, checkbox.checked));
    checkTd.appendChild(checkbox);
    tr.appendChild(checkTd);

    const itemTd = document.createElement('td');
    itemTd.className = 'col-item';
    const itemCell = document.createElement('div');
    itemCell.className = 'item-cell';
    const itemInner = item.itemUrl ? document.createElement('a') : document.createElement('span');
    itemInner.className = 'item-link';
    if (item.itemUrl) {
      itemInner.href = item.itemUrl;
      itemInner.target = '_blank';
      itemInner.rel = 'noopener';
    }
    if (item.img) {
      const img = document.createElement('img');
      img.src = item.img;
      img.alt = '';
      img.loading = 'lazy';
      itemInner.appendChild(img);
    }
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.label || item.item;
    itemInner.appendChild(nameSpan);
    itemCell.appendChild(itemInner);
    itemTd.appendChild(itemCell);
    tr.appendChild(itemTd);

    const compTd = document.createElement('td');
    compTd.className = 'col-comp';
    compTd.textContent = item.comp === null || item.comp === undefined ? '—' : item.comp.toFixed(1) + '%';
    tr.appendChild(compTd);

    const notesTd = document.createElement('td');
    notesTd.className = 'col-notes';
    const notesInput = document.createElement('input');
    notesInput.type = 'text';
    notesInput.className = 'notes-input';
    notesInput.placeholder = '—';
    notesInput.value = entry.notes || '';
    notesInput.addEventListener('change', () => setNotes(item.id, notesInput.value));
    notesTd.appendChild(notesInput);
    tr.appendChild(notesTd);

    frag.appendChild(tr);
  }

  tableBody.appendChild(frag);
  emptyState.classList.toggle('hidden', filtered.length > 0);
  updateStats();
}

function toggleObtained(id, obtained) {
  getEntry(id).obtained = obtained;
  saveState();
  const tr = tableBody.querySelector(`tr[data-id="${id}"]`);
  if (tr) tr.classList.toggle('obtained', obtained);
  if (filters.status) render(); else updateStats();
}

function setNotes(id, notes) {
  getEntry(id).notes = notes;
  saveState();
  if (filters.status === 'notes') render();
}

function updateStats() {
  const total = items.length;
  const obtained = items.filter(i => getEntry(i.id).obtained).length;
  const pct = total ? Math.round((obtained / total) * 1000) / 10 : 0;
  statObtained.textContent = obtained.toLocaleString();
  statTotal.textContent = total.toLocaleString();
  statPct.textContent = pct + '%';
  progressFill.style.width = pct + '%';

  categoryProgress.innerHTML = '';
  for (const cat of CATEGORIES) {
    const catItems = items.filter(i => i.category === cat);
    const catObtained = catItems.filter(i => getEntry(i.id).obtained).length;
    const catPct = catItems.length ? Math.round((catObtained / catItems.length) * 1000) / 10 : 0;

    const row = document.createElement('div');
    row.className = 'category-row';

    const label = document.createElement('span');
    label.className = 'category-label';
    label.textContent = cat;
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'progress-track';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = catPct + '%';
    track.appendChild(fill);
    row.appendChild(track);

    const count = document.createElement('span');
    count.className = 'category-count';
    count.textContent = `${catObtained}/${catItems.length}`;
    row.appendChild(count);

    categoryProgress.appendChild(row);
  }
}

function updateSortHeaders() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sort.key) {
      th.classList.add(sort.dir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

searchInput.addEventListener('input', () => {
  filters.search = searchInput.value.trim();
  render();
});

categoryFilter.addEventListener('change', () => {
  filters.category = categoryFilter.value;
  filters.source = '';
  populateSourceFilter();
  render();
});

sourceFilter.addEventListener('change', () => {
  filters.source = sourceFilter.value;
  render();
});

statusFilter.addEventListener('change', () => {
  filters.status = statusFilter.value;
  render();
});

let pendingConfirmAction = null;

function showConfirm({ title, body, actionLabel, onConfirm }) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmActionBtn.textContent = actionLabel;
  pendingConfirmAction = onConfirm;
  confirmOverlay.classList.remove('hidden');
}

function hideConfirm() {
  confirmOverlay.classList.add('hidden');
  pendingConfirmAction = null;
}

confirmCancelBtn.addEventListener('click', hideConfirm);

confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) hideConfirm();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmOverlay.classList.contains('hidden')) {
    hideConfirm();
  }
});

confirmActionBtn.addEventListener('click', () => {
  const action = pendingConfirmAction;
  hideConfirm();
  if (action) action();
});

resetBtn.addEventListener('click', () => {
  showConfirm({
    title: 'Reset all progress?',
    body: `This clears every obtained check and every note you've entered, for all ${items.length.toLocaleString()} items. This cannot be undone.`,
    actionLabel: 'Reset everything',
    onConfirm: () => {
      state = {};
      saveState();
      render();
    },
  });
});

exportBtn.addEventListener('click', () => {
  const payload = {
    format: 'collection-log-tracker-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    totalItems: items.length,
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `collection-log-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
  importFileInput.value = '';
  importFileInput.click();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (e) {
      alert('That file is not valid JSON.');
      return;
    }
    const importedState = parsed && typeof parsed === 'object' ? parsed.state : null;
    if (!importedState || typeof importedState !== 'object') {
      alert("That file doesn't look like a collection log tracker backup.");
      return;
    }

    const importedCount = Object.keys(importedState).length;
    showConfirm({
      title: 'Import this backup?',
      body: `This file has progress for ${importedCount.toLocaleString()} item(s)` +
        (parsed.exportedAt ? ` exported on ${new Date(parsed.exportedAt).toLocaleDateString()}` : '') +
        `. It will replace your current obtained checks and notes. This cannot be undone.`,
      actionLabel: 'Import and replace',
      onConfirm: () => {
        state = importedState;
        saveState();
        render();
      },
    });
  };
  reader.readAsText(file);
});

document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sort.key === key) {
      sort.dir *= -1;
    } else {
      sort.key = key;
      sort.dir = 1;
    }
    updateSortHeaders();
    render();
  });
});

init();
