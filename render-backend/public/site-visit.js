(function () {
  const API_BASE_URL = window.SITE_API_BASE_URL || 'https://cclyyds666-personal-site-h8kk.onrender.com';

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  async function postVisit() {
    const path = window.location.pathname || '/';
    const res = await fetch(apiUrl('/api/visit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error('visit failed');
  }

  async function loadVisitCount() {
    const el = document.getElementById('visitCount');
    if (!el) return;
    try {
      const res = await fetch(apiUrl('/api/visits/count'));
      const data = res.ok ? await res.json() : null;
      if (data && typeof data.total === 'number') {
        el.textContent = String(data.total);
      }
    } catch {
      /* ignore */
    }
  }

  async function trackVisitAndRefreshCount() {
    try {
      await postVisit();
    } catch {
      /* still show persisted total */
    }
    await loadVisitCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisitAndRefreshCount);
  } else {
    trackVisitAndRefreshCount();
  }
})();
