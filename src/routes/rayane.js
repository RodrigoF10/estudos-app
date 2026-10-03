const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../db');
const { requireLogin } = require('../middleware/auth');
const { getAllProgress, getSubjectProgress, getThemeStats, getAllThemeStats } = require('../lib/mastery');
const { suggestNextTheme, examCountdown, ensurePlan, studyPhase, PHASES, PASS_TARGET } = require('../lib/planner');
const { WEEK_PLAN } = require('../lib/plan');
const analytics = require('../lib/analytics');
const simuladoLib = require('../lib/simulado');

const USER = 'rayane';
const DAILY_GOAL = 15; // questões por dia (meta diária sugerida)

// Envolve um handler async para repassar erros ao middleware do Express.
function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// Rayane e Admin podem ver as páginas da Rayane (admin em modo "espelho");
// só a Rayane pode responder exercícios e fazer simulados (ver api.js).
router.use(requireLogin);

async function questionCounts() {
  const rows = await dbAll(
    `SELECT theme_id, COUNT(*) AS total,
            SUM(CASE WHEN origin = 'real' THEN 1 ELSE 0 END) AS real_count,
            SUM(CASE WHEN origin = 'autoral' THEN 1 ELSE 0 END) AS autoral_count
     FROM questions WHERE active = 1 GROUP BY theme_id`
  );
  const map = {};
  rows.forEach((r) => { map[r.theme_id] = { total: r.total, real: r.real_count, autoral: r.autoral_count }; });
  return map;
}

async function dueReviewCount() {
  const now = new Date().toISOString();
  const r = await dbGet(
    `SELECT COUNT(*) AS c FROM srs_queue s JOIN questions q ON q.id = s.question_id AND q.active = 1
     WHERE s.user = ? AND s.next_review_at <= ?`,
    [USER, now]
  );
  return r.c;
}

async function errorCount() {
  const r = await dbGet(
    `SELECT COUNT(*) AS c FROM questions q
     WHERE q.active = 1
     AND (SELECT a.is_correct FROM attempts a WHERE a.user = ? AND a.question_id = q.id ORDER BY a.id DESC LIMIT 1) = 0`,
    [USER]
  );
  return r.c;
}

router.get('/', h(async (req, res) => {
  await ensurePlan(USER, 7);

  const allProgress = await getAllProgress(USER);
  const byTheme = await getAllThemeStats(USER);
  const suggestion = await suggestNextTheme(USER, byTheme);
  const countdown = await examCountdown();
  const phase = studyPhase(countdown ? countdown.daysLeft : null);

  const today = new Date().toISOString().slice(0, 10);
  const todayBlocks = await dbAll(
    `SELECT sb.*, s.name AS subject_name, t.name AS theme_name
     FROM schedule_blocks sb
     JOIN subjects s ON s.id = sb.subject_id
     LEFT JOIN themes t ON t.id = sb.theme_id
     WHERE sb.user = ? AND sb.date = ? ORDER BY sb.id ASC`,
    [USER, today]
  );

  const subjectsProgress = allProgress.map(({ subject, progress }) => ({
    subject,
    mastered: progress.mastered,
    total: progress.totalThemes,
    coreMastered: progress.coreMastered,
    coreTotal: progress.coreTotal,
    started: progress.started,
  }));

  const ongoingSimulado = await simuladoLib.getOngoingSimulado(USER);
  const dueCount = await dueReviewCount();
  const errCount = await errorCount();
  const todayRow = await dbGet(
    "SELECT COUNT(*) AS c, COALESCE(SUM(is_correct),0) AS ok FROM attempts WHERE user = ? AND date(created_at) = date('now')",
    [USER]
  );

  // meta: último simulado completo ("projeção" em 50) e melhor
  const history = await simuladoLib.getHistory(USER);
  const completos = history.filter((x) => x.mode === 'completo' || x.total_questions === 50);
  const lastCompleto = completos[0] || null;
  const bestCompleto = completos.reduce((m, x) => (!m || x.correct_count > m.correct_count ? x : m), null);

  // tópicos do núcleo mais fracos (>= 3 tentativas)
  const weak = [];
  allProgress.forEach(({ subject, progress }) => {
    progress.themes.forEach((t) => {
      if (t.theme.tier === 'core' && t.stats.attempts >= 3 && t.stats.accuracy < 0.7) {
        weak.push({ subject, theme: t.theme, stats: t.stats });
      }
    });
  });
  weak.sort((a, b) => a.stats.accuracy - b.stats.accuracy);

  res.render('rayane/hoje', {
    subjects: subjectsProgress,
    suggestion,
    countdown,
    phase,
    todayBlocks,
    ongoingSimulado,
    dueCount,
    errCount,
    todayCount: todayRow.c,
    todayOk: todayRow.ok,
    dailyGoal: DAILY_GOAL,
    lastCompleto,
    bestCompleto,
    passTarget: PASS_TARGET,
    weak: weak.slice(0, 3),
  });
}));

