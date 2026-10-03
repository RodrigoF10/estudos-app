(function () {
  const buttons = document.querySelectorAll('.start-simulado-btn');
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode;
      const body = { mode };
      if (mode === 'materia') {
        body.subject = document.getElementById('mat-subject').value;
        body.count = Number(document.getElementById('mat-count').value);
      }
      const original = btn.textContent;
      buttons.forEach((b) => { b.disabled = true; });
      btn.textContent = 'Preparando...';
      try {
        const res = await fetch('/api/simulado/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.ok) {
          window.location.href = `/rayane/simulado/${data.simulado_id}`;
          return;
        }
        alert(data.error || 'Não foi possível iniciar o simulado.');
      } catch (e) {
        alert('Erro de conexão. Tente novamente.');
      }
      buttons.forEach((b) => { b.disabled = false; });
      btn.textContent = original;
    });
  });
})();
