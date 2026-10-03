// Simulados no padrão CEFET-MG.
//
// Modos:
//   completo — 50 questões (15 Port, 15 Mat, 8 Ciên, 6 Geo, 6 His), 180 min
//   rapido   — 20 questões na mesma proporção da prova, 72 min
//   materia  — 10/15/20 questões de uma só matéria, 3,6 min por questão
//
// A distribuição de questões por tópico segue a frequência histórica de cada
// tópico nas provas 2016–2026 (themes.expected_per_exam), então o simulado
// "cai" como a prova. Dentro do tópico, prefere questões que a Rayane ainda
// não respondeu e mistura níveis N1/N2/N3 (≈ 25% / 50% / 25%).

const { dbGet, dbAll, dbRun } = require('../db');
const { scheduleNext } = require('./srs');

const DURATION_MINUTES = 180;
const FORMAT = [
  { slug: 'portugues', count: 15 },
  { slug: 'matematica', count: 15 },
  { slug: 'ciencias', count: 8 },
  { slug: 'geografia', count: 6 },
  { slug: 'historia', count: 6 },
];
const MINUTES_PER_QUESTION = 3.6;
const LEVEL_WEIGHT = { 1: 1, 2: 2, 3: 1 };

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Distribui `total` unidades proporcionalmente a `weights` (método do maior resto).
function allocate(weights, total) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < left; k++) base[order[k % order.length].i]++;
  return base;
}