// Mapa de estudo: todos os tópicos, núcleo (≈80%+ da prova) e complemento.
router.get('/trilha', h(async (req, res) => {
  const allProgress = await getAllProgress(USER);
  const counts = await questionCounts();
  const totalExp = allProgress.reduce((s, p) => s + p.progress.themes.reduce((a, t) => a + (t.theme.expected_per_exam || 0), 0), 0);
  const coreExp = allProgress.reduce(
    (s, p) => s + p.progress.themes.filter((t) => t.theme.tier === 'core').reduce((a, t) => a + (t.theme.expected_per_exam || 0), 0),
    0
  );
  res.render('rayane/trilha', { allProgress, counts, corePercent: totalExp ? Math.round((coreExp / totalExp) * 100) : 0 });
}));

router.get('/materia/:slug', h(async (req, res) => {
  const subject = await dbGet('SELECT * FROM subjects WHERE slug = ?', [req.params.slug]);
  if (!subject) return res.status(404).send('Matéria não encontrada.');
  const progress = await getSubjectProgress(USER, subject.id);
  const counts = await questionCounts();
  res.render('rayane/materia', { subject, progress, counts });
}));

router.get('/tema/:id', h(async (req, res) => {
  const theme = await dbGet('SELECT * FROM themes WHERE id = ? AND active = 1', [req.params.id]);
  if (!theme) return res.status(404).send('Tópico não encontrado.');
  const subject = await dbGet('SELECT * FROM subjects WHERE id = ?', [theme.subject_id]);
  const links = await dbAll('SELECT * FROM content_links WHERE theme_id = ? ORDER BY type ASC', [theme.id]);
  const stats = await getThemeStats(USER, theme.id);
  const byLevel = await dbAll(
    `SELECT level, origin, COUNT(*) AS c FROM questions WHERE theme_id = ? AND active = 1 GROUP BY level, origin`,
    [theme.id]
  );
  const total = byLevel.reduce((s, r) => s + r.c, 0);
  const realCount = byLevel.filter((r) => r.origin === 'real').reduce((s, r) => s + r.c, 0);
  const wrongCount = await dbGet(
    `SELECT COUNT(*) AS c FROM questions q
     WHERE q.theme_id = ? AND q.active = 1
     AND (SELECT a.is_correct FROM attempts a WHERE a.user = ? AND a.question_id = q.id ORDER BY a.id DESC LIMIT 1) = 0`,
    [theme.id, USER]
  );
  res.render('rayane/tema', {
    theme, subject, links, stats, questionCount: total, realCount, byLevel, wrongCount: wrongCount.c,
  });
}));

// Praticar um tópico (modo padrão), revisar vencidas ("revisao") ou refazer erros ("erros").
router.get('/praticar/:themeId', h(async (req, res) => {
  const theme = await dbGet('SELECT * FROM themes WHERE id = ? AND active = 1', [req.params.themeId]);
  if (!theme) return res.status(404).send('Tópico não encontrado.');
  const subject = await dbGet('SELECT * FROM subjects WHERE id = ?', [theme.subject_id]);
  const q = await dbGet('SELECT COUNT(*) AS c FROM questions WHERE theme_id = ? AND active = 1', [theme.id]);
  const mode = req.query.modo === 'erros' ? 'erros' : 'tema';
  res.render('rayane/praticar', {
    mode,
    theme,
    subject,
    questionCount: q.c,
    title: theme.name + (mode === 'erros' ? ' — refazer erros' : ''),
    backUrl: `/rayane/tema/${theme.id}`,
  });
}));

