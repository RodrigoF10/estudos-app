// Valida o conteúdo e imprime um relatório de cobertura.  Uso: npm run check
const { loadContent } = require('./index');

const c = loadContent();
const topics = c.topics;
const by = {};
topics.forEach((t) => { by[t.code] = { t, real: 0, aut: 0, obra: 0, lv: { 1: 0, 2: 0, 3: 0 }, keys: { a: 0, b: 0, c: 0, d: 0 } }; });
c.questions.forEach((q) => {
  const b = by[q.topic];
  if (!b) return;
  if (q.origin === 'real') b.real++; else if (q.obra) b.obra++; else b.aut++;
  b.lv[q.level]++;
  b.keys[q.key]++;
});

console.log(`Questões: ${c.questions.length} (${c.questions.filter((q) => q.origin === 'real').length} reais, ${c.questions.filter((q) => q.origin === 'autoral').length} autorais, ${c.questions.filter((q) => q.obra).length} de O Alienista)`);
console.log('Tópico  núcleo  real  autor  obra  N1/N2/N3     gabarito A/B/C/D   nome');
const min = { core: 12, complement: 6 };
let weak = 0;
topics.forEach((t) => {
  const b = by[t.code];
  const total = b.real + b.aut + b.obra;
  const flag = total < min[t.tier] ? '  <-- POUCAS' : '';
  if (flag) weak++;
  console.log(
    `${t.code.padEnd(6)}  ${t.tier === 'core' ? 'sim ' : 'não '}   ${String(b.real).padStart(3)}  ${String(b.aut).padStart(4)}  ${String(b.obra).padStart(4)}  ${b.lv[1]}/${b.lv[2]}/${b.lv[3]}`.padEnd(60) +
    `${b.keys.a}/${b.keys.b}/${b.keys.c}/${b.keys.d}`.padEnd(14) + t.name + flag
  );
});
const k = { a: 0, b: 0, c: 0, d: 0 };
c.questions.forEach((q) => k[q.key]++);
console.log(`\nGabarito geral A/B/C/D: ${k.a}/${k.b}/${k.c}/${k.d}`);
if (c.warnings.length) console.log('\nAvisos:\n- ' + c.warnings.slice(0, 30).join('\n- '));
if (c.errors.length) {
  console.log('\nERROS:\n- ' + c.errors.join('\n- '));
  process.exit(1);
}
console.log(`\nOK — conteúdo válido.${weak ? ` (${weak} tópicos abaixo da meta de quantidade)` : ''}`);
