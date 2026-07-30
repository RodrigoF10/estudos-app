// Repetição espaçada (SRS) simples, inspirada no princípio do Anki/SM-2:
// questões erradas voltam a aparecer em intervalos crescentes até serem dominadas.

const STAGE_INTERVALS_DAYS = [1, 3, 7, 15, 30];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Dado o estágio atual (0, 1, 2...) e se a resposta foi certa ou errada,
 * retorna o próximo estágio e a próxima data de revisão.
 */
function scheduleNext(currentStage, wasCorrect) {
  let nextStage;
  if (wasCorrect) {
    nextStage = Math.min(currentStage + 1, STAGE_INTERVALS_DAYS.length - 1);
  } else {
    nextStage = 0; // errou de novo: volta para o intervalo mais curto
  }
  const intervalDays = STAGE_INTERVALS_DAYS[nextStage];
  const nextReviewAt = addDays(new Date(), intervalDays).toISOString();
  return { nextStage, nextReviewAt, intervalDays };
}

// Um item "sai" da fila de revisão (é considerado dominado) depois de acertar
// consistentemente até o estágio de 15 dias ou mais.
const MASTERED_STAGE_THRESHOLD = 3;

module.exports = { scheduleNext, MASTERED_STAGE_THRESHOLD, STAGE_INTERVALS_DAYS };
