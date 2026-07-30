// Autenticação simples por perfil (Rayane / Admin), pensada para uso familiar,
// não para múltiplos usuários públicos. Os PINs podem ser trocados por variáveis
// de ambiente (ver README.md).

const PINS = {
  rayane: process.env.RAYANE_PIN || '1234',
  admin: process.env.ADMIN_PIN || '4321',
};

function requireLogin(req, res, next) {
  if (!req.session.role) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role !== role) {
      return res.redirect('/login');
    }
    next();
  };
}

module.exports = { PINS, requireLogin, requireRole };
