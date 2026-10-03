// Dados agregados para os gráficos do dashboard de progresso e para o
// contador de tempo de estudo do administrador.

const { dbGet, dbAll } = require('../db');
const { LEVELS } = require('./mastery');

// Evolução do aproveitamento ao longo do tempo (últimos `days` dias), agrupado por dia.
async function accuracyOverTime(user, days = 30) {
  const rows = await dbAll(
    `SELECT date(created_at) AS day, COUNT(*) AS total, SUM(is_correct) AS correct
     FROM attempts
     WHERE user = ? AND created_at >= datetime('now', ?)
     AND question_id IN (SELECT id FROM questions WHERE active = 1)
     GROUP BY day ORDER BY day ASC`,
    [user, `-${days} days`]
  );
  return rows.map((r) => ({
    day: r.day,
    total: r.total,
    correct: r.correct,
    accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
  }));
}

// Aproveitamento por matéria (todas as tentativas já feitas).
async function accuracyBySubject(user) {
  const rows = await dbAll(
    `SELECT s.name AS subject_name, s.slug AS subject_slug, COUNT(*) AS total, SUM(a.is_correct) AS correct
     FROM attempts a
     JOIN themes t ON t.id = a.theme_id
     JOIN subjects s ON s.id = t.subject_id
     JOIN questions q ON q.id = a.question_id AND q.active = 1
     WHERE a.user = ?
     GROUP BY s.id ORDER BY s.order_index ASC`,
    [user]
  );
  return rows.map((r) => ({
    subject_name: r.subject_name,
    total: r.total,
    correct: r.correct,
    accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0,
  }));
}

// Aproveitamento por nível de dificuldade da questão.
async function accuracyByDifficulty(user) {
  const order = { facil: 0, medio: 1, dificil: 2 };
  const labels = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };
  const rows = await dbAll(
    `SELECT q.difficulty AS difficulty, COUNT(*) AS total, SUM(a.is_correct) AS correct
     FROM attempts a
     JOIN questions q ON q.id = a.question_id AND q.active = 1
     WHERE a.user = ?
     GROUP BY q.difficulty`,
    [user]
  );
  const byKey = {};
  rows.forEach((r) => { byKey[r.difficulty] = r; });
  return ['facil', 'medio', 'dificil'].map((key) => {
    const r = byKey[key];
    const total = r ? r.total : 0;
    const correct = r ? r.correct : 0;
    return { difficulty: key, label: labels[key], total, correct, accuracy: total ? Math.round((correct / total) * 100) : 0 };
  }).sort((a, b) => order[a.difficulty] - order[b.difficulty]);
}

// Distribuição de temas por selo de domínio (para um gráfico de rosca/pizza).
async function masteryDistribution(user) {
  const { getAllProgress } = require('./mastery');
  const counts = { nao_iniciado: 0, em_desenvolvimento: 0, quase_la: 0, dominado: 0 };
  for (const { progress } of await getAllProgress(user)) {
    for (const t of progress.themes) {
      counts[t.stats.level.key] = (counts[t.stats.level.key] || 0) + 1;
    }
  }
  return Object.entries(LEVELS).map(([, level]) => ({
    key: level.key,
    label: level.label,
    emoji: level.emoji,
    count: counts[level.key] || 0,
  }));
}

// Histórico de notas em simulados finalizados.
async function simuladoScoreHistory(user) {
  const rows = await dbAll(
    `SELECT id, started_at, finished_at, total_questions, correct_count, mode
     FROM simulados WHERE user = ? AND status = 'finalizado' ORDER BY started_at ASC`,
    [user]
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.started_at.slice(0, 10),
    score: Math.round((r.correct_count / r.total_questions) * 100),
    correct: r.correct_count,
    total: r.total_questions,
    mode: r.mode,
    outOf50: Math.round((r.correct_count / r.total_questions) * 50 * 10) / 10,
  }));
}

async function buildDashboardData(user) {
  return {
    overTime: await accuracyOverTime(user, 30),
    bySubject: await accuracyBySubject(user),
    byDifficulty: await accuracyByDifficulty(user),
    mastery: await masteryDistribution(user),
    simulados: await simuladoScoreHistory(user),
  };
}

// Tempo total de estudo (só para o admin ver) — soma o tempo registrado em
// exercícios de prática (time_spent_seconds) e a duração de cada simulado
// finalizado (finished_at - started_at).
async function totalStudySeconds(user) {
  const practiceRow = await dbGet(
    `SELECT COALESCE(SUM(time_spent_seconds), 0) AS total FROM attempts
     WHERE user = ? AND source = 'pratica' AND time_spent_seconds IS NOT NULL`,
    [user]
  );
  const practiceSeconds = practiceRow.total;

  const simuladoRows = await dbAll(
    `SELECT started_at, finished_at FROM simulados WHERE user = ? AND status = 'finalizado'`,
    [user]
  );
  const simuladoSeconds = simuladoRows.reduce((sum, r) => {
    const start = new Date(r.started_at + 'Z').getTime();
    const end = new Date(r.finished_at + 'Z').getTime();
    return sum + Math.max(0, (end - start) / 1000);
  }, 0);

  return Math.round(practiceSeconds + simuladoSeconds);
}

async function studySecondsLastDays(user, days = 7) {
  const row = await dbGet(
    `SELECT COALESCE(SUM(time_spent_seconds), 0) AS total FROM attempts
     WHERE user = ? AND source = 'pratica' AND time_spent_seconds IS NOT NULL
     AND created_at >= datetime('now', ?)`,
    [user, `-${days} days`]
  );
  return Math.round(row.total);
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

module.exports = {
  accuracyOverTime,
  accuracyBySubject,
  accuracyByDifficulty,
  masteryDistribution,
  simuladoScoreHistory,
  buildDashboardData,
  totalStudySeconds,
  studySecondsLastDays,
  formatDuration,
};