function weightedPick(items, weightFn) {
  const total = items.reduce((s, it) => s + weightFn(it), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// Escolhe `count` questões de uma matéria seguindo a frequência dos tópicos.
async function pickQuestionsForSubject(user, subjectId, count) {
  const themes = await dbAll(
    'SELECT id, expected_per_exam, tier FROM themes WHERE subject_id = ? AND active = 1',
    [subjectId]
  );
  const questions = await dbAll(
    `SELECT q.id, q.theme_id, q.level,
            EXISTS(SELECT 1 FROM attempts a WHERE a.user = ? AND a.question_id = q.id) AS seen
     FROM questions q JOIN themes t ON t.id = q.theme_id
     WHERE t.subject_id = ? AND q.active = 1 AND t.active = 1`,
    [user, subjectId]
  );
  const byTheme = new Map();
  questions.forEach((q) => {
    if (!byTheme.has(q.theme_id)) byTheme.set(q.theme_id, []);
    byTheme.get(q.theme_id).push(q);
  });
  const usable = themes.filter((t) => (byTheme.get(t.id) || []).length > 0);
  const quotas = allocate(usable.map((t) => t.expected_per_exam || 0.3), count);

  const selected = [];
  const used = new Set();
  const takeFrom = (pool, n) => {
    // não vistas primeiro; dentro de cada grupo, sorteio ponderado por nível
    for (const seen of [0, 1]) {
      let cand = pool.filter((q) => !used.has(q.id) && Number(q.seen) === seen);
      while (n > 0 && cand.length) {
        const q = weightedPick(cand, (x) => LEVEL_WEIGHT[x.level] || 1);
        selected.push(q);
        used.add(q.id);
        cand = cand.filter((x) => x.id !== q.id);
        n--;
      }
    }
    return n;
  };
  let missing = 0;
  usable.forEach((t, i) => {
    missing += takeFrom(byTheme.get(t.id), quotas[i]);
  });
  if (missing > 0) {
    // tópico sem questões suficientes: completa com os outros da mesma matéria
    const rest = questions.filter((q) => !used.has(q.id));
    takeFrom(rest, missing);
  }
  return selected.slice(0, count);
}

function planFor(mode, subjects, opts) {
  if (mode === 'materia') {
    const slug = opts.subject;
    const count = [10, 15, 20].includes(Number(opts.count)) ? Number(opts.count) : 15;
    if (!subjects.some((s) => s.slug === slug)) throw new Error('Matéria inválida');
    return { blocks: [{ slug, count }], total: count, minutes: Math.round(count * MINUTES_PER_QUESTION) };
  }
  if (mode === 'rapido') {
    const counts = allocate(FORMAT.map((f) => f.count), 20);
    return { blocks: FORMAT.map((f, i) => ({ slug: f.slug, count: counts[i] })), total: 20, minutes: 72 };
  }
  return { blocks: FORMAT, total: 50, minutes: DURATION_MINUTES };
}

async function createSimulado(user, opts = {}) {
  const mode = ['completo', 'rapido', 'materia'].includes(opts.mode) ? opts.mode : 'completo';
  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const subjectBySlug = {};
  subjects.forEach((s) => { subjectBySlug[s.slug] = s; });
  const plan = planFor(mode, subjects, opts);

  // sorteia primeiro (se faltar questão, falha antes de criar o simulado)
  const picks = [];
  for (const block of plan.blocks) {
    const subject = subjectBySlug[block.slug];
    if (!subject || block.count === 0) continue;
    const picked = shuffle(await pickQuestionsForSubject(user, subject.id, block.count));
    picked.forEach((q) => picks.push({ q, subject }));
  }
  if (picks.length === 0) throw new Error('Não há questões suficientes para este simulado.');

  const info = await dbRun(
    `INSERT INTO simulados (user, time_limit_seconds, total_questions, status, mode)
     VALUES (?, ?, ?, 'em_andamento', ?)`,
    [user, Math.round(plan.minutes * 60), picks.length, mode]
  );
  const simuladoId = info.lastInsertRowid;
  let orderIndex = 0;
  for (const p of picks) {
    await dbRun(
      `INSERT INTO simulado_questions (simulado_id, question_id, subject_id, order_index) VALUES (?, ?, ?, ?)`,
      [simuladoId, p.q.id, p.subject.id, orderIndex++]
    );
  }
  return simuladoId;
}

async function getSimulado(simuladoId, user) {
  return dbGet('SELECT * FROM simulados WHERE id = ? AND user = ?', [simuladoId, user]);
}

async function getOngoingSimulado(user) {
  return dbGet("SELECT * FROM simulados WHERE user = ? AND status = 'em_andamento' ORDER BY id DESC LIMIT 1", [user]);
}

// Durante a prova NÃO mostramos origem, nível nem gabarito (como na prova real).
async function getSimuladoQuestionsForTaking(simuladoId) {
  return dbAll(
    `SELECT sq.id AS sq_id, sq.order_index, sq.selected_option, sq.subject_id,
            q.id AS question_id, q.stem, q.support_html, q.option_a, q.option_b, q.option_c, q.option_d,
            s.name AS subject_name
     FROM simulado_questions sq
     JOIN questions q ON q.id = sq.question_id
     JOIN subjects s ON s.id = sq.subject_id
     WHERE sq.simulado_id = ?
     ORDER BY sq.order_index ASC`,
    [simuladoId]
  );
}

function secondsRemaining(simulado) {
  const startedAt = new Date(simulado.started_at + 'Z'); // datetime('now') do SQLite é UTC
  const elapsed = (Date.now() - startedAt.getTime()) / 1000;
  return Math.max(0, Math.round(simulado.time_limit_seconds - elapsed));
}

async function answerQuestion(simuladoId, sqId, selectedOption) {
  await dbRun('UPDATE simulado_questions SET selected_option = ? WHERE id = ? AND simulado_id = ?', [
    selectedOption, sqId, simuladoId,
  ]);
}

async function finishSimulado(simuladoId, user) {
  const simulado = await getSimulado(simuladoId, user);
  if (!simulado || simulado.status !== 'em_andamento') return simulado;

  const rows = await dbAll(
    `SELECT sq.*, q.correct_option, q.theme_id
     FROM simulado_questions sq
     JOIN questions q ON q.id = sq.question_id
     WHERE sq.simulado_id = ?`,
    [simuladoId]
  );

  let correctCount = 0;
  for (const row of rows) {
    if (!row.selected_option) continue;
    const isCorrect = row.selected_option === row.correct_option ? 1 : 0;
    if (isCorrect) correctCount++;

    await dbRun('UPDATE simulado_questions SET is_correct = ? WHERE id = ?', [isCorrect, row.id]);
    await dbRun(
      `INSERT INTO attempts (user, question_id, theme_id, selected_option, is_correct, source)
       VALUES (?, ?, ?, ?, ?, 'simulado')`,
      [user, row.question_id, row.theme_id, row.selected_option, isCorrect]
    );

    const existing = await dbGet('SELECT * FROM srs_queue WHERE user = ? AND question_id = ?', [user, row.question_id]);
    const currentStage = existing ? existing.stage : 0;
    const { nextStage, nextReviewAt } = scheduleNext(currentStage, !!isCorrect);
    const nextStreak = isCorrect ? (existing ? existing.correct_streak + 1 : 1) : 0;
    if (existing) {
      await dbRun('UPDATE srs_queue SET stage = ?, next_review_at = ?, correct_streak = ? WHERE id = ?', [
        nextStage, nextReviewAt, nextStreak, existing.id,
      ]);
    } else {
      await dbRun(
        `INSERT INTO srs_queue (user, question_id, next_review_at, stage, correct_streak) VALUES (?, ?, ?, ?, ?)`,
        [user, row.question_id, nextReviewAt, nextStage, nextStreak]
      );
    }
  }

  await dbRun("UPDATE simulados SET finished_at = datetime('now'), correct_count = ?, status = 'finalizado' WHERE id = ?", [
    correctCount, simuladoId,
  ]);
  return getSimulado(simuladoId, user);
}

function bump(map, key, label, extra = {}) {
  if (!map[key]) map[key] = { key, label, total: 0, correct: 0, answered: 0, ...extra };
  return map[key];
}

async function getResultSummary(simuladoId, user) {
  const simulado = await getSimulado(simuladoId, user);
  if (!simulado) return null;

  const rows = await dbAll(
    `SELECT sq.*, q.stem, q.support_html, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option,
            q.explanation_correct, q.explanation_a, q.explanation_b, q.explanation_c, q.explanation_d,
            q.source_note, q.level, q.origin, q.format,
            s.name AS subject_name, s.slug AS subject_slug, t.name AS theme_name, t.code AS theme_code, t.tier AS theme_tier
     FROM simulado_questions sq
     JOIN questions q ON q.id = sq.question_id
     JOIN subjects s ON s.id = sq.subject_id
     JOIN themes t ON t.id = q.theme_id
     WHERE sq.simulado_id = ?
     ORDER BY sq.order_index ASC`,
    [simuladoId]
  );

  const bySubjectMap = {};
  const byThemeMap = {};
  const byLevelMap = {};
  for (const r of rows) {
    const groups = [
      bump(bySubjectMap, r.subject_slug, r.subject_name),
      bump(byThemeMap, r.theme_code, r.theme_name, { subject: r.subject_name, tier: r.theme_tier }),
      bump(byLevelMap, String(r.level), `Nível N${r.level}`),
    ];
    groups.forEach((g) => {
      g.total++;
      if (r.selected_option) g.answered++;
      if (r.is_correct) g.correct++;
    });
  }
  const byTheme = Object.values(byThemeMap).sort((a, b) => (a.correct / a.total) - (b.correct / b.total) || b.total - a.total);
  const projected = simulado.total_questions ? Math.round((simulado.correct_count / simulado.total_questions) * 50 * 10) / 10 : 0;

  return {
    simulado,
    rows,
    bySubject: Object.values(bySubjectMap),
    byTheme,
    byLevel: Object.values(byLevelMap).sort((a, b) => a.key.localeCompare(b.key)),
    projected,
  };
}

async function getHistory(user) {
  return dbAll("SELECT * FROM simulados WHERE user = ? AND status = 'finalizado' ORDER BY started_at DESC", [user]);
}

module.exports = {
  DURATION_MINUTES,
  FORMAT,
  allocate,
  createSimulado,
  getSimulado,
  getOngoingSimulado,
  getSimuladoQuestionsForTaking,
  secondsRemaining,
  answerQuestion,
  finishSimulado,
  getResultSummary,
  getHistory,
};
