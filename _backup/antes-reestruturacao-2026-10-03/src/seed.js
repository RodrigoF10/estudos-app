// Popula o banco com matérias, temas (ordenados por prioridade real de cobrança),
// conteúdo curado (vídeos/artigos) e um banco inicial de questões com explicação completa.
// Baseado nos documentos de pesquisa: análise de 11 provas reais do CEFET-MG (2014-2025).
//
// IMPORTANTE: as questões abaixo são INÉDITAS, escritas no mesmo estilo e nível de
// dificuldade das provas reais do CEFET-MG, e não reproduzem nenhuma questão oficial.

const { client, initDb } = require('./db');

async function run() {
  await initDb();
  const tx = await client.transaction('write');
  try {
    await runInner(tx);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }
}

async function runInner(tx) {
  await tx.executeMultiple(`
    DELETE FROM simulado_questions;
    DELETE FROM simulados;
    DELETE FROM attempts;
    DELETE FROM srs_queue;
    DELETE FROM schedule_blocks;
    DELETE FROM questions;
    DELETE FROM content_links;
    DELETE FROM themes;
    DELETE FROM subjects;
    DELETE FROM settings;
  `);

  async function insertSubject(slug, name, weight, order) {
    const r = await tx.execute({
      sql: 'INSERT INTO subjects (slug, name, weight_percent, order_index) VALUES (?, ?, ?, ?)',
      args: [slug, name, weight, order],
    });
    return Number(r.lastInsertRowid);
  }

  async function insertTheme(subjectId, slug, name, priorityRank, lowPriority, isSpecial, summary) {
    const r = await tx.execute({
      sql: `INSERT INTO themes (subject_id, slug, name, priority_rank, low_priority, is_special, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [subjectId, slug, name, priorityRank, lowPriority, isSpecial, summary],
    });
    return Number(r.lastInsertRowid);
  }

  async function insertLink(themeId, type, title, url, source) {
    await tx.execute({
      sql: 'INSERT INTO content_links (theme_id, type, title, url, source) VALUES (?, ?, ?, ?, ?)',
      args: [themeId, type, title, url, source],
    });
  }

  async function insertQuestion(args) {
    await tx.execute({
      sql: `INSERT INTO questions
              (theme_id, stem, option_a, option_b, option_c, option_d, correct_option,
               explanation_correct, explanation_a, explanation_b, explanation_c, explanation_d, source_note, difficulty)
            VALUES (@theme_id, @stem, @option_a, @option_b, @option_c, @option_d, @correct_option,
                    @explanation_correct, @explanation_a, @explanation_b, @explanation_c, @explanation_d, @source_note, @difficulty)`,
      args,
    });
  }

  async function insertSetting(key, value) {
    await tx.execute({
      sql: `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      args: [key, value],
    });
  }

  await insertSetting('exam_date', '2026-11-29');
  await insertSetting('exam_format', '50 questões: 15 Português, 15 Matemática, 8 Ciências, 6 Geografia, 6 História (3 horas)');
  await insertSetting('literary_work', 'O Alienista — Machado de Assis (Papéis Avulsos)');

  // ---------------------------------------------------------------------
  // MATÉRIAS (peso real na prova de 2025/2027, confirmado oficialmente)
  // ---------------------------------------------------------------------
  const subjects = [
    { slug: 'portugues', name: 'Língua Portuguesa e Literatura', weight: 30, order: 1 },
    { slug: 'matematica', name: 'Matemática', weight: 30, order: 2 },
    { slug: 'ciencias', name: 'Ciências', weight: 16, order: 3 },
    { slug: 'geografia', name: 'Geografia', weight: 12, order: 4 },
    { slug: 'historia', name: 'História', weight: 12, order: 5 },
  ];
  const subjectId = {};
  for (const s of subjects) {
    subjectId[s.slug] = await insertSubject(s.slug, s.name, s.weight, s.order);
  }

  // ---------------------------------------------------------------------
  // TEMAS por matéria, na ordem "do que mais cai para o que menos cai"
  // (ver CEFET-MG-Analise-Prioridades-por-Materia.md, seções 2 a 6)
  // ---------------------------------------------------------------------
  const themesBySubject = {
    portugues: [
      { slug: 'obra-do-ano', name: 'Obra literária do ano — "O Alienista"', special: true,
        summary: 'A obra indicada sustenta entre 85% e 100% das questões de Português em todos os 11 anos analisados. É a prioridade máxima e absoluta.' },
      { slug: 'interpretacao-de-texto', name: 'Interpretação de texto',
        summary: 'Ideia central, opinião do autor, inferência, relações de sentido — aparece todo ano, quase sempre nas primeiras questões.' },
      { slug: 'intertextualidade', name: 'Intertextualidade',
        summary: 'Comparação com outras obras, músicas, epígrafes, mitologia e referências — muito recorrente, cruzando com a obra do ano.' },
      { slug: 'figuras-de-linguagem', name: 'Figuras de linguagem',
        summary: 'Metáfora, comparação, personificação, antítese, gradação.' },
      { slug: 'morfossintaxe', name: 'Morfossintaxe e classes gramaticais',
        summary: 'Advérbios, pronomes, verbos, conjunções e seu valor semântico.' },
      { slug: 'coesao-textual', name: 'Coesão textual',
        summary: 'Conectivos e referenciação.' },
      { slug: 'texto-multimodal', name: 'Leitura de texto multimodal',
        summary: 'Charge, meme, cartaz, post de rede social, imagem — ganhou força nas provas mais recentes.' },
      { slug: 'variacao-linguistica', name: 'Variação linguística e pontuação', low: true,
        summary: 'Recorrente, porém com menor frequência que os temas acima.' },
    ],
    matematica: [
      { slug: 'geometria-plana', name: 'Geometria plana',
        summary: 'Áreas, perímetros, ângulos, semelhança de triângulos, Teorema de Tales, Pitágoras, circunferência. O tema isolado mais cobrado da prova inteira (25% a 37% das questões de Matemática, todo ano).' },
      { slug: 'funcoes', name: 'Funções (afim e quadrática)',
        summary: 'Gráficos, zeros, interseções, estudo de sinal.' },
      { slug: 'estatistica', name: 'Estatística',
        summary: 'Média, mediana, moda, leitura de gráficos e tabelas.' },
      { slug: 'razao-proporcao', name: 'Razão, proporção e regra de três',
        summary: 'Regra de três simples, composta e inversa.' },
      { slug: 'algebra', name: 'Álgebra',
        summary: 'Produtos notáveis, fatoração, equações e sistemas.' },
      { slug: 'combinatoria-probabilidade', name: 'Análise combinatória e probabilidade',
        summary: 'Ganhou espaço nas provas de 2022-2025.' },
      { slug: 'porcentagem-financeira', name: 'Porcentagem e matemática financeira',
        summary: 'Juros simples e compostos, descontos e acréscimos.' },
      { slug: 'conjuntos-numeros', name: 'Conjuntos numéricos e teoria dos números',
        summary: 'Múltiplos, divisores, MDC/MMC, racionais.' },
      { slug: 'geometria-espacial', name: 'Geometria espacial', low: true,
        summary: 'Volumes de sólidos, vistas ortogonais — aparece, mas não todo ano.' },
      { slug: 'trigonometria', name: 'Trigonometria no triângulo retângulo', low: true,
        summary: 'Rara — apareceu explicitamente em poucos anos.' },
      { slug: 'logica-matematica', name: 'Lógica matemática', low: true,
        summary: 'Esporádica.' },
    ],
    ciencias: [
      { slug: 'ecologia', name: 'Ecologia',
        summary: 'Cadeias e teias alimentares, relações ecológicas, ciclos da matéria — o tema biológico mais cobrado historicamente.' },
      { slug: 'materia-mudancas-de-estado', name: 'Propriedades da matéria e mudanças de estado',
        summary: 'Misturas, densidade, curvas de aquecimento — recorrente em Física e Química.' },
      { slug: 'fisiologia-humana', name: 'Fisiologia humana',
        summary: 'Sistemas circulatório, respiratório, excretor, imunológico, sensorial.' },
      { slug: 'astronomia', name: 'Astronomia básica',
        summary: 'Rotação, translação, estações do ano, fases da Lua, eclipses.' },
      { slug: 'eletricidade-termologia', name: 'Eletricidade e termologia básicas',
        summary: 'Circuitos simples, potência, calor e temperatura.' },
      { slug: 'estrutura-atomica', name: 'Estrutura atômica e tabela periódica',
        summary: 'Modelos atômicos, prótons/elétrons, famílias da tabela periódica.' },
      { slug: 'botanica-reproducao', name: 'Botânica e reprodução', low: true,
        summary: 'Fotossíntese, morfologia floral, reprodução humana.' },
      { slug: 'quimica-inorganica', name: 'Funções inorgânicas e nomenclatura química', low: true,
        summary: 'Baixa prioridade diante do corte para só 8 questões de Ciências desde 2025.' },
      { slug: 'fisica-mecanica', name: 'Mecânica e Leis de Newton', low: true,
        summary: 'Inércia, queda livre, máquinas simples, cinemática básica — cai com pouca frequência desde o corte de 2025, mas já apareceu historicamente.' },
      { slug: 'fisica-optica', name: 'Óptica', low: true,
        summary: 'Reflexão, espelhos planos e curvos, formação de imagens — baixa prioridade, mas parte do currículo cobrado historicamente.' },
      { slug: 'fisica-hidrostatica', name: 'Hidrostática', low: true,
        summary: 'Empuxo, pressão, princípios de Arquimedes e Pascal — cobertura de reforço para não deixar brechas.' },
      { slug: 'quimica-leis-ponderais', name: 'Leis ponderais (Lavoisier e Proust)', low: true,
        summary: 'Conservação da massa, proporções fixas — tema de Química clássico, baixa frequência recente.' },
      { slug: 'quimica-misturas-separacao', name: 'Misturas e métodos de separação', low: true,
        summary: 'Tipos de mistura, filtração, decantação, destilação — reforço além do que já aparece em mudanças de estado.' },
      { slug: 'tabela-periodica', name: 'Tabela periódica e propriedades periódicas', low: true,
        summary: 'Famílias, períodos, raio atômico, eletronegatividade — complementa o tema de estrutura atômica.' },
      { slug: 'zoologia-bioquimica', name: 'Zoologia e bioquímica básica', low: true,
        summary: 'Classificação dos animais, biomoléculas (proteínas, carboidratos, lipídios) — cobertura de reforço em Biologia.' },
    ],
    geografia: [
      { slug: 'cartografia', name: 'Cartografia básica',
        summary: 'Fusos horários, coordenadas, escala, projeções, leitura de mapas — aparece em praticamente todos os anos.' },
      { slug: 'geografia-economica', name: 'Geografia econômica e globalização',
        summary: 'Blocos econômicos, desigualdade global, corporações transnacionais.' },
      { slug: 'demografia', name: 'Demografia',
        summary: 'Pirâmide etária, transição demográfica, distribuição populacional.' },
      { slug: 'urbanizacao', name: 'Urbanização',
        summary: 'Segregação espacial, megacidades, rede urbana.' },
      { slug: 'climatologia-biomas', name: 'Climatologia e biomas',
        summary: 'Classificação climática, vegetação, domínios morfoclimáticos.' },
      { slug: 'geografia-agraria', name: 'Geografia agrária',
        summary: 'Modernização do campo, conflitos fundiários, impactos ambientais.' },
      { slug: 'geografia-africa', name: 'Geografia da África',
        summary: 'Regionalização, diversidade étnica, conflitos territoriais — ganhou força nas provas mais recentes.' },
      { slug: 'geografia-transportes', name: 'Geografia dos transportes', low: true,
        summary: 'Baixa prioridade — aparece pouco.' },
    ],
    historia: [
      { slug: 'brasil-republicano', name: 'Brasil Republicano (1889 em diante)',
        summary: 'Primeira República, Era Vargas, Ditadura Militar, Nova República — sozinhos, mais da metade das questões de História nos anos analisados.' },
      { slug: 'guerra-fria', name: 'Guerra Fria',
        summary: 'Corrida armamentista, propaganda anticomunista, direitos civis.' },
      { slug: 'imperialismo', name: 'Imperialismo e Neocolonialismo',
        summary: 'Partilha da África e da Ásia.' },
      { slug: 'brasil-colonia-imperio', name: 'Brasil Colônia e Império',
        summary: 'Escravidão, abolição, Independência.' },
      { slug: 'escravidao-diaspora-africana', name: 'Escravidão e diáspora africana',
        summary: 'Quilombos, resistência negra, tráfico transatlântico, herança cultural — tema distinto do recorte de Brasil Colônia, com peso próprio nas provas.' },
      { slug: 'totalitarismos', name: 'Totalitarismos europeus',
        summary: 'Fascismo, nazismo, Entreguerras.' },
      { slug: 'atualidade-historica', name: 'Atualidade com recorte histórico',
        summary: 'Charges e notícias recentes puxando para um conceito histórico — crescente nas provas mais recentes.' },
      { slug: 'historia-antiga-medieval', name: 'História Antiga e Idade Média', low: true,
        summary: 'Não-prioridade clara: consta do currículo geral, mas quase nunca aparece nas 11 provas analisadas.' },
    ],
  };

  const themeId = {};
  for (const [subjSlug, themes] of Object.entries(themesBySubject)) {
    for (let idx = 0; idx < themes.length; idx++) {
      const t = themes[idx];
      themeId[`${subjSlug}.${t.slug}`] = await insertTheme(
        subjectId[subjSlug],
        t.slug,
        t.name,
        idx + 1,
        t.low ? 1 : 0,
        t.special ? 1 : 0,
        t.summary || ''
      );
    }
  }

  // ---------------------------------------------------------------------
  // CONTEÚDO CURADO (vídeos/artigos) — ponto de partida, revisar periodicamente
  // ---------------------------------------------------------------------
  const links = [
    // Transversal / Matemática
    { theme: 'matematica.geometria-plana', type: 'video', title: 'Geometria Plana — Professor Ferretto', url: 'https://www.youtube.com/@ProfessorFerretto', source: 'YouTube' },
    { theme: 'matematica.geometria-plana', type: 'article', title: 'Geometria Plana — Toda Matéria', url: 'https://www.todamateria.com.br/geometria-plana/', source: 'Toda Matéria' },
    { theme: 'matematica.funcoes', type: 'video', title: 'Funções — Professor Grings', url: 'https://www.youtube.com/@marcosgrings', source: 'YouTube' },
    { theme: 'matematica.funcoes', type: 'article', title: 'Função Afim e Função Quadrática — Toda Matéria', url: 'https://www.todamateria.com.br/funcao-do-1-grau-funcao-afim/', source: 'Toda Matéria' },
    { theme: 'matematica.estatistica', type: 'video', title: 'Exercícios de Matemática por tema — Só Exercícios', url: 'https://www.soexercicios.com.br/', source: 'Só Exercícios' },

    // Ciências
    { theme: 'ciencias.ecologia', type: 'video', title: 'Ecologia — Biologia Total (Prof. Jubilut)', url: 'https://www.youtube.com/@biologiatotal', source: 'YouTube' },
    { theme: 'ciencias.ecologia', type: 'article', title: 'Ecologia — Toda Matéria', url: 'https://www.todamateria.com.br/ecologia/', source: 'Toda Matéria' },
    { theme: 'ciencias.materia-mudancas-de-estado', type: 'article', title: 'Mudanças de Estado Físico — Mundo Educação', url: 'https://mundoeducacao.uol.com.br/quimica/mudancas-estado-fisico.htm', source: 'Mundo Educação' },
    { theme: 'ciencias.astronomia', type: 'video', title: 'Astronomia básica — YouTube Edu (Google + Fundação Lemann)', url: 'https://www.youtube.com/user/YouTubeEDU', source: 'YouTube Edu' },

    // Geografia
    { theme: 'geografia.cartografia', type: 'article', title: 'Cartografia — Toda Matéria', url: 'https://www.todamateria.com.br/cartografia/', source: 'Toda Matéria' },
    { theme: 'geografia.cartografia', type: 'video', title: 'Cartografia — Se Liga Nessa História', url: 'https://www.youtube.com/@seliganessahistoria', source: 'YouTube' },
    { theme: 'geografia.geografia-economica', type: 'article', title: 'Globalização — Brasil Escola', url: 'https://brasilescola.uol.com.br/geografia/globalizacao.htm', source: 'Brasil Escola' },
    { theme: 'geografia.geografia-africa', type: 'article', title: 'Geografia da África — Toda Matéria', url: 'https://www.todamateria.com.br/geografia-da-africa/', source: 'Toda Matéria' },

    // História
    { theme: 'historia.brasil-republicano', type: 'video', title: 'Brasil República — História Online', url: 'https://www.youtube.com/@historiaonlineoficial', source: 'YouTube' },
    { theme: 'historia.brasil-republicano', type: 'article', title: 'Era Vargas — Toda Matéria', url: 'https://www.todamateria.com.br/era-vargas/', source: 'Toda Matéria' },
    { theme: 'historia.guerra-fria', type: 'article', title: 'Guerra Fria — Brasil Escola', url: 'https://brasilescola.uol.com.br/historiag/guerra-fria.htm', source: 'Brasil Escola' },
    { theme: 'historia.escravidao-diaspora-africana', type: 'article', title: 'Escravidão no Brasil — Toda Matéria', url: 'https://www.todamateria.com.br/escravidao-no-brasil/', source: 'Toda Matéria' },

    // Português
    { theme: 'portugues.interpretacao-de-texto', type: 'article', title: 'Interpretação de Texto — Toda Matéria', url: 'https://www.todamateria.com.br/interpretacao-de-texto/', source: 'Toda Matéria' },
    { theme: 'portugues.intertextualidade', type: 'article', title: 'Intertextualidade — Mundo Educação', url: 'https://mundoeducacao.uol.com.br/redacao/intertextualidade.htm', source: 'Mundo Educação' },
    { theme: 'portugues.obra-do-ano', type: 'article', title: '"O Alienista" — resumo e análise — Toda Matéria', url: 'https://www.todamateria.com.br/o-alienista/', source: 'Toda Matéria' },
  ];
  for (const l of links) {
    await insertLink(themeId[l.theme], l.type, l.title, l.url, l.source);
  }

  // ---------------------------------------------------------------------
  // BANCO INICIAL DE QUESTÕES (inéditas, estilo CEFET-MG) — ver seed-questions.js
  // ---------------------------------------------------------------------
  const { questions } = require('./seed-questions');
  // Questões que já não trazem "difficulty" explícito (banco inicial de 196)
  // recebem um nível estimado automaticamente, alternando em ciclo por tema,
  // só para que o recurso de "desempenho por nível" funcione desde já.
  // Pode ser refinado manualmente depois, editando os arquivos em src/questions/.
  const DIFFICULTY_CYCLE = ['facil', 'medio', 'dificil', 'medio'];
  const difficultyCounterByTheme = {};
  for (const q of questions) {
    const { theme, difficulty, ...rest } = q;
    let diff = difficulty;
    if (!diff) {
      const idx = difficultyCounterByTheme[theme] || 0;
      diff = DIFFICULTY_CYCLE[idx % DIFFICULTY_CYCLE.length];
      difficultyCounterByTheme[theme] = idx + 1;
    }
    await insertQuestion({ ...rest, theme_id: themeId[theme], difficulty: diff });
  }

  console.log(`Seed concluído: ${subjects.length} matérias, ${Object.keys(themeId).length} temas, ${links.length} conteúdos curados, ${questions.length} questões.`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
