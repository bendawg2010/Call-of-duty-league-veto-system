const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const STATE_FILE = path.join(__dirname, 'state.json');

// CDL Black Ops 6 Map Pool (2024-2025 Season)
const DEFAULT_MAP_POOL = {
  hp: ['Babylon', 'Hacienda', 'Infection', 'Protocol', 'Rewind', 'Skyline'],
  snd: ['Babylon', 'Hacienda', 'Infection', 'Protocol', 'Rewind', 'Skyline'],
  control: ['Babylon', 'Hacienda', 'Protocol']
};

// CDL Veto Steps (Best of 5)
// Team 1 = coin flip winner (veto advantage)
const VETO_STEPS = [
  { action: 'ban',  mode: 'hp',      team: 1, label: 'Ban a Hardpoint map' },
  { action: 'ban',  mode: 'hp',      team: 2, label: 'Ban a Hardpoint map' },
  { action: 'ban',  mode: 'hp',      team: 1, label: 'Ban a Hardpoint map' },
  { action: 'ban',  mode: 'hp',      team: 2, label: 'Ban a Hardpoint map' },
  { action: 'pick', mode: 'hp',      team: 2, label: 'Pick Game 1 Hardpoint map', game: 1 },
  // Remaining HP map = Game 4 (auto-assigned)
  { action: 'ban',  mode: 'snd',     team: 2, label: 'Ban a Search & Destroy map' },
  { action: 'ban',  mode: 'snd',     team: 1, label: 'Ban a Search & Destroy map' },
  { action: 'ban',  mode: 'snd',     team: 2, label: 'Ban a Search & Destroy map' },
  { action: 'ban',  mode: 'snd',     team: 1, label: 'Ban a Search & Destroy map' },
  { action: 'pick', mode: 'snd',     team: 1, label: 'Pick Game 2 Search & Destroy map', game: 2 },
  // Remaining SnD map = Game 5 (auto-assigned)
  { action: 'ban',  mode: 'control', team: 1, label: 'Ban a Control map' },
  { action: 'ban',  mode: 'control', team: 2, label: 'Ban a Control map' },
  // Remaining Control map = Game 3 (auto-assigned)
];

function getDefaultState() {
  return {
    teams: {
      team1: { name: 'Team 1', score: 0, color: '#0057B8' },
      team2: { name: 'Team 2', score: 0, color: '#E8003D' }
    },
    mapPool: JSON.parse(JSON.stringify(DEFAULT_MAP_POOL)),
    veto: {
      started: false,
      complete: false,
      currentStep: 0,
      steps: VETO_STEPS,
      bans: { hp: [], snd: [], control: [] },
      picks: { hp: [], snd: [], control: [] },
      availableMaps: JSON.parse(JSON.stringify(DEFAULT_MAP_POOL))
    },
    series: [
      { game: 1, mode: 'hp',      map: null, winner: null, score1: 0, score2: 0, pickedBy: null },
      { game: 2, mode: 'snd',     map: null, winner: null, score1: 0, score2: 0, pickedBy: null },
      { game: 3, mode: 'control', map: null, winner: null, score1: 0, score2: 0, pickedBy: null },
      { game: 4, mode: 'hp',      map: null, winner: null, score1: 0, score2: 0, pickedBy: null },
      { game: 5, mode: 'snd',     map: null, winner: null, score1: 0, score2: 0, pickedBy: null }
    ],
    phase: 'setup' // setup | veto | series | complete
  };
}

