(function () {
  const btn = document.getElementById('start-simulado-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Preparando simulado...';
    try {
      const res = await fetch('/api/simulado/start', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        window.location.href = `/rayane/simulado/${data.simulado_id}`;
      } else {
        alert(data.error || 'Não foi possível iniciar o simulado.');
        btn.disabled = false;
        btn.textContent = 'Começar novo simulado';
      }
    } catch (e) {
      alert('Erro de conexão. Tente novamente.');
      btn.disabled = false;
      btn.textContent = 'Começar novo simulado';
    }
  });
})();
