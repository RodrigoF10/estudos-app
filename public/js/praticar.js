(function () {
  const cfg = window.PRACTICE || {};
  const SESSION_SIZE = 10; // sessões curtas para não ficar massante
  const stemEl = document.getElementById('question-stem');
  const supportEl = document.getElementById('question-support');
  const optionsEl = document.getElementById('options');
  const feedbackEl = document.getElementById('feedback');
  const nextBtn = document.getElementById('next-btn');
  const reasonEl = document.getElementById('question-reason');
  const tagsEl = document.getElementById('question-tags');
  const scoreEl = document.getElementById('session-score');
  const sessionCountEl = document.getElementById('session-count');
  const sessionProgressBar = document.getElementById('session-progress-bar');
  const questionCard = document.getElementById('question-card');
  const summaryCard = document.getElementById('session-summary');
  const summaryText = document.getElementById('session-summary-text');
  const practiceMoreBtn = document.getElementById('practice-more-btn');

  if (!stemEl) return; // sem questões ou modo admin

  let current = null;
  let answered = false;
  let sessionTotal = 0;
  let sessionCorrect = 0;
  let questionShownAt = null;

  const REASON_LABELS = {
    revisao: '🔁 Revisão espaçada',
    nova: '🆕 Questão nova',
    revisao_geral: '📚 Revisão geral do tópico',
    erro: '🧭 Caderno de erros',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tagsHtml(q) {
    let h = '';
    if (q.origin === 'real') h += `<span class="qtag real">${esc(q.source_note.split(' · ')[0])}</span>`;
    else h += `<span class="qtag ${q.source_note.includes('Alienista') ? 'obra' : 'autoral'}">${esc(q.source_note.split(' · ')[0])}</span>`;
    if (q.level) h += `<span class="qtag lvl${q.level}">Nível N${q.level}</span>`;
    return h;
  }

  function updateScore() {
    scoreEl.textContent = sessionTotal > 0 ? `Nesta sessão: ${sessionCorrect}/${sessionTotal} acertos` : '';
  }

  function updateSessionProgress() {
    const shown = Math.min(sessionTotal + 1, SESSION_SIZE);
    sessionCountEl.textContent = shown;
    sessionProgressBar.style.width = `${(shown / SESSION_SIZE) * 100}%`;
  }

  function apiUrl() {
    const p = new URLSearchParams();
    if (cfg.mode && cfg.mode !== 'tema') p.set('mode', cfg.mode);
    if (cfg.themeId) p.set('theme_id', cfg.themeId);
    return `/api/next-question?${p.toString()}`;
  }

  async function loadNext() {
    if (sessionTotal >= SESSION_SIZE) {
      showSessionSummary();
      return;
    }

    answered = false;
    feedbackEl.innerHTML = '';
    nextBtn.style.display = 'none';
    stemEl.textContent = 'Carregando...';
    supportEl.style.display = 'none';
    optionsEl.innerHTML = '';
    tagsEl.innerHTML = '';
    updateSessionProgress();

    const res = await fetch(apiUrl());
    const data = await res.json();
    if (!res.ok) {
      if (sessionTotal > 0) { showSessionSummary(); return; }
      stemEl.textContent = data.error || 'Não foi possível carregar a questão.';
      return;
    }
    current = data.question;
    questionShownAt = Date.now();
    reasonEl.textContent = REASON_LABELS[data.reason] || '';
    tagsEl.innerHTML = tagsHtml(current);
    if (current.support_html) {
      supportEl.innerHTML = current.support_html; // conteúdo próprio do app (confiável)
      supportEl.style.display = 'block';
    }
    stemEl.textContent = current.stem;

    ['a', 'b', 'c', 'd'].forEach((letter) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="letter">${letter.toUpperCase()})</span> <span class="opt-text">${esc(current.options[letter])}</span>`;
      btn.addEventListener('click', () => selectAnswer(letter, btn));
      optionsEl.appendChild(btn);
    });
  }

  function showSessionSummary() {
    questionCard.style.display = 'none';
    summaryCard.style.display = 'block';
    summaryText.textContent = `Você acertou ${sessionCorrect} de ${sessionTotal} questões nesta sessão.`;
  }

  async function selectAnswer(letter) {
    if (answered) return;
    answered = true;

    const timeSpentSeconds = questionShownAt ? Math.round((Date.now() - questionShownAt) / 1000) : null;

    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: current.id, selected_option: letter, time_spent_seconds: timeSpentSeconds }),
    });
    const result = await res.json();
    if (!res.ok) {
      feedbackEl.innerHTML = `<div class="explanation-box err">${esc(result.error || 'Erro ao registrar resposta.')}</div>`;
      return;
    }

    sessionTotal += 1;
    if (result.is_correct) sessionCorrect += 1;
    updateScore();
    sessionCountEl.textContent = Math.min(sessionTotal, SESSION_SIZE);
    sessionProgressBar.style.width = `${(Math.min(sessionTotal, SESSION_SIZE) / SESSION_SIZE) * 100}%`;

    Array.from(optionsEl.children).forEach((btn, idx) => {
      const btnLetter = ['a', 'b', 'c', 'd'][idx];
      btn.classList.add('disabled');
      btn.disabled = true;
      if (btnLetter === result.correct_option) btn.classList.add('correct');
      if (btnLetter === letter && !result.is_correct) btn.classList.add('incorrect');
    });

    // Explicação de TODAS as alternativas, não só a correta
    let html = '';
    html += `<div class="explanation-box ${result.is_correct ? 'ok' : 'err'}">`;
    html += `<strong>${result.is_correct ? '✅ Você acertou!' : '❌ Essa não é a resposta certa.'}</strong>`;
    html += `<p style="white-space:pre-line;"><strong>Por que a alternativa ${result.correct_option.toUpperCase()} está correta:</strong><br>${esc(result.explanation_correct)}</p>`;
    html += `</div>`;
    html += `<div class="explanation-box" style="background:#f5f5fa; border:1px solid var(--border); margin-top:10px;">`;
    html += `<strong>Por que as outras alternativas estão erradas:</strong><ul style="margin:8px 0 0; padding-left:18px;">`;
    ['a', 'b', 'c', 'd'].forEach((l) => {
      if (l === result.correct_option) return;
      html += `<li><strong>${l.toUpperCase()})</strong> ${esc(result.explanations[l])}</li>`;
    });
    html += `</ul></div>`;
    if (result.source_note) {
      html += `<p class="muted small" style="margin-top:8px;">${esc(result.source_note)}</p>`;
    }
    html += `<p class="muted small">Próxima revisão desta questão em ${result.next_review_in_days} dia(s), se você acertar de novo.</p>`;
    feedbackEl.innerHTML = html;

    nextBtn.style.display = 'inline-block';
    nextBtn.textContent = sessionTotal >= SESSION_SIZE ? 'Ver resumo da sessão →' : 'Próxima questão →';
  }

  nextBtn.addEventListener('click', loadNext);
  if (practiceMoreBtn) {
    practiceMoreBtn.addEventListener('click', () => {
      sessionTotal = 0;
      sessionCorrect = 0;
      summaryCard.style.display = 'none';
      questionCard.style.display = 'block';
      updateScore();
      loadNext();
    });
  }
  loadNext();
})();
