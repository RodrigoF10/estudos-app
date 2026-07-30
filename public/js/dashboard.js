(function () {
  const data = window.DASHBOARD_DATA;
  if (!data || typeof Chart === 'undefined') return;

  const COLORS = {
    primary: '#5b5be0',
    green: '#1f9d55',
    orange: '#d9662a',
    red: '#c0392b',
    yellow: '#b8860b',
    muted: '#6b6b7a',
    border: '#e6e6ef',
  };

  Chart.defaults.font.family = "'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, sans-serif";
  Chart.defaults.color = COLORS.muted;

  // 1) Evolução do aproveitamento ao longo do tempo
  const evolucaoEl = document.getElementById('chart-evolucao');
  if (evolucaoEl && data.overTime.length > 0) {
    new Chart(evolucaoEl, {
      type: 'line',
      data: {
        labels: data.overTime.map((d) => d.day.slice(5).split('-').reverse().join('/')),
        datasets: [
          {
            label: 'Aproveitamento (%)',
            data: data.overTime.map((d) => d.accuracy),
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(91,91,224,0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  // 2) Aproveitamento por matéria
  const materiaEl = document.getElementById('chart-materia');
  if (materiaEl && data.bySubject.length > 0) {
    new Chart(materiaEl, {
      type: 'bar',
      data: {
        labels: data.bySubject.map((s) => s.subject_name),
        datasets: [
          {
            label: 'Aproveitamento (%)',
            data: data.bySubject.map((s) => s.accuracy),
            backgroundColor: COLORS.primary,
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  // 3) Aproveitamento por nível de dificuldade
  const dificuldadeEl = document.getElementById('chart-dificuldade');
  if (dificuldadeEl) {
    new Chart(dificuldadeEl, {
      type: 'bar',
      data: {
        labels: data.byDifficulty.map((d) => d.label),
        datasets: [
          {
            label: 'Aproveitamento (%)',
            data: data.byDifficulty.map((d) => d.accuracy),
            backgroundColor: [COLORS.green, COLORS.yellow, COLORS.red],
            borderRadius: 6,
          },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  // 4) Distribuição de domínio dos temas
  const dominioEl = document.getElementById('chart-dominio');
  if (dominioEl) {
    new Chart(dominioEl, {
      type: 'doughnut',
      data: {
        labels: data.mastery.map((m) => `${m.emoji} ${m.label}`),
        datasets: [
          {
            data: data.mastery.map((m) => m.count),
            backgroundColor: ['#ddd', COLORS.orange, COLORS.yellow, COLORS.green],
          },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });
  }

  // 5) Notas nos simulados
  const simuladosEl = document.getElementById('chart-simulados');
  if (simuladosEl && data.simulados.length > 0) {
    new Chart(simuladosEl, {
      type: 'line',
      data: {
        labels: data.simulados.map((s) => s.date.split('-').reverse().join('/')),
        datasets: [
          {
            label: 'Nota (%)',
            data: data.simulados.map((s) => s.score),
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(91,91,224,0.12)',
            fill: true,
            tension: 0.2,
            pointRadius: 4,
          },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } } },
        plugins: { legend: { display: false } },
      },
    });
  }
})();
