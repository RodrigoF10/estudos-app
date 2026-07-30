// Ponto de entrada usado pelo Vercel: cada requisição HTTP é roteada para
// cá, que apenas repassa para o app Express normal (definido em src/server.js).
// Em produção, app.listen() nunca é chamado (ver src/server.js) — quem recebe
// as conexões é o próprio Vercel.
module.exports = require('../src/server');
