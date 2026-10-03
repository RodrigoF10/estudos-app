// Lógica de recomendação: "o que estudar hoje" e geração automática de plano.
//
// Estratégia (meta: 35+ acertos em 50 em ~2 meses): o que mais rende é atacar
// primeiro os tópicos que MAIS CAEM na prova (núcleo = ~80–88% das questões
// das provas 2016–2026) e em que ela mais perde pontos. Por isso a sugestão
// usa "questões esperadas por prova × (1 − aproveitamento atual)".

const { dbGet, dbAll, dbRun } = require('../db');
const { statsFromAttempts, getAllThemeStats } = require('./mastery');

const WEEK_SUBJECT_ROTATION = ['portugues', 'matematica', 'ciencias', 'portugues', 'matematica', 'geografia', 'historia'];

const PASS_TARGET = 35; // meta de acertos em 50 questões
const FAIL_BELOW = 10; // menos que isso, eliminada

async function loadCandidates(user, byTheme, subjectId) {
  const themes = await dbAll(
    `SELECT t.*, s.slug AS subject_slug, s.name AS subject_name,
            (SELECT COUNT(*) FROM questions q WHERE q.theme_id = t.id AND q.active = 1) AS qcount
     FROM themes t JOIN subjects s ON s.id = t.subject_id
     WHERE t.active = 1 ${subjectId ? 'AND t.subject_id = ?' : ''}
     ORDER BY t.priority_rank ASC`,
    subjectId ? [subjectId] : []
  );
  return themes
    .filter((t) => t.qcount > 0)
    .map((t) => {
      const stats = statsFromAttempts(byTheme.get(t.id));
      const acc = stats.accuracy == null ? 0 : stats.accuracy;
      const loss = (t.expected_per_exam || 0.3) * (stats.level.key === 'dominado' ? 0.15 : 1 - acc);
      return { theme: t, stats, loss };
    });
}

function pickBest(cands) {
  const pending = cands.filter((c) => c.stats.level.key !== 'dominado');
  const core = pending.filter((c) => c.theme.tier === 'core');
  const pool = core.length ? core : pending;
  if (!pool.length) return null;
  return pool.slice().sort((a, b) => b.loss - a.loss || a.theme.priority_rank - b.theme.priority_rank)[0];
}

async function suggestNextTheme(user, byThemePre) {
  const byTheme = byThemePre || (await getAllThemeStats(user));
  const cands = await loadCandidates(user, byTheme, null);
  const best = pickBest(cands);
  if (!best) return null;
  const subject = await dbGet('SELECT * FROM subjects WHERE id = ?', [best.theme.subject_id]);
  return { subject, theme: best.theme, stats: best.stats, loss: best.loss };
}

async function suggestThemeForSubject(user, subjectId, byThemePre) {
  const byTheme = byThemePre || (await getAllThemeStats(user));
  const cands = await loadCandidates(user, byTheme, subjectId);
  const best = pickBest(cands);
  if (best) return { theme: best.theme, stats: best.stats };
  // matéria toda dominada: revisão de manutenção do tópico mais cobrado
  return cands[0] ? { theme: cands[0].theme, stats: cands[0].stats } : null;
}

async function examCountdown() {
  const row = await dbGet("SELECT value FROM settings WHERE key = 'exam_date'");
  const examDate = row ? new Date(row.value + 'T00:00:00') : null;
  if (!examDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
  return { examDate: row.value, daysLeft: diffDays };
}

// Fases do plano de ~8 semanas, definidas pelos dias que faltam para a prova.
function studyPhase(daysLeft) {
  if (daysLeft == null) return PHASES[0];
  if (daysLeft > 35) return PHASES[0];
  if (daysLeft > 14) return PHASES[1];
  return PHASES[2];
}
const PHASES = [
  {
    key: 1,
    label: 'Fase 1 — Construir a base (núcleo da prova)',
    desc: 'Estude a teoria curta e faça questões dos tópicos que mais caem, começando pelo nível 1 e 2. Meta da fase: todos os tópicos do núcleo em "Quase lá".',
  },
  {
    key: 2,
    label: 'Fase 2 — Treino em volume',
    desc: 'Questões reais e autorais de todos os tópicos, "O Alienista" e o complemento. Revisão espaçada dos erros. 1 simulado por semana.',
  },
  {
    key: 3,
    label: 'Fase 3 — Reta final',
    desc: 'Simulados completos com cronômetro, revisão do caderno de erros e dos tópicos fracos. Descanso na véspera.',
  },
];

function dateStrAddDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function epochDayFor(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 86400000);
}

async function ensureDayHasBlock(user, dateStr, byTheme) {
  const existing = await dbGet('SELECT COUNT(*) AS c FROM schedule_blocks WHERE user = ? AND date = ?', [user, dateStr]);
  if (existing.c > 0) return false;

  const slug = WEEK_SUBJECT_ROTATION[((epochDayFor(dateStr) % 7) + 7) % 7];
  const subject = await dbGet('SELECT * FROM subjects WHERE slug = ?', [slug]);
  if (!subject) return false;

  const candidate = await suggestThemeForSubject(user, subject.id, byTheme);
  const plannedMinutes = subject.weight_percent >= 30 ? 40 : 30;

  await dbRun(
    `INSERT INTO schedule_blocks (user, date, subject_id, theme_id, planned_minutes, status, auto_generated)
     VALUES (?, ?, ?, ?, ?, 'pending', 1)`,
    [user, dateStr, subject.id, candidate ? candidate.theme.id : null, plannedMinutes]
  );
  return true;
}

async function ensurePlan(user, days = 7) {
  const byTheme = await getAllThemeStats(user);
  for (let i = 0; i < days; i++) {
    await ensureDayHasBlock(user, dateStrAddDays(i), byTheme);
  }
}

module.exports = {
  suggestNextTheme,
  suggestThemeForSubject,
  examCountdown,
  studyPhase,
  PHASES,
  PASS_TARGET,
  FAIL_BELOW,
  ensurePlan,
  ensureDayHasBlock,
  WEEK_SUBJECT_ROTATION,
};
