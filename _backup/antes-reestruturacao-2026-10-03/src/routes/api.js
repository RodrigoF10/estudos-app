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
    options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
    difficulty: q.difficulty,
  };
}

// GET /api/next-question?theme_id=5
// Prioridade: 1) revisões espaçadas já vencidas nesse tema; 2) questões nunca
// respondidas nesse tema; 3) se acabou tudo, a questão há mais tempo sem revisar.
router.get('/next-question', h(async (req, res) => {
  const user = req.session.role;
  const themeId = Number(req.params.theme_id || req.query.theme_id);
  if (!themeId) return res.status(400).json({ error: 'theme_id é obrigatório' });

  const now = new Date().toISOString();

  const dueReview = await dbGet(
    `SELECT q.* FROM srs_queue s
     JOIN questions q ON q.id = s.question_id
     WHERE s.user = ? AND q.theme_id = ? AND s.next_review_at <= ?
     ORDER BY s.next_review_at ASC LIMIT 1`,
    [user, themeId, now]
  );

  if (dueReview) {
    return res.json({ question: serializeQuestion(dueReview), reason: 'revisao' });
  }

  const neverAnswered = await dbGet(
    `SELECT q.* FROM questions q
     WHERE q.theme_id = ?
     AND q.id NOT IN (SELECT question_id FROM attempts WHERE user = ? AND theme_id = ?)
     ORDER BY RANDOM() LIMIT 1`,
    [themeId, user, themeId]
  );

  if (neverAnswered) {
    return res.json({ question: serializeQuestion(neverAnswered), reason: 'nova' });
  }

  // Já respondeu tudo pelo menos uma vez: pega a que está há mais tempo sem revisão
  // (ou sem entrada na fila ainda, o que também conta como "há muito tempo")
  const fallback = await dbGet(
    `SELECT q.* FROM questions q
     LEFT JOIN srs_queue s ON s.question_id = q.id AND s.user = ?
     WHERE q.theme_id = ?
     ORDER BY COALESCE(s.next_review_at, '0000-00-00') ASC LIMIT 1`,
    [user, themeId]
  );

  if (!fallback) return res.status(404).json({ error: 'Nenhuma questão cadastrada para este tema ainda.' });
  res.json({ question: serializeQuestion(fallback), reason: 'revisao_geral' });
}));

// POST /api/answer { question_id, selected_option, time_spent_seconds }
router.post('/answer', express.json(), h(async (req, res) => {
  const user = req.session.role;
  const { question_id, selected_option, time_spent_seconds } = req.body;
  if (!question_id || !['a', 'b', 'c', 'd'].includes(selected_option)) {
    return res.status(400).json({ error: 'question_id e selected_option (a-d) são obrigatórios' });
  }

  const question = await dbGet('SELECT * FROM questions WHERE id = ?', [question_id]);
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

router.post('/simulado/start', requireRole('rayane'), h(async (req, res) => {
  const user = req.session.role;
  const ongoing = await simuladoLib.getOngoingSimulado(user);
  if (ongoing) {
    return res.json({ ok: true, simulado_id: ongoing.id, resumed: true });
  }
  const simuladoId = await simuladoLib.createSimulado(user);
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
