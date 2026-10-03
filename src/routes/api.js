// Motor de exercícios: próxima questão + registro de resposta com explicação
// completa, e endpoints simples para o cronograma ajustável.

const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { scheduleNext } = require('../lib/srs');
const simuladoLib = require('../lib/simulado');

router.use(requireLogin);

function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function serializeQuestion(q) {
  return {
    id: q.id,
    theme_id: q.theme_id,
    stem: q.stem,
    support_html: q.support_html || null,
    options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
    difficulty: q.difficulty,
    level: q.level,
    origin: q.origin,
    format: q.format,
    source_note: q.source_note,
  };
}

// Nível-alvo da próxima questão, conforme o desempenho recente no tópico:
// começa no N1, sobe para N2 com >=50% e para N3 com >=80% de acerto.
async function targetLevel(user, themeId) {
  const rows = await dbAll(
    `SELECT a.is_correct FROM attempts a JOIN questions q ON q.id = a.question_id AND q.active = 1
     WHERE a.user = ? AND a.theme_id = ? ORDER BY a.id DESC LIMIT 10`,
    [user, themeId]
  );
  if (rows.length < 2) return 1;
  const acc = rows.filter((r) => r.is_correct).length / rows.length;
  return acc >= 0.8 ? 3 : acc >= 0.5 ? 2 : 1;
}

// GET /api/next-question?theme_id=5            (modo tema)
//     /api/next-question?mode=revisao           (revisões espaçadas vencidas, todos os tópicos)
//     /api/next-question?mode=erros[&theme_id=] (questões cuja última tentativa foi errada)
router.get('/next-question', h(async (req, res) => {
  const user = req.session.role;
  const mode = req.query.mode || 'tema';
  const themeId = Number(req.query.theme_id) || null;
  const now = new Date().toISOString();

  if (mode === 'revisao') {
    const due = await dbGet(
      `SELECT q.* FROM srs_queue s JOIN questions q ON q.id = s.question_id AND q.active = 1
       WHERE s.user = ? AND s.next_review_at <= ? ORDER BY s.next_review_at ASC LIMIT 1`,
      [user, now]
    );
    if (!due) return res.status(404).json({ error: 'Nenhuma revisão vencida agora. Volte amanhã ou pratique um tópico novo!' });
    return res.json({ question: serializeQuestion(due), reason: 'revisao' });
  }

  if (mode === 'erros') {
    const wrong = await dbGet(
      `SELECT q.* FROM questions q
       WHERE q.active = 1 ${themeId ? 'AND q.theme_id = ?' : ''}
       AND (SELECT a.is_correct FROM attempts a WHERE a.user = ? AND a.question_id = q.id ORDER BY a.id DESC LIMIT 1) = 0
       ORDER BY RANDOM() LIMIT 1`,
      themeId ? [themeId, user] : [user]
    );
    if (!wrong) return res.status(404).json({ error: 'Seu caderno de erros está vazio. Mandou bem! 🎉' });
    return res.json({ question: serializeQuestion(wrong), reason: 'erro' });
  }

  if (!themeId) return res.status(400).json({ error: 'theme_id é obrigatório' });

  // 1) revisão espaçada vencida neste tópico
  const dueReview = await dbGet(
    `SELECT q.* FROM srs_queue s JOIN questions q ON q.id = s.question_id AND q.active = 1
     WHERE s.user = ? AND q.theme_id = ? AND s.next_review_at <= ?
     ORDER BY s.next_review_at ASC LIMIT 1`,
    [user, themeId, now]
  );
  if (dueReview) return res.json({ question: serializeQuestion(dueReview), reason: 'revisao' });

  // 2) questão nova, no nível mais próximo do alvo
  const target = await targetLevel(user, themeId);
  const neverAnswered = await dbGet(
    `SELECT q.* FROM questions q
     WHERE q.theme_id = ? AND q.active = 1
     AND q.id NOT IN (SELECT question_id FROM attempts WHERE user = ? AND theme_id = ?)
     ORDER BY ABS(COALESCE(q.level, 2) - ?) ASC, RANDOM() LIMIT 1`,
    [themeId, user, themeId, target]
  );
  if (neverAnswered) return res.json({ question: serializeQuestion(neverAnswered), reason: 'nova' });

  // 3) já respondeu tudo: a que está há mais tempo sem revisão
  const fallback = await dbGet(
    `SELECT q.* FROM questions q
     LEFT JOIN srs_queue s ON s.question_id = q.id AND s.user = ?
     WHERE q.theme_id = ? AND q.active = 1
     ORDER BY COALESCE(s.next_review_at, '0000-00-00') ASC LIMIT 1`,
    [user, themeId]
  );
  if (!fallback) return res.status(404).json({ error: 'Nenhuma questão cadastrada para este tópico ainda.' });
  res.json({ question: serializeQuestion(fallback), reason: 'revisao_geral' });
}));

