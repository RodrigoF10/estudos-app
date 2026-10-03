const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../db');
const { requireRole } = require('../middleware/auth');
const { getSubjectProgress } = require('../lib/mastery');
const { examCountdown, ensurePlan } = require('../lib/planner');
const analytics = require('../lib/analytics');
const simuladoLib = require('../lib/simulado');

const STUDENT = 'rayane';

function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

router.use(requireRole('admin'));

router.get('/', h(async (req, res) => {
  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const progressBySubject = [];
  for (const s of subjects) {
    progressBySubject.push({ subject: s, progress: await getSubjectProgress(STUDENT, s.id) });
  }

  const countdown = await examCountdown();
  const totalAttemptsRow = await dbGet('SELECT COUNT(*) AS c FROM attempts WHERE user = ?', [STUDENT]);
  const totalCorrectRow = await dbGet('SELECT COUNT(*) AS c FROM attempts WHERE user = ? AND is_correct = 1', [STUDENT]);

  const last7 = await dbAll(
    `SELECT date(created_at) AS day, COUNT(*) AS total, SUM(is_correct) AS acertos
     FROM attempts WHERE user = ? AND created_at >= datetime('now', '-7 days')
     GROUP BY day ORDER BY day ASC`,
    [STUDENT]
  );

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const adherence = await dbAll(
    `SELECT status, COUNT(*) AS c FROM schedule_blocks
     WHERE user = ? AND date BETWEEN ? AND ? GROUP BY status`,
    [STUDENT, sevenDaysAgo, today]
  );

  // Alerta automático: temas de alta prioridade parados há mais de 7 dias sem prática
  const stalledHighPriority = await dbAll(
    `SELECT t.name AS theme_name, s.name AS subject_name, MAX(a.created_at) AS last_attempt
     FROM themes t
     JOIN subjects s ON s.id = t.subject_id
     LEFT JOIN attempts a ON a.theme_id = t.id AND a.user = ?
     WHERE t.low_priority = 0
     GROUP BY t.id
     HAVING last_attempt IS NULL OR last_attempt < datetime('now', '-7 days')
     ORDER BY last_attempt ASC
     LIMIT 8`,
    [STUDENT]
  );

  // Tempo de estudo — visível só para o administrador.
  const totalStudySeconds = await analytics.totalStudySeconds(STUDENT);
  const studyLast7DaysSeconds = await analytics.studySecondsLastDays(STUDENT, 7);
  const studyTime = {
    total: analytics.formatDuration(totalStudySeconds),
    last7Days: analytics.formatDuration(studyLast7DaysSeconds),
  };

  const simuladoHistory = (await simuladoLib.getHistory(STUDENT)).slice(0, 5);
  const ongoingSimulado = await simuladoLib.getOngoingSimulado(STUDENT);

  res.render('admin/overview', {
    progressBySubject,
    countdown,
    totalAttempts: totalAttemptsRow.c,
    totalCorrect: totalCorrectRow.c,
    last7,
    adherence,
    stalledHighPriority,
    studyTime,
    simuladoHistory,
    ongoingSimulado,
  });
}));

router.get('/materia/:slug', h(async (req, res) => {
  const subject = await dbGet('SELECT * FROM subjects WHERE slug = ?', [req.params.slug]);
  if (!subject) return res.status(404).send('Matéria não encontrada.');
  const progress = await getSubjectProgress(STUDENT, subject.id);
  res.render('admin/materia', { subject, progress });
}));

router.get('/atividade', h(async (req, res) => {
  const attempts = await dbAll(
    `SELECT a.*, q.stem, q.difficulty, t.name AS theme_name, s.name AS subject_name
     FROM attempts a
     JOIN questions q ON q.id = a.question_id
     JOIN themes t ON t.id = a.theme_id
     JOIN subjects s ON s.id = t.subject_id
     WHERE a.user = ?
     ORDER BY a.created_at DESC LIMIT 100`,
    [STUDENT]
  );
  res.render('admin/atividade', { attempts });
}));

router.get('/cronograma', h(async (req, res) => {
  await ensurePlan(STUDENT, 7);

  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const blocks = await dbAll(
    `SELECT sb.*, s.name AS subject_name, t.name AS theme_name
     FROM schedule_blocks sb
     JOIN subjects s ON s.id = sb.subject_id
     LEFT JOIN themes t ON t.id = sb.theme_id
     WHERE sb.user = ? ORDER BY sb.date ASC, sb.id ASC`,
    [STUDENT]
  );
  const themesBySubject = {};
  for (const s of subjects) {
    themesBySubject[s.id] = await dbAll('SELECT id, name FROM themes WHERE subject_id = ? ORDER BY priority_rank ASC', [s.id]);
  }
  res.render('admin/cronograma', { subjects, blocks, themesBySubject });
}));

module.exports = router;
