// Conversor mínimo de "mini-markdown" para HTML (usado nos resumos teóricos).
//   ## Título        → <h4>
//   - item           → lista
//   > dica           → caixa de destaque (armadilha / macete da banca)
//   | a | b |        → tabela (a 2ª linha "|---|---|" marca o cabeçalho)
//   **negrito**, _itálico_
//   linhas separadas por linha em branco → parágrafos

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}

function theoryToHtml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^##\s+/.test(line)) { out.push(`<h4>${inline(line.replace(/^##\s+/, ''))}</h4>`); i++; continue; }
    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^-\s+/, ''))}</li>`); i++; }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<div class="tip">${inline(buf.join(' '))}</div>`);
      continue;
    }
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      let html = '<table class="qt">';
      const hasHead = rows.length > 1 && /^\|[\s:|-]+\|?$/.test(rows[1]);
      rows.forEach((r, idx) => {
        if (hasHead && idx === 1) return;
        const tag = hasHead && idx === 0 ? 'th' : 'td';
        html += '<tr>' + cells(r).map((c) => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>';
      });
      out.push(html + '</table>');
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(##\s|-\s|>|\|)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

module.exports = { theoryToHtml };
