const express = require('express');
const router = express.Router();
const { PINS } = require('../middleware/auth');

const COOKIE_OPTIONS = {
  signed: true,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias
};

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { profile, pin } = req.body;
  if ((profile === 'rayane' || profile === 'admin') && PINS[profile] === pin) {
    res.cookie('role', profile, COOKIE_OPTIONS);
    return res.redirect(profile === 'admin' ? '/admin' : '/rayane');
  }
  res.render('login', { error: 'PIN incorreto. Tente novamente.' });
});

router.post('/logout', (req, res) => {
  res.clearCookie('role');
  res.redirect('/login');
});

router.get('/', (req, res) => {
  if (!req.session.role) return res.redirect('/login');
  res.redirect(req.session.role === 'admin' ? '/admin' : '/rayane');
});

module.exports = router;
