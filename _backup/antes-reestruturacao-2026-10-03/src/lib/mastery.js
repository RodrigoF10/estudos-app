// Calcula o "selo de domínio" de um tema para um usuário, com base no histórico
// de tentativas (attempts). Segue os 4 níveis descritos na especificação do site:
//   nao_iniciado -> em_desenvolvimento -> quase_la -> dominado
//
// "Dominado" exige não só boa taxa de acerto, mas também acerto em pelo menos
// uma tentativa feita alguns dias depois da primeira (indício de retenção real,
// não só decoreba de curto prazo).

const { dbAll } = require('../db');

const LEVELS = {
  NAO_INICIADO: { key: 'nao_iniciado', label: 'Não iniciado', emoji: '🔴' },
  EM_DESENVOLVIMENTO: { key: 'em_desenvolvimento', label: 'Em desenvolvimento', emoji: '🟠' },
  QUASE_LA: { key: 'quase_la', label: 'Quase lá', emoji: '🟡' },
  DOMINADO: { key: 'dominado', label: 'Dominado', emoji: '🟢' },
};

async function getThemeStats(user, themeId) {
  const attempts = await dbAll(
    'SELECT * FROM attempts WHERE user = ? AND theme_id = ? ORDER BY created_at ASC',
    [user, themeId]
  );

  if (attempts.length === 0) {
    return { level: LEVELS.NAO_INICIADO, attempts: 0, correct: 0, accuracy: null };
  }

  const correctCount = attempts.filter((a) => a.is_correct).length;
  const accuracy = correctCount / attempts.length;

  // Considera só as últimas 10 tentativas para a taxa de acerto "atual"
  const recent = attempts.slice(-10);
  const recentAccuracy = recent.filter((a) => a.is_correct).length / recent.length;

  const firstAttemptDate = new Date(attempts[0].created_at);
  const hasRetentionEvidence = attempts.some((a) => {
    const days = (new Date(a.created_at) - firstAttemptDate) / (1000 * 60 * 60 * 24);
    return a.is_correct && days >= 2.5;
  });

  let level;
  if (recentAccuracy < 0.5) {
    level = LEVELS.EM_DESENVOLVIMENTO;
  } else if (recentAccuracy < 0.8 || !hasRetentionEvidence) {
    level = LEVELS.QUASE_LA;
  } else {
    level = LEVELS.DOMINADO;
  }

  return { level, attempts: attempts.length, correct: correctCount, accuracy: recentAccuracy };
}

async function getSubjectProgress(user, subjectId) {
  const themes = await dbAll('SELECT * FROM themes WHERE subject_id = ? ORDER BY priority_rank ASC', [subjectId]);
  const themeStats = [];
  for (const t of themes) {
    themeStats.push({ theme: t, stats: await getThemeStats(user, t.id) });
  }
  const started = themeStats.filter((t) => t.stats.attempts > 0).length;
  const mastered = themeStats.filter((t) => t.stats.level.key === 'dominado').length;
  return { themes: themeStats, totalThemes: themes.length, started, mastered };
}

module.exports = { LEVELS, getThemeStats, getSubjectProgress };
