(function (global) {
  const API_BASE_URL = global.SITE_API_BASE_URL || 'https://cclyyds666-personal-site-h8kk.onrender.com';

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function setStatus(message) {
    const el = document.getElementById('backendStatus');
    if (el) el.textContent = message || '';
  }

  async function postVisit() {
    const path = global.location.pathname || '/';
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
      const res = await fetch(apiUrl('/api/visits/count'), { cache: 'no-store' });
      const data = res.ok ? await res.json() : null;
      if (data && typeof data.total === 'number') {
        el.textContent = String(data.total);
      }
    } catch {
      /* ignore */
    }
  }

  async function waitForBackendLight() {
    if (typeof global.waitForBackend === 'function') {
      return global.waitForBackend({ maxAttempts: 12, delayMs: 2500 });
    }
    setStatus('后端唤醒中，请稍候…');
    for (let i = 1; i <= 12; i += 1) {
      try {
        const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
        if (res.ok) {
          setStatus('');
          return true;
        }
      } catch {
        /* retry */
      }
      setStatus(`后端唤醒中…（第 ${i}/12 次）`);
      await new Promise((r) => setTimeout(r, 2500));
    }
    setStatus('后端暂时不可用，请稍后刷新。');
    return false;
  }

  async function trackVisitAndRefreshCount() {
    const ready = await waitForBackendLight();
    if (!ready) return;
    try {
      await postVisit();
    } catch {
      /* still show persisted total */
    }
    await loadVisitCount();
  }

  global.SiteVisit = {
    refresh: trackVisitAndRefreshCount,
    loadVisitCount
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisitAndRefreshCount);
  } else {
    trackVisitAndRefreshCount();
  }
})(window);
