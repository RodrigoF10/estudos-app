// Plano de 8 semanas (ancorado na data da prova) para sair de "estudo
// disperso" para ≥ 35 acertos em 50. Cada semana lista os tópicos do núcleo
// em ordem de retorno (mais cobrados primeiro) e o que fazer.
//
// Ritmo sugerido: 5–6 dias de estudo por semana, ~1h30 por dia
// (teoria curta 15–20 min + 15 questões + revisão do que errou).

const WEEK_PLAN = [
  {
    n: 1, phase: 1, title: 'Base: o que mais cai',
    topics: ['PT04', 'PT08', 'PT02', 'M02', 'M03', 'M04', 'M06'],
    goal: 'Aprender a teoria curta e fazer questões N1/N2. Português: figuras de linguagem, gêneros/argumentação, coesão. Matemática: razão/proporção, equações, álgebra, divisores.',
    simulado: 'Sábado: simulado rápido (20 questões) para medir o ponto de partida.',
  },
  {
    n: 2, phase: 1, title: 'Matemática de figuras e dados',
    topics: ['M12', 'M13', 'M14', 'M09', 'M10', 'M11', 'C01', 'C12'],
    goal: 'Geometria plana (áreas, Pitágoras, semelhança), estatística e probabilidade; começar Ciências com matéria/misturas e biologia.',
    simulado: 'Sábado: simulado por matéria — Matemática (15 questões).',
  },
  {
    n: 3, phase: 1, title: 'Ciências + Geografia + História (núcleo)',
    topics: ['C05', 'C09', 'C10', 'C03', 'G04', 'G01', 'G07', 'H03', 'H01', 'H07'],
    goal: 'Calor, astronomia, ecologia, átomo; biomas, fusos e globalização; Primeira República, escravização/abolição, Revolução Industrial.',
    simulado: 'Sábado: simulado rápido (20 questões).',
  },
  {
    n: 4, phase: 2, title: 'Português a fundo + O Alienista',
    topics: ['PT05', 'PT03', 'PT09', 'M07', 'M05', 'M01'],
    goal: 'Intertextualidade, modalização e a obra "O Alienista" (leitura + questões). Matemática: função afim, conjuntos, porcentagem.',
    simulado: 'Sábado: simulado por matéria — Português (15 questões).',
  },
  {
    n: 5, phase: 2, title: 'Ciências, Geografia e História (restante do núcleo)',
    topics: ['C11', 'C08', 'C02', 'C07', 'G06', 'G03', 'G02', 'H05', 'H04', 'H02', 'H09', 'H08'],
    goal: 'Corpo humano, óptica/som, mudanças de estado, mecânica; economia, cidades, população; ditadura, Era Vargas, Império, mundo contemporâneo.',
    simulado: 'Sábado: SIMULADO COMPLETO nº 1 (50 questões, 3 h).',
  },
  {
    n: 6, phase: 2, title: 'Complemento + reforço dos fracos',
    topics: ['PT06', 'PT07', 'M08', 'M15', 'M16', 'C04', 'C06', 'C13', 'G05', 'H06'],
    goal: 'Cobrir os tópicos de menor frequência (cada um vale ~1 questão) e voltar aos tópicos do núcleo marcados em vermelho/laranja.',
    simulado: 'Sábado: SIMULADO COMPLETO nº 2.',
  },
  {
    n: 7, phase: 3, title: 'Simulados e caderno de erros',
    topics: [],
    goal: 'Refazer o caderno de erros, rever os tópicos fracos de cada matéria e treinar o tempo de prova (3 h para 50 questões ≈ 3,6 min por questão).',
    simulado: 'Quarta: simulado por matéria na pior matéria. Sábado: SIMULADO COMPLETO nº 3.',
  },
  {
    n: 8, phase: 3, title: 'Reta final',
    topics: [],
    goal: 'Revisão leve: caderno de erros + resumos dos tópicos do núcleo. Sem conteúdo novo. Dormir bem na véspera, separar documento e material.',
    simulado: 'Quinta: SIMULADO COMPLETO nº 4 (último). Sexta e sábado: só revisão leve e descanso.',
  },
];

module.exports = { WEEK_PLAN };
