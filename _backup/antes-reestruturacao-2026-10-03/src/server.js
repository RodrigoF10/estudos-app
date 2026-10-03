// Ponto de entrada do site de estudos da Rayane (CEFET-MG Varginha 2027).

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { initDb } = require('./db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Autenticação por cookie assinado (sem estado no servidor) — funciona tanto
// localmente quanto em ambiente serverless (Vercel), onde não é possível
// manter uma sessão em memória entre requisições.
const COOKIE_SECRET = process.env.SESSION_SECRET || 'cefet-rayane-estudos-2027';
app.use(cookieParser(COOKIE_SECRET));

// Sintetiza um objeto `req.session` com o mesmo formato usado antes
// (`{ role: 'rayane' | 'admin' | null }`), para que todo o resto do código
// (rotas, middleware/auth.js) continue funcionando sem precisar ser tocado.
app.use((req, res, next) => {
  req.session = { role: req.signedCookies.role || null };
  res.locals.role = req.session.role;
  next();
});

// Garante que o schema do banco já exista antes de processar qualquer
// requisição (cobre tanto o primeiro request local quanto o "cold start"
// de uma função serverless no Vercel).
app.use((req, res, next) => {
  initDb().then(() => next()).catch(next);
});

app.use('/', require('./routes/auth'));
app.use('/rayane', require('./routes/rayane'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

app.use((req, res) => {
  res.status(404).send('Página não encontrada.');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Erro interno no servidor.');
});

// No Vercel, este arquivo é importado pela função serverless (api/index.js)
// e app.listen() nunca é chamado — o próprio Vercel cuida de receber as
// requisições HTTP. Localmente (`npm start`), continua funcionando igual.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Site de estudos rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