router.get('/praticar-erros', h(async (req, res) => {
  const n = await errorCount();
  res.render('rayane/praticar', {
    mode: 'erros', theme: null, subject: null, questionCount: n,
    title: 'Refazer meus erros', backUrl: '/rayane/erros',
  });
}));

router.get('/revisar', h(async (req, res) => {
  const dueCount = await dueReviewCount();
  res.render('rayane/praticar', {
    mode: 'revisao', theme: null, subject: null, questionCount: dueCount,
    title: 'Revisão espaçada', backUrl: '/rayane',
  });
}));

router.get('/erros', h(async (req, res) => {
  const rows = await dbAll(
    `SELECT q.id, q.stem, q.support_html, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option,
            q.explanation_correct, q.explanation_a, q.explanation_b, q.explanation_c, q.explanation_d,
            q.source_note, q.theme_id, t.name AS theme_name, t.code AS theme_code,
            s.name AS subject_name, s.slug AS subject_slug, la.selected_option, la.created_at AS answered_at
     FROM questions q
     JOIN themes t ON t.id = q.theme_id
     JOIN subjects s ON s.id = t.subject_id
     JOIN attempts la ON la.id = (SELECT MAX(a.id) FROM attempts a WHERE a.user = ? AND a.question_id = q.id)
     WHERE q.active = 1 AND la.is_correct = 0
     ORDER BY s.order_index ASC, t.priority_rank ASC, la.created_at DESC`,
    [USER]
  );
  res.render('rayane/erros', { rows });
}));

router.get('/plano', h(async (req, res) => {
  const countdown = await examCountdown();
  const phase = studyPhase(countdown ? countdown.daysLeft : null);
  const examDate = countdown ? new Date(countdown.examDate + 'T00:00:00') : null;
  const weeks = WEEK_PLAN.map((w, i) => {
    let from = null;
    let to = null;
    if (examDate) {
      const start = new Date(examDate);
      start.setDate(start.getDate() - 56 + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      from = start; to = end;
    }
    return { ...w, from, to };
  });
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const themeRows = await dbAll('SELECT id, code, name FROM themes WHERE active = 1 AND code IS NOT NULL');
  const themeByCode = {};
  themeRows.forEach((t) => { themeByCode[t.code] = t; });
  res.render('rayane/plano', { weeks, phase, PHASES, countdown, now, themeByCode, passTarget: PASS_TARGET });
}));

router.get('/progresso', h(async (req, res) => {
  const allProgress = await getAllProgress(USER);
  const progressBySubject = allProgress.map((p) => ({ subject: p.subject, progress: p.progress }));
  const totalAttemptsRow = await dbGet(
    `SELECT COUNT(*) AS c FROM attempts a JOIN questions q ON q.id = a.question_id AND q.active = 1 WHERE a.user = ?`,
    [USER]
  );
  const totalCorrectRow = await dbGet(
    `SELECT COUNT(*) AS c FROM attempts a JOIN questions q ON q.id = a.question_id AND q.active = 1
     WHERE a.user = ? AND a.is_correct = 1`,
    [USER]
  );
  const dashboardData = await analytics.buildDashboardData(USER);
  dashboardData.passTarget = Math.round((PASS_TARGET / 50) * 100);
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
    themesBySubject[s.id] = await dbAll(
      'SELECT id, name FROM themes WHERE subject_id = ? AND active = 1 ORDER BY priority_rank ASC',
      [s.id]
    );
  }
  res.render('rayane/cronograma', { subjects, blocks, themesBySubject });
}));

// ---------------------------------------------------------------------------
// SIMULADOS
// ---------------------------------------------------------------------------

router.get('/simulado', h(async (req, res) => {
  const ongoing = await simuladoLib.getOngoingSimulado(USER);
  const history = await simuladoLib.getHistory(USER);
  const subjects = await dbAll('SELECT slug, name FROM subjects ORDER BY order_index ASC');
  res.render('rayane/simulado-intro', { ongoing, history, subjects, passTarget: PASS_TARGET });
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
  res.render('rayane/simulado-resultado', { ...summary, passTarget: PASS_TARGET });
}));

module.exports = router;