let state = getDefaultState();

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = data;
    }
  } catch (e) {
    console.log('No saved state, starting fresh.');
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastState() {
  broadcast({ type: 'state', data: state });
  saveState();
}

function getModeLabel(mode) {
  const labels = { hp: 'Hardpoint', snd: 'Search & Destroy', control: 'Control' };
  return labels[mode] || mode;
}

// Auto-assign remaining maps after all bans/picks for a mode
function autoAssignRemainingMaps() {
  const { availableMaps, bans, picks } = state.veto;

  // After HP veto (step index 4 is last HP pick), assign remaining HP to Game 4
  if (state.veto.currentStep >= 6) {
    const remainingHp = availableMaps.hp;
    if (remainingHp.length === 1) {
      const game4 = state.series.find(g => g.game === 4);
      if (game4 && !game4.map) {
        game4.map = remainingHp[0];
        game4.pickedBy = 'auto';
      }
    }
  }

  // After SnD veto (step index 9 is last SnD pick), assign remaining SnD to Game 5
  if (state.veto.currentStep >= 11) {
    const remainingSnd = availableMaps.snd;
    if (remainingSnd.length === 1) {
      const game5 = state.series.find(g => g.game === 5);
      if (game5 && !game5.map) {
        game5.map = remainingSnd[0];
        game5.pickedBy = 'auto';
      }
    }
  }

  // After Control veto complete (all steps done)
  if (state.veto.currentStep >= VETO_STEPS.length) {
    const remainingControl = availableMaps.control;
    if (remainingControl.length === 1) {
      const game3 = state.series.find(g => g.game === 3);
      if (game3 && !game3.map) {
        game3.map = remainingControl[0];
        game3.pickedBy = 'auto';
      }
    }
    state.veto.complete = true;
    state.phase = 'series';
  }
}

// ── API Routes ──────────────────────────────────────────────────────────────

// Get full state
app.get('/api/state', (req, res) => {
  res.json(state);
});

// Update team info
app.post('/api/teams', (req, res) => {
  const { team1Name, team2Name, team1Color, team2Color } = req.body;
  if (team1Name) state.teams.team1.name = team1Name.trim();
  if (team2Name) state.teams.team2.name = team2Name.trim();
  if (team1Color) state.teams.team1.color = team1Color;
  if (team2Color) state.teams.team2.color = team2Color;
  broadcastState();
  res.json({ ok: true });
});

// Update map pool
app.post('/api/mappool', (req, res) => {
  const { hp, snd, control } = req.body;
  if (hp && Array.isArray(hp)) state.mapPool.hp = hp;
  if (snd && Array.isArray(snd)) state.mapPool.snd = snd;
  if (control && Array.isArray(control)) state.mapPool.control = control;
  broadcastState();
  res.json({ ok: true });
});

// Start veto
app.post('/api/veto/start', (req, res) => {
  if (state.phase !== 'setup') {
    return res.json({ ok: false, error: 'Veto already started or series in progress' });
  }
  state.veto.started = true;
  state.veto.availableMaps = JSON.parse(JSON.stringify(state.mapPool));
  state.phase = 'veto';
  broadcastState();
  res.json({ ok: true });
});

// Execute a veto action (ban or pick)
app.post('/api/veto/action', (req, res) => {
  const { map } = req.body;

  if (state.phase !== 'veto') {
    return res.json({ ok: false, error: 'Not in veto phase' });
  }
  if (state.veto.currentStep >= VETO_STEPS.length) {
    return res.json({ ok: false, error: 'Veto already complete' });
  }

  const step = VETO_STEPS[state.veto.currentStep];
  const { action, mode } = step;
  const available = state.veto.availableMaps[mode];

  if (!available.includes(map)) {
    return res.json({ ok: false, error: `Map "${map}" not available for ${getModeLabel(mode)}` });
  }

  // Remove map from available pool
  state.veto.availableMaps[mode] = available.filter(m => m !== map);

  if (action === 'ban') {
    state.veto.bans[mode].push({ map, team: step.team });
  } else if (action === 'pick') {
    state.veto.picks[mode].push({ map, team: step.team });
    // Assign to series
    const game = state.series.find(g => g.game === step.game);
    if (game) {
      game.map = map;
      game.pickedBy = step.team;
    }
  }

  state.veto.currentStep++;
  autoAssignRemainingMaps();
  broadcastState();
  res.json({ ok: true, step: state.veto.currentStep });
});

// Update series score
app.post('/api/series/:game/score', (req, res) => {
  const gameNum = parseInt(req.params.game);
  const { score1, score2, winner } = req.body;
  const game = state.series.find(g => g.game === gameNum);
  if (!game) return res.json({ ok: false, error: 'Game not found' });

  if (score1 !== undefined) game.score1 = parseInt(score1) || 0;
  if (score2 !== undefined) game.score2 = parseInt(score2) || 0;
  if (winner !== undefined) {
    game.winner = winner; // 1, 2, or null

    // Recalculate series score
    state.teams.team1.score = state.series.filter(g => g.winner === 1).length;
    state.teams.team2.score = state.series.filter(g => g.winner === 2).length;

    // Check if series is over
    if (state.teams.team1.score >= 3 || state.teams.team2.score >= 3) {
      state.phase = 'complete';
    }
  }

  broadcastState();
  res.json({ ok: true });
});

// Reset entire state
app.post('/api/reset', (req, res) => {
  state = getDefaultState();
  broadcastState();
  res.json({ ok: true });
});

// ── WebSocket ───────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', data: state }));
});

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
loadState();
server.listen(PORT, () => {
  console.log(`\n=== CDL Veto System ===`);
  console.log(`Admin Panel : http://localhost:${PORT}/admin.html`);
  console.log(`OBS Overlay : http://localhost:${PORT}/overlay.html`);
  console.log(`======================\n`);
});
