// Carrega, mescla e valida todo o conteúdo de estudo:
//   - topics.json        → 53 tópicos (taxonomia por frequência nas provas 2016–2026)
//   - theory/*.txt       → resumo teórico "o que a banca cobra" de cada tópico
//   - real.json + real-ex/*.txt → questões REAIS do CEFET-MG com explicações
//   - questions/*.txt    → questões AUTORAIS no padrão da prova (inclui O Alienista)
//
// Regras do projeto (mesma metodologia do agente Professor CEFET):
//   * toda questão tem origem rotulada (real/autoral), nível N1–N3 e formato;
//   * as 4 alternativas têm explicação; a chave é validada;
//   * nenhuma questão real ligada a obras de edições anteriores;
//   * todas as questões sobre "O Alienista" são autorais.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseBlocks } = require('./parse');
const { theoryToHtml } = require('./theory');

const DIR = __dirname;
const CONTENT_VERSION = 3;

const SUBJECTS = [
  { slug: 'portugues', name: 'Língua Portuguesa e Literatura', weight: 30, order: 1, count: 15 },
  { slug: 'matematica', name: 'Matemática', weight: 30, order: 2, count: 15 },
  { slug: 'ciencias', name: 'Ciências', weight: 16, order: 3, count: 8 },
  { slug: 'geografia', name: 'Geografia', weight: 12, order: 4, count: 6 },
  { slug: 'historia', name: 'História', weight: 12, order: 5, count: 6 },
];
const SUBJECT_BY_NAME = {
  Português: 'portugues',
  Matemática: 'matematica',
  Ciências: 'ciencias',
  Geografia: 'geografia',
  História: 'historia',
};

const FOOTERS = [
  /\s*Centro Federal de Educação Tecnológica.*$/i,
  /\s*versão adaptada.*$/i,
  /\s*\d{0,3}\s*Integrado\s*[•·|]?\s*CEFET-MG.*$/i,
  /\s*As questões de \(\d+\) a \(\d+\) referem-se.*$/i,
  /\s+(HISTÓRIA|GEOGRAFIA|MATEMÁTICA|CIÊNCIAS|LÍNGUA PORTUGUESA|LITERATURA|Formas de relevo)\s*$/,
];

function cleanText(s) {
  let t = String(s == null ? '' : s);
  FOOTERS.forEach((re) => { t = t.replace(re, ''); });
  t = t.replace(/([a-zà-úç])- ([a-zà-úç])/g, '$1$2'); // hifenização de fim de linha
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

const SUB = { 1: '₁', 2: '₂', 3: '₃', 4: '₄' };
const SUP = { 2: '²', 3: '³' };
// Texto extraído do PDF perde sobrescritos/subscritos (cm3, N1, v2...): restaura os casos seguros.
function fixScripts(t) {
  return t
    .replace(/\b(cm|dm|mm|km|m)([23])\b/g, (m, u, n) => u + SUP[n])
    .replace(/\b([vNO])([1-4])\b/g, (m, l, n) => l + SUB[n]);
}

function readDir(sub, ext = '.txt') {
  const d = path.join(DIR, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(ext)).sort().map((f) => ({
    file: `${sub}/${f}`,
    text: fs.readFileSync(path.join(d, f), 'utf8'),
  }));
}

function levelToDifficulty(level) {
  return level === 1 ? 'facil' : level === 3 ? 'dificil' : 'medio';
}

function originLabel(q) {
  if (q.origin === 'real') return `📚 REAL — CEFET-MG ${q.exam_year}, Q.${String(q.exam_number).padStart(2, '0')} · Nível N${q.level}`;
  if (q.obra) return `✍️ AUTORAL — O Alienista (padrão CEFET) · Nível N${q.level}`;
  return `✍️ AUTORAL (padrão CEFET) · Nível N${q.level}`;
}

function loadTopics() {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'topics.json'), 'utf8'));
  return raw.map((t) => ({
    code: t.code,
    subject: SUBJECT_BY_NAME[t.subj],
    name: t.name,
    tier: t.tier,
    rank: t.rank,
    expected: t.exp,
    hits: t.count,
    recent: t.recent,
  }));
}

// Teoria: blocos "@PT04" seguidos de texto livre (mini-markdown) até o próximo "@".
function loadTheory() {
  const out = {};
  readDir('theory').forEach(({ text }) => {
    const parts = text.replace(/\r\n/g, '\n').split(/^@(?=[A-Z]{1,2}\d{2}\b)/m).slice(1);
    parts.forEach((p) => {
      const nl = p.indexOf('\n');
      const head = p.slice(0, nl).trim().split(/\s+/);
      const code = head[0];
      const body = p.slice(nl + 1);
      const sum = /^resumo:\s*(.*)$/m.exec(body);
      out[code] = {
        summary: sum ? sum[1].trim() : '',
        html: theoryToHtml(body.replace(/^resumo:.*$/m, '').trim()),
      };
    });
  });
  return out;
}

