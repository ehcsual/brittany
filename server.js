'use strict';

const { DatabaseSync } = require('node:sqlite');
const express          = require('express');
const crypto           = require('crypto');
const path             = require('path');
const fs               = require('fs');

// Load .env if present
if (fs.existsSync(path.join(__dirname, '.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const app  = express();
const PORT = process.env.PORT || 7333;

// ─────────────────────────────────────────────────────────────
// DATABASE SETUP
// ─────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'brittany.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS brainstorm_boards (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL DEFAULT '',
    name        TEXT NOT NULL DEFAULT 'Untitled',
    type        TEXT NOT NULL DEFAULT 'freeform',
    description TEXT NOT NULL DEFAULT '',
    auto_edit   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS brainstorm_nodes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL DEFAULT '',
    board_id    TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#6366f1',
    node_type   TEXT NOT NULL DEFAULT 'idea',
    x           REAL NOT NULL DEFAULT 200,
    y           REAL NOT NULL DEFAULT 200,
    metadata    TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS brainstorm_edges (
    id        TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL DEFAULT '',
    board_id  TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    label     TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

function requireAuth(req, res, next) { next(); }

// ─────────────────────────────────────────────────────────────
// STATIC — serve brainstorm.html at /
// ─────────────────────────────────────────────────────────────
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'brainstorm.html'));
});

// ─────────────────────────────────────────────────────────────
// API — BRAINSTORM BOARDS
// ─────────────────────────────────────────────────────────────
app.get('/api/brainstorm/boards', requireAuth, (req, res) => {
  const uid    = 'local';
  const boards = db.prepare('SELECT * FROM brainstorm_boards WHERE user_id = ? ORDER BY created_at').all(uid);
  res.json(boards);
});

app.post('/api/brainstorm/boards', requireAuth, (req, res) => {
  const uid = 'local';
  const { name = 'New Board', type = 'freeform', description = '' } = req.body;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO brainstorm_boards (id,user_id,name,type,description) VALUES (?,?,?,?,?)').run(id, uid, name, type, description);
  res.json(db.prepare('SELECT * FROM brainstorm_boards WHERE id = ?').get(id));
});

app.patch('/api/brainstorm/boards/:id', requireAuth, (req, res) => {
  const uid   = 'local';
  const board = db.prepare('SELECT id FROM brainstorm_boards WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!board) return res.status(404).json({ error: 'Not found' });
  const { name, description, auto_edit } = req.body;
  db.prepare(`UPDATE brainstorm_boards SET name = COALESCE(?,name), description = COALESCE(?,description), auto_edit = COALESCE(?,auto_edit) WHERE id = ?`)
    .run(name ?? null, description ?? null, auto_edit ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM brainstorm_boards WHERE id = ?').get(req.params.id));
});

app.delete('/api/brainstorm/boards/:id', requireAuth, (req, res) => {
  const uid = 'local';
  db.prepare('DELETE FROM brainstorm_edges WHERE board_id = ? AND user_id = ?').run(req.params.id, uid);
  db.prepare('DELETE FROM brainstorm_nodes WHERE board_id = ? AND user_id = ?').run(req.params.id, uid);
  db.prepare('DELETE FROM brainstorm_boards WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// API — BRAINSTORM NODES & EDGES
// ─────────────────────────────────────────────────────────────
app.get('/api/brainstorm', requireAuth, (req, res) => {
  const uid     = 'local';
  const boardId = req.query.board;
  if (!boardId) return res.status(400).json({ error: 'board query param required' });
  const board = db.prepare('SELECT * FROM brainstorm_boards WHERE id = ? AND user_id = ?').get(boardId, uid);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  const nodes = db.prepare('SELECT * FROM brainstorm_nodes WHERE board_id = ? ORDER BY created_at').all(boardId);
  const edges = db.prepare('SELECT * FROM brainstorm_edges WHERE board_id = ? ORDER BY id').all(boardId);
  res.json({ board, nodes, edges });
});

app.post('/api/brainstorm/nodes', requireAuth, (req, res) => {
  const uid = 'local';
  const { board_id, title = 'New idea', description = '', color = '#6366f1', node_type = 'idea', x = 200, y = 200, metadata = '{}' } = req.body;
  if (!board_id) return res.status(400).json({ error: 'board_id required' });
  const id      = crypto.randomUUID();
  const metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
  db.prepare('INSERT INTO brainstorm_nodes (id,user_id,board_id,title,description,color,node_type,x,y,metadata) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, uid, board_id, title, description, color, node_type, x, y, metaStr);
  res.json(db.prepare('SELECT * FROM brainstorm_nodes WHERE id = ?').get(id));
});

app.patch('/api/brainstorm/nodes/:id', requireAuth, (req, res) => {
  const uid  = 'local';
  const node = db.prepare('SELECT id FROM brainstorm_nodes WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!node) return res.status(404).json({ error: 'Not found' });
  const { title, description, color, node_type, x, y, metadata } = req.body;
  db.prepare(`UPDATE brainstorm_nodes SET
    title = COALESCE(?,title), description = COALESCE(?,description),
    color = COALESCE(?,color), node_type = COALESCE(?,node_type),
    x = COALESCE(?,x), y = COALESCE(?,y),
    metadata = COALESCE(?,metadata)
    WHERE id = ?`)
    .run(title??null, description??null, color??null, node_type??null, x??null, y??null, metadata!=null?JSON.stringify(metadata):null, req.params.id);
  res.json(db.prepare('SELECT * FROM brainstorm_nodes WHERE id = ?').get(req.params.id));
});

app.delete('/api/brainstorm/nodes/:id', requireAuth, (req, res) => {
  const uid = 'local';
  db.prepare('DELETE FROM brainstorm_edges WHERE user_id = ? AND (source_id = ? OR target_id = ?)').run(uid, req.params.id, req.params.id);
  db.prepare('DELETE FROM brainstorm_nodes WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  res.json({ ok: true });
});

app.post('/api/brainstorm/edges', requireAuth, (req, res) => {
  const uid = 'local';
  const { board_id, source_id, target_id, label = '' } = req.body;
  if (!source_id || !target_id) return res.status(400).json({ error: 'source_id and target_id required' });
  if (source_id === target_id) return res.status(400).json({ error: 'Cannot connect node to itself' });
  const existing = db.prepare('SELECT id FROM brainstorm_edges WHERE user_id = ? AND source_id = ? AND target_id = ?').get(uid, source_id, target_id);
  if (existing) return res.json(existing);
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO brainstorm_edges (id,user_id,board_id,source_id,target_id,label) VALUES (?,?,?,?,?,?)')
    .run(id, uid, board_id || '', source_id, target_id, label);
  res.json(db.prepare('SELECT * FROM brainstorm_edges WHERE id = ?').get(id));
});

app.patch('/api/brainstorm/edges/:id', requireAuth, (req, res) => {
  const uid = 'local';
  const { label } = req.body;
  db.prepare('UPDATE brainstorm_edges SET label = ? WHERE id = ? AND user_id = ?').run(label ?? '', req.params.id, uid);
  res.json(db.prepare('SELECT * FROM brainstorm_edges WHERE id = ?').get(req.params.id));
});

app.delete('/api/brainstorm/edges/:id', requireAuth, (req, res) => {
  const uid = 'local';
  db.prepare('DELETE FROM brainstorm_edges WHERE id = ? AND user_id = ?').run(req.params.id, uid);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Brittany`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → DB: ${DB_PATH}\n`);
});
