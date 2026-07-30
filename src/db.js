// Conexão com o banco de dados e criação do schema.
//
// Usa @libsql/client (compatível com SQLite):
//   - Localmente (rodando na sua máquina), usa um ARQUIVO local, exatamente
//     como antes — nenhuma conta ou serviço externo é necessário para usar
//     o site no seu computador. O arquivo fica em data/estudos.db.
//   - Em produção no Vercel, usa um banco remoto no Turso (mesma linguagem
//     SQL, hospedado na nuvem), configurado pelas variáveis de ambiente
//     TURSO_DATABASE_URL e TURSO_AUTH_TOKEN. Sem essas variáveis definidas,
//     cai automaticamente no arquivo local.
//
// Diferente da versão anterior (node:sqlite, síncrona), aqui todo acesso ao
// banco é assíncrono (Promises), porque um banco remoto exige isso. As
// funções abaixo (dbGet/dbAll/dbRun/dbExec) imitam a API antiga para manter
// o resto do código o mais parecido possível.

const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'estudos.db');
const url = process.env.TURSO_DATABASE_URL || `file:${DB_PATH}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

// ---------------------------------------------------------------------------
// Helpers assíncronos que imitam db.prepare(sql).get/all/run(...) da versão
// anterior. `params` pode ser um array (parâmetros posicionais "?", a forma
// usada na maior parte do código) ou um objeto (parâmetros nomeados "@nome",
// usado em seed.js).
// ---------------------------------------------------------------------------
async function dbAll(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows.map((r) => ({ ...r }));
}

async function dbGet(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows[0] ? { ...result.rows[0] } : undefined;
}

async function dbRun(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return {
    lastInsertRowid:
      result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined,
    changes: result.rowsAffected,
  };
}

// Executa várias instruções separadas por ";" sem parâmetros — usado só para
// criar o schema (CREATE TABLE) e para os DELETEs em massa do seed.
async function dbExec(sql) {
  await client.executeMultiple(sql);
}

// ---------------------------------------------------------------------------
// Schema (idêntico ao anterior)
// ---------------------------------------------------------------------------
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  weight_percent REAL NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  priority_rank INTEGER NOT NULL,
  low_priority INTEGER NOT NULL DEFAULT 0,
  is_special INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  UNIQUE(subject_id, slug)
);

CREATE TABLE IF NOT EXISTS content_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video','article')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  stem TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  explanation_correct TEXT NOT NULL,
  explanation_a TEXT NOT NULL,
  explanation_b TEXT NOT NULL,
  explanation_c TEXT NOT NULL,
  explanation_d TEXT NOT NULL,
  source_note TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medio' CHECK (difficulty IN ('facil','medio','dificil'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'pratica' CHECK (source IN ('pratica','simulado')),
  time_spent_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS srs_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  next_review_at TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0,
  correct_streak INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user, question_id)
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  date TEXT NOT NULL,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  planned_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  auto_generated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS simulados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  time_limit_seconds INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','finalizado','abandonado'))
);

CREATE TABLE IF NOT EXISTS simulado_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulado_id INTEGER NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  order_index INTEGER NOT NULL,
  selected_option TEXT,
  is_correct INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

// ---------------------------------------------------------------------------
// Migrações leves: adiciona colunas novas em bancos criados por versões
// anteriores do app, sem apagar nenhum dado já existente da Rayane.
// ---------------------------------------------------------------------------
async function columnExists(table, column) {
  const cols = await dbAll(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

async function ensureColumn(table, column, ddl) {
  if (!(await columnExists(table, column))) {
    await dbExec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

let initPromise = null;
// Garante que o schema exista antes de qualquer consulta. Chamado uma vez
// (o resultado fica em cache) pelo middleware do server.js e pelo seed.js.
function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await client.execute('PRAGMA foreign_keys = ON');
      } catch (err) {
        // pragma pode não ter efeito em bancos remotos — não é crítico,
        // pois o app já gerencia manualmente a ordem de exclusão no seed.
      }
      await dbExec(SCHEMA_SQL);
      await ensureColumn('questions', 'difficulty', "difficulty TEXT NOT NULL DEFAULT 'medio'");
      await ensureColumn('attempts', 'source', "source TEXT NOT NULL DEFAULT 'pratica'");
      await ensureColumn('attempts', 'time_spent_seconds', 'time_spent_seconds INTEGER');
      await ensureColumn('schedule_blocks', 'auto_generated', 'auto_generated INTEGER NOT NULL DEFAULT 0');
    })();
  }
  return initPromise;
}

module.exports = { client, dbGet, dbAll, dbRun, dbExec, initDb };
