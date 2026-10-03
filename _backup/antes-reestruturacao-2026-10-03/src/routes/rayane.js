const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { getSubjectProgress, getThemeStats } = require('../lib/mastery');
const { suggestNextTheme, examCountdown, ensurePlan } = require('../lib/planner');
const analytics = require('../lib/analytics');
const simuladoLib = require('../lib/simulado');

const USER = 'rayane';

// Envolve um handler async para capturar erros de Promise rejeitada e
// repassá-los ao middleware de erro do Express (que não faz isso sozinho
// para funções async).
function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Rayane e Admin podem ver as páginas da Rayane (admin em modo "espelho" para
// entender a experiência dela); só a Rayane pode responder exercícios e fazer
// simulados (ver api.js e as checagens de papel abaixo).
router.use(requireLogin);

router.get('/', h(async (req, res) => {
  await ensurePlan(USER, 7); // garante que hoje e os próximos dias tenham sempre um plano

  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const suggestion = await suggestNextTheme(USER);
  const countdown = await examCountdown();

  const today = new Date().toISOString().slice(0, 10);
  const todayBlocks = await dbAll(
    `SELECT sb.*, s.name AS subject_name, t.name AS theme_name
     FROM schedule_blocks sb
     JOIN subjects s ON s.id = sb.subject_id
     LEFT JOIN themes t ON t.id = sb.theme_id
     WHERE sb.user = ? AND sb.date = ? ORDER BY sb.id ASC`,
    [USER, today]
  );

  const subjectsProgress = [];
  for (const s of subjects) {
    const p = await getSubjectProgress(USER, s.id);
    subjectsProgress.push({ subject: s, mastered: p.mastered, total: p.totalThemes, started: p.started });
  }

  const ongoingSimulado = await simuladoLib.getOngoingSimulado(USER);

  res.render('rayane/hoje', { subjects: subjectsProgress, suggestion, countdown, todayBlocks, ongoingSimulado });
}));

router.get('/materia/:slug', h(async (req, res) => {
  const subject = await dbGet('SELECT * FROM subjects WHERE slug = ?', [req.params.slug]);
  if (!subject) return res.status(404).send('Matéria não encontrada.');
  const progress = await getSubjectProgress(USER, subject.id);
  res.render('rayane/materia', { subject, progress });
}));

router.get('/tema/:id', h(async (req, res) => {
  const theme = await dbGet('SELECT * FROM themes WHERE id = ?', [req.params.id]);
  if (!theme) return res.status(404).send('Tema não encontrado.');
  const subject = await dbGet('SELECT * FROM subjects WHERE id = ?', [theme.subject_id]);
  const links = await dbAll('SELECT * FROM content_links WHERE theme_id = ? ORDER BY type ASC', [theme.id]);
  const stats = await getThemeStats(USER, theme.id);
  const questionCountRow = await dbGet('SELECT COUNT(*) AS c FROM questions WHERE theme_id = ?', [theme.id]);
  res.render('rayane/tema', { theme, subject, links, stats, questionCount: questionCountRow.c });
}));

router.get('/praticar/:themeId', h(async (req, res) => {
  const theme = await dbGet('SELECT * FROM themes WHERE id = ?', [req.params.themeId]);
  if (!theme) return res.status(404).send('Tema não encontrado.');
  const subject = await dbGet('SELECT * FROM subjects WHERE id = ?', [theme.subject_id]);
  const questionCountRow = await dbGet('SELECT COUNT(*) AS c FROM questions WHERE theme_id = ?', [theme.id]);
  res.render('rayane/praticar', { theme, subject, questionCount: questionCountRow.c });
}));

router.get('/progresso', h(async (req, res) => {
  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const progressBySubject = [];
  for (const s of subjects) {
    progressBySubject.push({ subject: s, progress: await getSubjectProgress(USER, s.id) });
  }
  const totalAttemptsRow = await dbGet('SELECT COUNT(*) AS c FROM attempts WHERE user = ?', [USER]);
  const totalCorrectRow = await dbGet('SELECT COUNT(*) AS c FROM attempts WHERE user = ? AND is_correct = 1', [USER]);
  const dashboardData = await analytics.buildDashboardData(USER);
  res.render('rayane/progresso', {
    progressBySubject,
    totalAttempts: totalAttemptsRow.c,
    totalCorrect: totalCorrectRow.c,
    dashboardData,
  });
}));

router.get('/cronograma', h(async (req, res) => {
  await ensurePlan(USER, 7);

  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const blocks = await dbAll(
    `SELECT sb.*, s.name AS subject_name, t.name AS theme_name
     FROM schedule_blocks sb
     JOIN subjects s ON s.id = sb.subject_id
     LEFT JOIN themes t ON t.id = sb.theme_id
     WHERE sb.user = ? ORDER BY sb.date ASC, sb.id ASC`,
    [USER]
  );
  const themesBySubject = {};
  for (const s of subjects) {
    themesBySubject[s.id] = await dbAll('SELECT id, name FROM themes WHERE subject_id = ? ORDER BY priority_rank ASC', [s.id]);
  }
  res.render('rayane/cronograma', { subjects, blocks, themesBySubject });
}));

// ---------------------------------------------------------------------------
// SIMULADOS
// ---------------------------------------------------------------------------

router.get('/simulado', h(async (req, res) => {
  const ongoing = await simuladoLib.getOngoingSimulado(USER);
  const history = await simuladoLib.getHistory(USER);
  res.render('rayane/simulado-intro', { ongoing, history });
}));

router.get('/simulado/:id', h(async (req, res) => {
  const simulado = await simuladoLib.getSimulado(req.params.id, USER);
  if (!simulado) return res.status(404).send('Simulado não encontrado.');

  if (simulado.status === 'finalizado') {
    return res.redirect(`/rayane/simulado/${simulado.id}/resultado`);
  }

  const secondsRemaining = simuladoLib.secondsRemaining(simulado);
  if (secondsRemaining <= 0) {
    await simuladoLib.finishSimulado(simulado.id, USER);
    return res.redirect(`/rayane/simulado/${simulado.id}/resultado`);
  }

  const questions = await simuladoLib.getSimuladoQuestionsForTaking(simulado.id);
  res.render('rayane/simulado-tomar', { simulado, questions, secondsRemaining });
}));

router.get('/simulado/:id/resultado', h(async (req, res) => {
  const summary = await simuladoLib.getResultSummary(req.params.id, USER);
  if (!summary || summary.simulado.status !== 'finalizado') {
    return res.status(404).send('Resultado ainda não disponível.');
  }
  res.render('rayane/simulado-resultado', summary);
}));

module.exports = router;
