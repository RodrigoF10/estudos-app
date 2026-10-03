// Calcula o "selo de domínio" de cada tópico para um usuário, com base no
// histórico de tentativas (attempts). 4 níveis:
//   nao_iniciado -> em_desenvolvimento -> quase_la -> dominado
//
// "Dominado" exige boa taxa de acerto recente (>= 80% nas últimas 10) E
// evidência de retenção: ao menos um acerto feito 2,5+ dias depois da
// primeira tentativa (não é decoreba de curto prazo).
//
// Só entram tentativas de questões ATIVAS (o banco antigo foi desativado).

const { dbAll } = require('../db');

const LEVELS = {
  NAO_INICIADO: { key: 'nao_iniciado', label: 'Não iniciado', emoji: '🔴' },
  EM_DESENVOLVIMENTO: { key: 'em_desenvolvimento', label: 'Em desenvolvimento', emoji: '🟠' },
  QUASE_LA: { key: 'quase_la', label: 'Quase lá', emoji: '🟡' },
  DOMINADO: { key: 'dominado', label: 'Dominado', emoji: '🟢' },
};

function statsFromAttempts(attempts) {
  if (!attempts || attempts.length === 0) {
    return { level: LEVELS.NAO_INICIADO, attempts: 0, correct: 0, accuracy: null, uniqueQuestions: 0 };
  }
  const correctCount = attempts.filter((a) => a.is_correct).length;
  const recent = attempts.slice(-10);
  const recentAccuracy = recent.filter((a) => a.is_correct).length / recent.length;
  const first = new Date(attempts[0].created_at + 'Z').getTime();
  const hasRetention = attempts.some((a) => a.is_correct && (new Date(a.created_at + 'Z').getTime() - first) / 86400000 >= 2.5);

  let level;
  if (recentAccuracy < 0.5) level = LEVELS.EM_DESENVOLVIMENTO;
  else if (recentAccuracy < 0.8 || !hasRetention) level = LEVELS.QUASE_LA;
  else level = LEVELS.DOMINADO;

  return {
    level,
    attempts: attempts.length,
    correct: correctCount,
    accuracy: recentAccuracy,
    uniqueQuestions: new Set(attempts.map((a) => a.question_id)).size,
  };
}

// Uma única consulta traz todas as tentativas do usuário em questões/temas ativos.
async function getAllThemeStats(user) {
  const rows = await dbAll(
    `SELECT a.theme_id, a.question_id, a.is_correct, a.created_at
     FROM attempts a
     JOIN questions q ON q.id = a.question_id AND q.active = 1
     JOIN themes t ON t.id = a.theme_id AND t.active = 1
     WHERE a.user = ? ORDER BY a.created_at ASC, a.id ASC`,
    [user]
  );
  const byTheme = new Map();
  rows.forEach((r) => {
    if (!byTheme.has(r.theme_id)) byTheme.set(r.theme_id, []);
    byTheme.get(r.theme_id).push(r);
  });
  return byTheme;
}

async function getThemeStats(user, themeId) {
  const byTheme = await getAllThemeStats(user);
  return statsFromAttempts(byTheme.get(Number(themeId)));
}

async function getSubjectProgress(user, subjectId, preloaded) {
  const byTheme = preloaded || (await getAllThemeStats(user));
  const themes = await dbAll(
    'SELECT * FROM themes WHERE subject_id = ? AND active = 1 ORDER BY priority_rank ASC',
    [subjectId]
  );
  const themeStats = themes.map((t) => ({ theme: t, stats: statsFromAttempts(byTheme.get(t.id)) }));
  const started = themeStats.filter((t) => t.stats.attempts > 0).length;
  const mastered = themeStats.filter((t) => t.stats.level.key === 'dominado').length;
  const core = themeStats.filter((t) => t.theme.tier === 'core');
  const coreMastered = core.filter((t) => t.stats.level.key === 'dominado').length;
  return {
    themes: themeStats,
    totalThemes: themes.length,
    started,
    mastered,
    coreTotal: core.length,
    coreMastered,
  };
}

// Visão geral para a tela inicial/trilha: todas as matérias e tópicos de uma vez.
async function getAllProgress(user) {
  const byTheme = await getAllThemeStats(user);
  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');
  const out = [];
  for (const s of subjects) {
    out.push({ subject: s, progress: await getSubjectProgress(user, s.id, byTheme) });
  }
  return out;
}

module.exports = { LEVELS, statsFromAttempts, getAllThemeStats, getThemeStats, getSubjectProgress, getAllProgress };