// POST /api/answer { question_id, selected_option, time_spent_seconds }
router.post('/answer', express.json(), h(async (req, res) => {
  const user = req.session.role;
  const { question_id, selected_option, time_spent_seconds } = req.body;
  if (!question_id || !['a', 'b', 'c', 'd'].includes(selected_option)) {
    return res.status(400).json({ error: 'question_id e selected_option (a-d) são obrigatórios' });
  }

  const question = await dbGet('SELECT * FROM questions WHERE id = ? AND active = 1', [question_id]);
  if (!question) return res.status(404).json({ error: 'Questão não encontrada' });

  const isCorrect = selected_option === question.correct_option ? 1 : 0;
  const timeSpent = Number.isFinite(Number(time_spent_seconds)) ? Math.max(0, Math.round(Number(time_spent_seconds))) : null;

  await dbRun(
    `INSERT INTO attempts (user, question_id, theme_id, selected_option, is_correct, source, time_spent_seconds)
     VALUES (?, ?, ?, ?, ?, 'pratica', ?)`,
    [user, question.id, question.theme_id, selected_option, isCorrect, timeSpent]
  );

  const existing = await dbGet('SELECT * FROM srs_queue WHERE user = ? AND question_id = ?', [user, question.id]);
  const currentStage = existing ? existing.stage : 0;
  const { nextStage, nextReviewAt } = scheduleNext(currentStage, !!isCorrect);
  const nextStreak = isCorrect ? (existing ? existing.correct_streak + 1 : 1) : 0;

  if (existing) {
    await dbRun(
      'UPDATE srs_queue SET stage = ?, next_review_at = ?, correct_streak = ? WHERE id = ?',
      [nextStage, nextReviewAt, nextStreak, existing.id]
    );
  } else {
    await dbRun(
      `INSERT INTO srs_queue (user, question_id, next_review_at, stage, correct_streak)
       VALUES (?, ?, ?, ?, ?)`,
      [user, question.id, nextReviewAt, nextStage, nextStreak]
    );
  }

  res.json({
    is_correct: !!isCorrect,
    correct_option: question.correct_option,
    explanation_correct: question.explanation_correct,
    explanations: {
      a: question.explanation_a,
      b: question.explanation_b,
      c: question.explanation_c,
      d: question.explanation_d,
    },
    source_note: question.source_note,
    level: question.level,
    next_review_in_days: [1, 3, 7, 15, 30][nextStage],
  });
}));

// POST /api/schedule/:id/status  { status: 'done' | 'skipped' | 'pending' }
router.post('/schedule/:id/status', express.json(), h(async (req, res) => {
  const user = req.session.role;
  const { status } = req.body;
  if (!['done', 'skipped', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status inválido' });
  }
  await dbRun('UPDATE schedule_blocks SET status = ? WHERE id = ? AND user = ?', [
    status,
    req.params.id,
    user,
  ]);
  res.json({ ok: true });
}));

// POST /api/schedule  { date, subject_id, theme_id, planned_minutes }
router.post('/schedule', express.json(), h(async (req, res) => {
  const user = req.session.role;
  const { date, subject_id, theme_id, planned_minutes } = req.body;
  if (!date || !subject_id) return res.status(400).json({ error: 'date e subject_id são obrigatórios' });
  const info = await dbRun(
    `INSERT INTO schedule_blocks (user, date, subject_id, theme_id, planned_minutes, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [user === 'admin' ? 'rayane' : user, date, subject_id, theme_id || null, planned_minutes || 30]
  );
  res.json({ ok: true, id: info.lastInsertRowid });
}));

router.delete('/schedule/:id', h(async (req, res) => {
  await dbRun('DELETE FROM schedule_blocks WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// SIMULADOS — só a Rayane pode fazer (o admin acompanha os resultados dela).
// ---------------------------------------------------------------------------

router.post('/simulado/start', requireRole('rayane'), express.json(), h(async (req, res) => {
  const user = req.session.role;
  const ongoing = await simuladoLib.getOngoingSimulado(user);
  if (ongoing) {
    return res.json({ ok: true, simulado_id: ongoing.id, resumed: true });
  }
  const { mode, subject, count } = req.body || {};
  let simuladoId;
  try {
    simuladoId = await simuladoLib.createSimulado(user, { mode, subject, count });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ ok: true, simulado_id: simuladoId, resumed: false });
}));

router.post('/simulado/:id/answer', requireRole('rayane'), express.json(), h(async (req, res) => {
  const user = req.session.role;
  const { sq_id, selected_option } = req.body;
  const simulado = await simuladoLib.getSimulado(req.params.id, user);
  if (!simulado) return res.status(404).json({ error: 'Simulado não encontrado' });
  if (simulado.status !== 'em_andamento') return res.status(400).json({ error: 'Este simulado já foi finalizado' });
  if (!sq_id || !['a', 'b', 'c', 'd'].includes(selected_option)) {
    return res.status(400).json({ error: 'sq_id e selected_option (a-d) são obrigatórios' });
  }
  await simuladoLib.answerQuestion(req.params.id, sq_id, selected_option);
  res.json({ ok: true });
}));

router.post('/simulado/:id/finish', requireRole('rayane'), h(async (req, res) => {
  const user = req.session.role;
  const simulado = await simuladoLib.getSimulado(req.params.id, user);
  if (!simulado) return res.status(404).json({ error: 'Simulado não encontrado' });
  const finished = await simuladoLib.finishSimulado(req.params.id, user);
  res.json({ ok: true, simulado: finished });
}));

router.get('/simulado/:id/tempo', requireRole('rayane'), h(async (req, res) => {
  const user = req.session.role;
  const simulado = await simuladoLib.getSimulado(req.params.id, user);
  if (!simulado) return res.status(404).json({ error: 'Simulado não encontrado' });
  res.json({ status: simulado.status, seconds_remaining: simuladoLib.secondsRemaining(simulado) });
}));

module.exports = router;