function buildRealQuestions(errors, warnings) {
  const stage = JSON.parse(fs.readFileSync(path.join(DIR, 'real.json'), 'utf8'));
  const byId = new Map(stage.map((q) => [q.id, q]));
  const blocks = new Map();
  readDir('real-ex').forEach(({ file, text }) => {
    parseBlocks(text, file).forEach((b) => {
      if (blocks.has(b.id)) errors.push(`${b.where}: ${b.id} duplicado em real-ex`);
      blocks.set(b.id, b);
    });
  });

  const out = [];
  blocks.forEach((b, id) => {
    if (b.fields.exclude) return;
    const s = byId.get(id);
    if (!s) {
      errors.push(`${b.where}: ${id} não existe em real.json (e não está marcado exclude)`);
      return;
    }
    const f = b.fields;
    const stem = fixScripts(cleanText(f.stem !== undefined ? f.stem : s.stem));
    const opts = [1, 2, 3, 4].map((i) => fixScripts(cleanText(f['o' + i] !== undefined ? f['o' + i] : s.o[i - 1])));
    const key = (f.key || '').toUpperCase();
    if (key !== s.gab) errors.push(`${b.where}: ${id} chave ${key} difere do gabarito oficial ${s.gab}`);
    out.push({
      ext_id: id,
      origin: 'real',
      topic: s.topic,
      level: s.level,
      format: s.format,
      exam_year: s.year,
      exam_number: s.num,
      obra: 0,
      support_html: f.sup ? f.sup : null,
      stem,
      options: opts,
      key: s.gab.toLowerCase(),
      expl: ['a', 'b', 'c', 'd'].map((l) => (f[l] || '').trim()),
      where: b.where,
    });
  });
  stage.forEach((s) => {
    if (!blocks.has(s.id)) warnings.push(`${s.id}: sem explicação em real-ex (fora do banco)`);
  });
  return out;
}

function buildAuthoredQuestions(errors) {
  const out = [];
  const seen = new Set();
  readDir('questions').forEach(({ file, text }) => {
    parseBlocks(text, file).forEach((b) => {
      if (seen.has(b.id)) errors.push(`${b.where}: id ${b.id} duplicado`);
      seen.add(b.id);
      const f = b.fields;
      const m = /^A-([A-Z]{1,2}\d{2})-(\d+)$/.exec(b.id);
      if (!m) { errors.push(`${b.where}: id "${b.id}" fora do padrão A-TÓPICO-NN`); return; }
      const lv = b.tokens.find((t) => /^N[123]$/.test(t));
      const obra = b.tokens.includes('obra') ? 1 : 0;
      const fmt = b.tokens.filter((t) => !/^N[123]$/.test(t) && t !== 'obra').join(' ') || 'direta';
      out.push({
        ext_id: b.id,
        origin: 'autoral',
        topic: m[1],
        level: lv ? Number(lv[1]) : 2,
        format: fmt,
        exam_year: null,
        exam_number: null,
        obra,
        support_html: f.sup || null,
        stem: cleanText(f.stem),
        options: [1, 2, 3, 4].map((i) => cleanText(f['o' + i])),
        key: (f.key || '').toLowerCase(),
        expl: ['a', 'b', 'c', 'd'].map((l) => (f[l] || '').trim()),
        where: b.where,
      });
    });
  });
  return out;
}

let cache = null;

function loadContent() {
  if (cache) return cache;
  const errors = [];
  const warnings = [];
  const topics = loadTopics();
  const theory = loadTheory();
  const topicByCode = new Map(topics.map((t) => [t.code, t]));
  const questions = [...buildRealQuestions(errors, warnings), ...buildAuthoredQuestions(errors)];

  const ids = new Set();
  questions.forEach((q) => {
    const w = q.where || q.ext_id;
    if (ids.has(q.ext_id)) errors.push(`${w}: ext_id repetido ${q.ext_id}`);
    ids.add(q.ext_id);
    if (!topicByCode.has(q.topic)) errors.push(`${w}: tópico ${q.topic} inexistente`);
    if (!q.stem) errors.push(`${w}: enunciado vazio`);
    if (q.options.some((o) => !o)) errors.push(`${w}: alternativa vazia`);
    if (new Set(q.options).size < 4) errors.push(`${w}: alternativas repetidas`);
    if (!['a', 'b', 'c', 'd'].includes(q.key)) errors.push(`${w}: chave inválida "${q.key}"`);
    q.expl.forEach((e, i) => { if (e.length < 12) errors.push(`${w}: explicação ${'abcd'[i]} ausente/curta`); });
    if (q.origin === 'autoral' && !q.obra && q.topic === 'PT09') errors.push(`${w}: PT09 deve ser marcada obra`);
    if (q.obra && q.origin !== 'autoral') errors.push(`${w}: questão de obra precisa ser autoral`);
    q.difficulty = levelToDifficulty(q.level);
    q.source_note = originLabel(q);
  });
  topics.forEach((t) => {
    const th = theory[t.code];
    t.theory = th ? th.html : null;
    t.summary = th && th.summary ? th.summary : t.name;
    if (!th) warnings.push(`${t.code}: sem teoria`);
  });

  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ v: CONTENT_VERSION, topics, questions: questions.map((q) => ({ ...q, where: undefined })) }))
    .digest('hex');
  cache = { topics, questions, errors, warnings, hash, SUBJECTS };
  return cache;
}

module.exports = { loadContent, SUBJECTS, cleanText };
