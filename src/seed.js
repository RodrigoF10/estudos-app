// Sincroniza o banco (local ou Turso, conforme as variáveis de ambiente) com o
// conteúdo versionado em src/content. É NÃO DESTRUTIVO: não apaga tentativas,
// simulados, revisões nem cronograma. O banco de questões antigo fica desativado.
//
//   npm run seed          → sincroniza apenas se o conteúdo mudou
//   npm run seed -- --force → força a sincronização

const { initDb } = require('./db');

async function run() {
  process.env.AUTO_SYNC_CONTENT = '0'; // initDb não sincroniza; fazemos aqui, com relatório
  await initDb();
  const { syncContent } = require('./lib/content-sync');
  const force = process.argv.includes('--force');
  const r = await syncContent({ force });
  if (r.changed) console.log(`Conteúdo sincronizado: ${r.topics} tópicos, ${r.questions} questões.`);
  else console.log('Conteúdo já estava atualizado (nada a fazer). Use --force para reaplicar.');
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
