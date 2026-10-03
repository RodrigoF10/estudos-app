(function () {
  document.querySelectorAll('[data-status-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const status = btn.getAttribute('data-status-btn');
      await fetch(`/api/schedule/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      window.location.reload();
    });
  });

  document.querySelectorAll('[data-delete-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover este bloco do cronograma?')) return;
      const id = btn.getAttribute('data-id');
      await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
      window.location.reload();
    });
  });

  const subjectSelect = document.getElementById('new-subject');
  const themeSelect = document.getElementById('new-theme');
  if (subjectSelect && themeSelect && window.THEMES_BY_SUBJECT) {
    function refreshThemes() {
      const themes = window.THEMES_BY_SUBJECT[subjectSelect.value] || [];
      themeSelect.innerHTML = '<option value="">(sem tema específico — revisão geral)</option>';
      themes.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        themeSelect.appendChild(opt);
      });
    }
    subjectSelect.addEventListener('change', refreshThemes);
    refreshThemes();
  }

  const form = document.getElementById('add-block-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: fd.get('date'),
          subject_id: Number(fd.get('subject_id')),
          theme_id: fd.get('theme_id') ? Number(fd.get('theme_id')) : null,
          planned_minutes: Number(fd.get('planned_minutes')) || 30,
        }),
      });
      window.location.reload();
    });
  }
})();
