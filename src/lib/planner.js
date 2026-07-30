// Lógica de recomendação: "o que estudar hoje" e geração automática de um
// plano diário/semanal, para que a Rayane nunca fique sem saber por onde
// começar — se ela (ou o admin) não montou o cronograma manualmente, o
// sistema gera um automaticamente com base no peso de cada matéria na prova
// e no que ainda não foi dominado.

const { dbGet, dbAll, dbRun } = require('../db');
const { getSubjectProgress } = require('./mastery');

// Rotação de 7 posições usada para distribuir os dias da semana entre as
// matérias, respeitando aproximadamente o peso de cada uma na prova
// (Português 30%, Matemática 30%, Ciências 16%, Geografia 12%, História 12%).
const WEEK_SUBJECT_ROTATION = ['portugues', 'matematica', 'ciencias', 'portugues', 'matematica', 'geografia', 'historia'];

async function suggestNextTheme(user) {
  const subjects = await dbAll('SELECT * FROM subjects ORDER BY order_index ASC');

  let best = null;
  for (const subject of subjects) {
    const progress = await getSubjectProgress(user, subject.id);
    const masteryRatio = progress.totalThemes === 0 ? 0 : progress.mastered / progress.totalThemes;
    const deficit = subject.weight_percent * (1 - masteryRatio);

    const candidateTheme = pickThemeFromProgress(progress);
    if (!candidateTheme) continue; // matéria inteira dominada

    if (!best || deficit > best.deficit) {
      best = { subject, theme: candidateTheme.theme, stats: candidateTheme.stats, deficit, progress };
    }
  }
  return best;
}

// Dentro de um progresso de matéria já calculado, escolhe o melhor tema para
// estudar agora: primeiro tema de alta prioridade ainda não dominado; se
// todos os de alta prioridade já estiverem dominados, aceita um de baixa
// prioridade.
function pickThemeFromProgress(progress) {
  const highPriorityPending = progress.themes.find(
    (t) => t.theme.low_priority === 0 && t.stats.level.key !== 'dominado'
  );
  const anyPending = progress.themes.find((t) => t.stats.level.key !== 'dominado');
  return highPriorityPending || anyPending || null;
}

async function suggestThemeForSubject(user, subjectId) {
  const progress = await getSubjectProgress(user, subjectId);
  const candidate = pickThemeFromProgress(progress);
  // Se a matéria inteira já está dominada, sugere o tema de maior prioridade
  // mesmo assim, como revisão de manutenção.
  return candidate || (progress.themes[0] || null);
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

function dateStrAddDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function epochDayFor(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 86400000);
}

// Garante que exista pelo menos um bloco de estudo cadastrado para uma data
// específica. Só cria um bloco automático se aquele dia estiver
// completamente vazio — nunca sobrescreve ou duplica o que já foi
// planejado manualmente pela Rayane ou pelo admin.
async function ensureDayHasBlock(user, dateStr) {
  const existing = await dbGet('SELECT COUNT(*) AS c FROM schedule_blocks WHERE user = ? AND date = ?', [user, dateStr]);
  if (existing.c > 0) return false;

  const slug = WEEK_SUBJECT_ROTATION[((epochDayFor(dateStr) % 7) + 7) % 7];
  const subject = await dbGet('SELECT * FROM subjects WHERE slug = ?', [slug]);
  if (!subject) return false;

  const candidate = await suggestThemeForSubject(user, subject.id);
  const plannedMinutes = subject.weight_percent >= 30 ? 40 : 30;

  await dbRun(
    `INSERT INTO schedule_blocks (user, date, subject_id, theme_id, planned_minutes, status, auto_generated)
     VALUES (?, ?, ?, ?, ?, 'pending', 1)`,
    [user, dateStr, subject.id, candidate ? candidate.theme.id : null, plannedMinutes]
  );

  return true;
}

// Garante plano para hoje e para os próximos `days` dias (padrão: uma
// semana). Chamado sempre que a Rayane ou o admin abrem as páginas de "Hoje"
// ou "Cronograma", para que nunca haja um dia sem sugestão de estudo.
async function ensurePlan(user, days = 7) {
  for (let i = 0; i < days; i++) {
    await ensureDayHasBlock(user, dateStrAddDays(i));
  }
}

module.exports = { suggestNextTheme, suggestThemeForSubject, examCountdown, ensurePlan, ensureDayHasBlock, WEEK_SUBJECT_ROTATION };
