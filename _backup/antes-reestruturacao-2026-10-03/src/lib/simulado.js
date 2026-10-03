// Lógica dos simulados cronometrados: seleção de questões respeitando o formato
// real da prova (50 questões: 15 Português, 15 Matemática, 8 Ciências, 6
// Geografia, 6 História, em 3 horas), correção e resumo de resultado.

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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Escolhe `count` questões de uma matéria, priorizando temas de maior
// importância (a obra do ano e os temas de alta prioridade aparecem mais),
// sem repetir questão dentro do mesmo simulado.
async function pickQuestionsForSubject(subjectId, count) {
  const themes = await dbAll('SELECT * FROM themes WHERE subject_id = ? ORDER BY priority_rank ASC', [subjectId]);
  const weightedThemeIds = [];
  themes.forEach((t) => {
    let weight;
    if (t.is_special) weight = 6;
    else if (t.low_priority) weight = 1;
    else weight = Math.max(1, themes.length - t.priority_rank + 2);
    for (let i = 0; i < weight; i++) weightedThemeIds.push(t.id);
  });

  const selected = [];
  const used = new Set();
  let guard = 0;
  while (selected.length < count && guard < count * 40 && weightedThemeIds.length > 0) {
    guard++;
    const themeId = weightedThemeIds[Math.floor(Math.random() * weightedThemeIds.length)];
    const excludeClause = used.size ? `AND id NOT IN (${[...used].join(',')})` : '';
    const q = await dbGet(`SELECT * FROM questions WHERE theme_id = ? ${excludeClause} ORDER BY RANDOM() LIMIT 1`, [themeId]);
    if (q) {
      selected.push(q);
      used.add(q.id);
    }
  }
  if (selected.length < count) {
    const excludeClause = used.size ? `AND q.id NOT IN (${[...used].join(',')})` : '';
    const remaining = await dbAll(
      `SELECT q.* FROM questions q JOIN themes t ON t.id = q.theme_id
       WHERE t.subject_id = ? ${excludeClause} ORDER BY RANDOM() LIMIT ?`,
      [subjectId, count - selected.length]
    );
    selected.push(...remaining);
  }
  return selected;
}

async function createSimulado(user) {
  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const subjectBySlug = {};
  subjects.forEach((s) => { subjectBySlug[s.slug] = s; });

  const info = await dbRun(
    `INSERT INTO simulados (user, time_limit_seconds, total_questions, status)
     VALUES (?, ?, ?, 'em_andamento')`,
    [user, DURATION_MINUTES * 60, 50]
  );
  const simuladoId = info.lastInsertRowid;

  let orderIndex = 0;
  for (const block of FORMAT) {
    const subject = subjectBySlug[block.slug];
    if (!subject) continue;
    const picked = shuffle(await pickQuestionsForSubject(subject.id, block.count));
    for (const q of picked) {
      await dbRun(
        `INSERT INTO simulado_questions (simulado_id, question_id, subject_id, order_index)
         VALUES (?, ?, ?, ?)`,
        [simuladoId, q.id, subject.id, orderIndex]
      );
      orderIndex++;
    }
  }

  return simuladoId;
}

async function getSimulado(simuladoId, user) {
  return dbGet('SELECT * FROM simulados WHERE id = ? AND user = ?', [simuladoId, user]);
}

async function getOngoingSimulado(user) {
  return dbGet("SELECT * FROM simulados WHERE user = ? AND status = 'em_andamento' ORDER BY id DESC LIMIT 1", [user]);
}

async function getSimuladoQuestionsForTaking(simuladoId) {
  return dbAll(
    `SELECT sq.id AS sq_id, sq.order_index, sq.selected_option, sq.subject_id,
            q.id AS question_id, q.stem, q.option_a, q.option_b, q.option_c, q.option_d,
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
    selectedOption,
    sqId,
    simuladoId,
  ]);
}

// Corrige o simulado inteiro, registra cada questão respondida em `attempts`
// (para entrar nas estatísticas de domínio e na fila de revisão espaçada,
// igual a uma questão praticada normalmente) e marca o simulado como finalizado.
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
        nextStage,
        nextReviewAt,
        nextStreak,
        existing.id,
      ]);
    } else {
      await dbRun(
        `INSERT INTO srs_queue (user, question_id, next_review_at, stage, correct_streak) VALUES (?, ?, ?, ?, ?)`,
        [user, row.question_id, nextReviewAt, nextStage, nextStreak]
      );
    }
  }

  await dbRun("UPDATE simulados SET finished_at = datetime('now'), correct_count = ?, status = 'finalizado' WHERE id = ?", [
    correctCount,
    simuladoId,
  ]);

  return getSimulado(simuladoId, user);
}

async function getResultSummary(simuladoId, user) {
  const simulado = await getSimulado(simuladoId, user);
  if (!simulado) return null;

  const rows = await dbAll(
    `SELECT sq.*, q.stem, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option,
            q.explanation_correct, q.explanation_a, q.explanation_b, q.explanation_c, q.explanation_d,
            s.name AS subject_name, s.slug AS subject_slug
     FROM simulado_questions sq
     JOIN questions q ON q.id = sq.question_id
     JOIN subjects s ON s.id = sq.subject_id
     WHERE sq.simulado_id = ?
     ORDER BY sq.order_index ASC`,
    [simuladoId]
  );

  const bySubject = {};
  for (const r of rows) {
    if (!bySubject[r.subject_slug]) {
      bySubject[r.subject_slug] = { name: r.subject_name, total: 0, correct: 0, answered: 0 };
    }
    bySubject[r.subject_slug].total++;
    if (r.selected_option) bySubject[r.subject_slug].answered++;
    if (r.is_correct) bySubject[r.subject_slug].correct++;
  }

  return { simulado, rows, bySubject: Object.values(bySubject) };
}

async function getHistory(user) {
  return dbAll("SELECT * FROM simulados WHERE user = ? AND status = 'finalizado' ORDER BY started_at DESC", [user]);
}

module.exports = {
  DURATION_MINUTES,
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
