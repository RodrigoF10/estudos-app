// Parser dos arquivos de conteúdo (.txt) das questões.
//
// Formato de um bloco:
//
//   @ID  [N1|N2|N3]  [formato]  [obra]
//   sup:  (HTML opcional do texto de apoio / quadro / tabela)
//   stem: enunciado (pode ocupar várias linhas)
//   o1: alternativa A
//   o2: alternativa B
//   o3: alternativa C
//   o4: alternativa D
//   key: B
//   a: por que A está certa/errada
//   b: ...
//   c: ...
//   d: ...
//
// Questões reais já têm enunciado e alternativas em real.json: nesse caso o
// bloco só traz key + explicações (e, quando o texto extraído do PDF estava
// quebrado, stem/sup/o1–o4 corrigidos à mão). Bloco com "exclude:" tira a
// questão do banco.

const FIELD = /^(stem|sup|o[1-4]|key|exclude|a|b|c|d|topic|lvl|fmt):[ \t]?(.*)$/;

function parseBlocks(text, fileLabel = '') {
  const blocks = [];
  let cur = null;
  let field = null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (/^@\S/.test(line)) {
      const parts = line.slice(1).trim().split(/\s+/);
      cur = { id: parts[0], tokens: parts.slice(1), fields: {}, where: `${fileLabel}:${i + 1}` };
      blocks.push(cur);
      field = null;
      return;
    }
    if (!cur) return;
    if (/^\s*#/.test(line) && !field) return; // comentário entre blocos
    const m = FIELD.exec(line);
    if (m) {
      field = m[1];
      if (cur.fields[field] !== undefined) {
        throw new Error(`${cur.where}: campo "${field}" repetido em ${cur.id}`);
      }
      cur.fields[field] = m[2];
      return;
    }
    if (field) cur.fields[field] += '\n' + line;
  });
  blocks.forEach((b) => {
    Object.keys(b.fields).forEach((k) => {
      b.fields[k] = b.fields[k].replace(/\s+$/g, '').replace(/^\s+/, '');
    });
  });
  return blocks;
}

module.exports = { parseBlocks };
