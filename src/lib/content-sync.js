// Sincroniza o banco com o conteúdo versionado em src/content (tópicos, teoria,
// questões reais e autorais). NÃO destrutivo:
//   - tentativas, fila de revisão, simulados e cronograma são preservados;
//   - o banco de questões antigo ("legado") e os temas antigos são DESATIVADOS
//     (active = 0), nunca apagados, e deixam de aparecer em todo o app;
//   - questões são atualizadas por ext_id (o id interno não muda, então o
//     histórico da Rayane continua apontando para a mesma questão).
// Só roda quando o hash do conteúdo muda (guardado em settings.content_hash).

const { client, dbGet } = require('../db');
const { loadContent, SUBJECTS } = require('../content');

const CHUNK = 60;

async function syncContent({ force = false } = {}) {
  const content = loadContent();
  if (content.errors.length) {
    throw new Error('Conteúdo inválido:\n' + content.errors.slice(0, 15).join('\n'));
  }
  const row = await dbGet("SELECT value FROM settings WHERE key = 'content_hash'");
  if (!force && row && row.value === content.hash) return { changed: false, hash: content.hash };

  // 1) matérias (upsert por slug, mantém ids existentes)
  for (const s of SUBJECTS) {
    await client.execute({
      sql: `INSERT INTO subjects (slug, name, weight_percent, order_index) VALUES (?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET name = excluded.name, weight_percent = excluded.weight_percent,
            order_index = excluded.order_index`,
      args: [s.slug, s.name, s.weight, s.order],
    });
  }
  const subjRows = (await client.execute('SELECT id, slug FROM subjects')).rows;
  const subjectId = {};
  subjRows.forEach((r) => { subjectId[r.slug] = Number(r.id); });

  // 2) desativa tudo que é legado (temas antigos sem code e questões antigas)
  await client.batch(
    [
      "UPDATE themes SET active = 0 WHERE code IS NULL",
      "UPDATE questions SET active = 0 WHERE origin = 'legado'",
    ],
    'write'
  );

  // 3) tópicos novos (upsert por matéria+slug)
  const stmts = [];
  content.topics.forEach((t) => {
    stmts.push({
      sql: `INSERT INTO themes (subject_id, slug, name, priority_rank, low_priority, is_special, summary,
                                code, tier, expected_per_exam, exam_hits, theory, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(subject_id, slug) DO UPDATE SET
              name = excluded.name, priority_rank = excluded.priority_rank, low_priority = excluded.low_priority,
              is_special = excluded.is_special, summary = excluded.summary, code = excluded.code,
              tier = excluded.tier, expected_per_exam = excluded.expected_per_exam,
              exam_hits = excluded.exam_hits, theory = excluded.theory, active = 1`,
      args: [
        subjectId[t.subject], t.code.toLowerCase(), t.name, t.rank, t.tier === 'complement' ? 1 : 0,
        t.code === 'PT09' ? 1 : 0, t.summary, t.code, t.tier, t.expected, t.hits, t.theory,
      ],
    });
  });
  await client.batch(stmts, 'write');

  // blocos automáticos futuros que apontavam para temas antigos são recriados pelo planner
  await client.execute(
    `DELETE FROM schedule_blocks WHERE auto_generated = 1 AND status = 'pending' AND date >= date('now')
     AND theme_id IN (SELECT id FROM themes WHERE active = 0)`
  );

  const themeRows = (await client.execute('SELECT id, code FROM themes WHERE code IS NOT NULL')).rows;
  const themeId = {};
  themeRows.forEach((r) => { themeId[r.code] = Number(r.id); });

  // 4) questões (upsert por ext_id)
  const keepIds = new Set();
  for (let i = 0; i < content.questions.length; i += CHUNK) {
    const batch = content.questions.slice(i, i + CHUNK).map((q) => {
      keepIds.add(q.ext_id);
      const correctIdx = 'abcd'.indexOf(q.key);
      return {
        sql: `INSERT INTO questions (ext_id, theme_id, stem, option_a, option_b, option_c, option_d, correct_option,
                explanation_correct, explanation_a, explanation_b, explanation_c, explanation_d, source_note,
                difficulty, origin, exam_year, exam_number, level, format, support_html, shuffle, obra, active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)
              ON CONFLICT(ext_id) DO UPDATE SET
                theme_id = excluded.theme_id, stem = excluded.stem, option_a = excluded.option_a,
                option_b = excluded.option_b, option_c = excluded.option_c, option_d = excluded.option_d,
                correct_option = excluded.correct_option, explanation_correct = excluded.explanation_correct,
                explanation_a = excluded.explanation_a, explanation_b = excluded.explanation_b,
                explanation_c = excluded.explanation_c, explanation_d = excluded.explanation_d,
                source_note = excluded.source_note, difficulty = excluded.difficulty, origin = excluded.origin,
                exam_year = excluded.exam_year, exam_number = excluded.exam_number, level = excluded.level,
                format = excluded.format, support_html = excluded.support_html, shuffle = 0,
                obra = excluded.obra, active = 1`,
        args: [
          q.ext_id, themeId[q.topic], q.stem, q.options[0], q.options[1], q.options[2], q.options[3], q.key,
          q.expl[correctIdx], q.expl[0], q.expl[1], q.expl[2], q.expl[3], q.source_note, q.difficulty, q.origin,
          q.exam_year, q.exam_number, q.level, q.format, q.support_html, q.obra,
        ],
      };
    });
    await client.batch(batch, 'write');
  }

  // 5) questões que sumiram do conteúdo (ex.: removidas na revisão) saem do ar
  const existing = (await client.execute('SELECT id, ext_id FROM questions WHERE ext_id IS NOT NULL AND active = 1')).rows;
  const toDisable = existing.filter((r) => !keepIds.has(r.ext_id)).map((r) => Number(r.id));
  for (let i = 0; i < toDisable.length; i += 100) {
    const ids = toDisable.slice(i, i + 100);
    await client.execute(`UPDATE questions SET active = 0 WHERE id IN (${ids.join(',')})`);
  }

  // 6) data da prova e hash
  await client.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('exam_date', '2026-11-29')
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [],
  });
  await client.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('content_hash', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [content.hash],
  });

  return { changed: true, hash: content.hash, topics: content.topics.length, questions: content.questions.length };
}

module.exports = { syncContent };
