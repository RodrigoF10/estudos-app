// Banco de questões — agrega os arquivos por matéria em src/questions/.
// Todas INÉDITAS, escritas no estilo e nível de dificuldade das provas do
// CEFET-MG, cobrindo os temas na proporção de sua prioridade real de cobrança
// (ver CEFET-MG-Analise-Prioridades-por-Materia.md).

const portugues = require('./questions/portugues');
const matematica = require('./questions/matematica');
const ciencias = require('./questions/ciencias');
const geografia = require('./questions/geografia');
const historia = require('./questions/historia');

const questions = [...portugues, ...matematica, ...ciencias, ...geografia, ...historia];

module.exports = { questions };
