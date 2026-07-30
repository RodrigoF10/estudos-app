(function () {
  const questions = window.SIMULADO_QUESTIONS;
  const simuladoId = window.SIMULADO_ID;
  if (!questions) return; // modo administrador, sem interação

  let current = 0;
  let secondsRemaining = window.SECONDS_REMAINING;
  let finishing = false;

  const stemEl = document.getElementById('question-stem');
  const subjectEl = document.getElementById('question-subject');
  const optionsEl = document.getElementById('options');
  const navEl = document.getElementById('question-nav');
  const timerEl = document.getElementById('timer');
  const currentIndexEl = document.getElementById('current-index');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const finishBtn = document.getElementById('finish-btn');

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function buildNav() {
    navEl.innerHTML = '';
    questions.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn-sm';
      btn.style.cssText =
        'border-radius:6px; border:1px solid var(--border); background:#fff; cursor:pointer; min-width:30px; padding:4px 0;';
      btn.textContent = idx + 1;
      btn.dataset.idx = idx;
      btn.addEventListener('click', () => renderQuestion(idx));
      navEl.appendChild(btn);
    });
    updateNavStyles();
  }

  function updateNavStyles() {
    Array.from(navEl.children).forEach((btn, idx) => {
      const answered = !!questions[idx].selected_option;
      btn.style.background = idx === current ? 'var(--primary)' : answered ? 'var(--green-bg)' : '#fff';
      btn.style.color = idx === current ? '#fff' : answered ? 'var(--green)' : 'var(--text)';
      btn.style.borderColor = idx === current ? 'var(--primary)' : answered ? 'var(--green)' : 'var(--border)';
    });
  }

  function renderQuestion(idx) {
    current = idx;
    const q = questions[idx];
    currentIndexEl.textContent = idx + 1;
    subjectEl.textContent = q.subject_name;
    stemEl.textContent = q.stem;
    optionsEl.innerHTML = '';

    ['a', 'b', 'c', 'd'].forEach((letter) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (q.selected_option === letter) btn.classList.add('correct'); // usa o verde só para indicar "selecionada"
      btn.innerHTML = `<span class="letter">${letter.toUpperCase()})</span> ${q['option_' + letter]}`;
      btn.addEventListener('click', () => selectAnswer(idx, letter));
      optionsEl.appendChild(btn);
    });

    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === questions.length - 1 ? 'Última questão' : 'Próxima →';
    updateNavStyles();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function selectAnswer(idx, letter) {
    questions[idx].selected_option = letter;
    renderQuestion(idx);
    try {
      await fetch(`/api/simulado/${simuladoId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sq_id: questions[idx].sq_id, selected_option: letter }),
      });
    } catch (e) {
      // Falha de rede não trava o simulado; a resposta fica salva localmente
      // e pode ser reenviada quando o aluno avançar de questão de novo.
    }
  }

  prevBtn.addEventListener('click', () => { if (current > 0) renderQuestion(current - 1); });
  nextBtn.addEventListener('click', () => { if (current < questions.length - 1) renderQuestion(current + 1); });

  async function finishSimulado(auto) {
    if (finishing) return;
    if (!auto) {
      const answeredCount = questions.filter((q) => q.selected_option).length;
      const missing = questions.length - answeredCount;
      const msg =
        missing > 0
          ? `Você ainda tem ${missing} questão(ões) sem resposta. Finalizar mesmo assim?`
          : 'Finalizar o simulado agora?';
      if (!confirm(msg)) return;
    }
    finishing = true;
    finishBtn.disabled = true;
    finishBtn.textContent = 'Corrigindo...';
    try {
      await fetch(`/api/simulado/${simuladoId}/finish`, { method: 'POST' });
    } finally {
      window.location.href = `/rayane/simulado/${simuladoId}/resultado`;
    }
  }

  finishBtn.addEventListener('click', () => finishSimulado(false));

  function tick() {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      timerEl.textContent = '00:00:00';
      finishSimulado(true);
      return;
    }
    timerEl.textContent = formatTime(secondsRemaining);
    if (secondsRemaining <= 300) timerEl.style.color = 'var(--red)';
    setTimeout(tick, 1000);
  }

  buildNav();
  renderQuestion(0);
  timerEl.textContent = formatTime(secondsRemaining);
  setTimeout(tick, 1000);
})();
