(function (global) {
  const API_BASE_URL = global.SITE_API_BASE_URL || 'https://cclyyds666-personal-site-h8kk.onrender.com';
  const MAX_IMAGES = 5;
  const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 1280;
  const IMAGE_JPEG_QUALITY = 0.72;
  const MAX_POST_CONTENT_LENGTH = 2000000;
  const MUSIC_PLAYLISTS = [
    '505947676', '24381616', '19723756', '3779629', '2884035', '1978921798',
    '2250011882', '3119419262', '121567464', '2045626430', '2829883282', '3222080828'
  ];

  let currentToken = localStorage.getItem('token');
  let currentUser = null;
  let pendingImages = [];
  let backendReady = false;
  let wakePromise = null;

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function setBackendStatus(message) {
    const el = document.getElementById('backendStatus');
    if (el) el.textContent = message || '';
  }

  async function waitForBackend(options = {}) {
    if (backendReady) return true;
    if (wakePromise) return wakePromise;

    const maxAttempts = options.maxAttempts || 12;
    const delayMs = options.delayMs || 2500;
    setBackendStatus('后端唤醒中，请稍候…（Render 免费实例冷启动约 30–60 秒）');

    wakePromise = (async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
          if (res.ok) {
            backendReady = true;
            setBackendStatus('');
            return true;
          }
        } catch {
          /* keep trying */
        }
        setBackendStatus(`后端唤醒中…（第 ${attempt}/${maxAttempts} 次）`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      setBackendStatus('后端暂时不可用，请稍后刷新。静态内容仍可浏览。');
      return false;
    })();

    try {
      return await wakePromise;
    } finally {
      wakePromise = null;
    }
  }

  async function requestJson(path, options = {}) {
    const { headers: optHeaders, body, ...restOptions } = options;
    const headers = { ...(optHeaders || {}) };
    if (body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(apiUrl(path), { headers, body, ...restOptions });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? '响应格式错误' : '服务暂时不可用');
    }
    if (!res.ok) throw new Error(data.message || '请求失败');
    return data;
  }

  function renderMarkdown(markdown) {
    const source = String(markdown || '');
    if (!global.marked) return source;
    const raw = marked.parse(source);
    if (global.DOMPurify) {
      return DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_DATA_URI_TAGS: ['img'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/(?:png|jpe?g|gif|webp|svg\+xml)):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
      });
    }
    const div = document.createElement('div');
    div.textContent = source;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  function safeAvatarUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    try {
      const parsed = new URL(value, global.location.origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch {
      /* ignore */
    }
    return '';
  }

  function createButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-ghost-sm';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };
      img.src = url;
    });
  }

  async function compressImageFile(file) {
    const img = await loadImageFromFile(file);
    let { width, height } = img;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    let quality = IMAGE_JPEG_QUALITY;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 600_000 && quality > 0.45) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  }

  function renderImagePreviews() {
    const grid = document.getElementById('imagePreviewGrid');
    if (!grid) return;
    grid.replaceChildren();
    pendingImages.forEach((base64, idx) => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      const img = document.createElement('img');
      img.src = base64;
      img.alt = '预览图 ' + (idx + 1);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'remove-img';
      btn.textContent = '×';
      btn.addEventListener('click', () => removeImage(idx));
      item.append(img, btn);
      grid.appendChild(item);
    });
  }

  function removeImage(idx) {
    pendingImages.splice(idx, 1);
    renderImagePreviews();
  }

  (function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  })();

  function toggleTheme() {
    const el = document.documentElement;
    const isDark = el.getAttribute('data-theme') === 'dark';
    el.setAttribute('data-theme', isDark ? '' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.textContent = isDark ? '🌙' : '☀️';
    });
  }

  function getDailyPlaylistId() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return MUSIC_PLAYLISTS[seed % MUSIC_PLAYLISTS.length];
  }

  function toggleMusicPlayer() {
    const playlistId = getDailyPlaylistId();
    global.open(
      `https://music.163.com/outchain/player?type=0&id=${playlistId}&auto=1&height=66`,
      'siteMusicPlayer',
      'width=360,height=120,menubar=no,toolbar=no,location=no,status=no'
    );
  }

  function toggleMusicCollapse() {
    const fp = document.getElementById('musicPlayerFloat');
    if (fp) fp.classList.toggle('collapsed');
  }

  function updateUserBar() {
    const left = document.getElementById('userBarLeft');
    const right = document.getElementById('userBarRight');
    const heroPostBtn = document.getElementById('heroPostBtn');
    if (!left || !right) return;
    left.replaceChildren();
    right.replaceChildren();
    if (currentToken && currentUser) {
      const avatarSrc = safeAvatarUrl(currentUser.avatarUrl);
      if (avatarSrc) {
        const img = document.createElement('img');
        img.className = 'user-avatar';
        img.src = avatarSrc;
        img.alt = '头像';
        left.appendChild(img);
      } else {
        const ph = document.createElement('span');
        ph.className = 'user-avatar-placeholder';
        ph.textContent = String(currentUser.nickname || currentUser.username || '?').charAt(0).toUpperCase();
        left.appendChild(ph);
      }
      const info = document.createElement('div');
      info.className = 'user-info';
      const name = document.createElement('span');
      name.className = 'user-name';
      name.textContent = currentUser.nickname || currentUser.username;
      const nick = document.createElement('span');
      nick.className = 'user-nickname';
      nick.textContent = '@' + currentUser.username;
      info.append(name, nick);
      left.appendChild(info);
      right.append(
        createButton('发帖', openEditorModal),
        createButton('修改资料', openProfileModal),
        createButton('退出', handleLogout)
      );
      if (heroPostBtn) {
        heroPostBtn.style.display = 'inline-flex';
        heroPostBtn.onclick = openEditorModal;
      }
    } else {
      const guest = document.createElement('span');
      guest.textContent = '欢迎访问';
      left.appendChild(guest);
      const authBtn = createButton('登录 / 注册', openAuthModal);
      authBtn.id = 'authBtn';
      right.appendChild(authBtn);
      if (heroPostBtn) {
        heroPostBtn.style.display = 'none';
        heroPostBtn.onclick = null;
      }
    }
  }

  function openAuthModal() {
    document.getElementById('authModal')?.classList.remove('hidden');
  }
  function closeAuthModal() {
    document.getElementById('authModal')?.classList.add('hidden');
    clearAuthErrors();
  }
  function clearAuthErrors() {
    const a = document.getElementById('authError');
    const r = document.getElementById('registerError');
    if (a) a.textContent = '';
    if (r) r.textContent = '';
  }

  function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const title = document.getElementById('authTitle');
    if (!loginTab || !registerTab || !loginForm || !registerForm || !title) return;
    if (tab === 'login') {
      loginTab.classList.add('active');
      registerTab.classList.remove('active');
      loginForm.style.display = '';
      registerForm.style.display = 'none';
      title.textContent = '登录';
    } else {
      registerTab.classList.add('active');
      loginTab.classList.remove('active');
      registerForm.style.display = '';
      loginForm.style.display = 'none';
      title.textContent = '注册';
    }
    clearAuthErrors();
  }

  async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('authError');
    if (!username || !password) {
      errorEl.textContent = '请填写用户名和密码';
      return;
    }
    try {
      await waitForBackend();
      const data = await requestJson('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      currentToken = data.token;
      localStorage.setItem('token', currentToken);
      await fetchCurrentUser();
      closeAuthModal();
      updateUserBar();
      loadPosts();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async function handleRegister() {
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const errorEl = document.getElementById('registerError');
    if (!username || !password) {
      errorEl.textContent = '请填写用户名和密码';
      return;
    }
    try {
      await waitForBackend();
      await requestJson('/api/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      switchAuthTab('login');
      document.getElementById('loginUsername').value = username;
      document.getElementById('authError').textContent = '注册成功，请登录。';
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async function handleLogout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('token');
    updateUserBar();
    loadPosts();
  }

  async function fetchCurrentUser() {
    if (!currentToken) {
      currentUser = null;
      return;
    }
    try {
      currentUser = await requestJson('/api/user/profile', {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
    } catch {
      currentUser = null;
      currentToken = null;
      localStorage.removeItem('token');
    }
  }

  function openProfileModal() {
    document.getElementById('profileNickname').value = currentUser?.nickname || '';
    document.getElementById('profileAvatar').value = currentUser?.avatarUrl || '';
    document.getElementById('profileError').textContent = '';
    document.getElementById('profileModal')?.classList.remove('hidden');
  }
  function closeProfileModal() {
    document.getElementById('profileModal')?.classList.add('hidden');
  }

  async function handleUpdateProfile() {
    const nickname = document.getElementById('profileNickname').value.trim();
    const avatarUrl = document.getElementById('profileAvatar').value.trim();
    const errorEl = document.getElementById('profileError');
    const body = {};
    if (nickname) body.nickname = nickname;
    if (avatarUrl) body.avatarUrl = avatarUrl;
    if (!nickname && !avatarUrl) {
      errorEl.textContent = '请填写至少一个字段。';
      return;
    }
    try {
      currentUser = await requestJson('/api/user/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify(body)
      });
      updateUserBar();
      closeProfileModal();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  function openEditorModal() {
    document.getElementById('editorModal')?.classList.remove('hidden');
    pendingImages = [];
    renderImagePreviews();
    const errorEl = document.getElementById('editorError');
    if (errorEl) errorEl.textContent = '';
  }
  function closeEditorModal() {
    document.getElementById('editorModal')?.classList.add('hidden');
    const errorEl = document.getElementById('editorError');
    if (errorEl) errorEl.textContent = '';
  }

  async function handleCreatePost() {
    const title = document.getElementById('postTitle').value.trim();
    let content = document.getElementById('postContent').value;
    const errorEl = document.getElementById('editorError');
    if (!title || !content.trim()) {
      errorEl.textContent = '标题和内容不能为空';
      return;
    }
    pendingImages.forEach((img, i) => {
      content += '\n\n![image' + i + '](' + img + ')';
    });
    if (content.length > MAX_POST_CONTENT_LENGTH) {
      errorEl.textContent = '内容过长。请减少图片数量或换更小的图后再试。';
      return;
    }
    try {
      errorEl.textContent = '正在发布……';
      await waitForBackend();
      await requestJson('/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ title, content })
      });
      document.getElementById('postTitle').value = '';
      document.getElementById('postContent').value = '';
      pendingImages = [];
      renderImagePreviews();
      closeEditorModal();
      loadPosts();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  async function loadDailyQuote() {
    const quoteEl = document.getElementById('dailyQuoteText');
    const metaEl = document.getElementById('dailyQuoteMeta');
    if (!quoteEl) return;
    try {
      await waitForBackend();
      const data = await requestJson('/api/ai/daily-quote');
      quoteEl.textContent = '“' + (data.quote || '愿你今天也能把普通日子，过成一首温柔的小诗。') + '”';
      if (metaEl) metaEl.textContent = data.cached ? '今日签已缓存，明天自动刷新' : '今日签已生成，明天自动刷新';
    } catch {
      quoteEl.textContent = '“愿你今天也能把普通日子，过成一首温柔的小诗。”';
      if (metaEl) metaEl.textContent = '今日签暂用默认文案';
    }
  }

  async function handleAiChat(promptOverride) {
    const promptEl = document.getElementById('aiPrompt');
    const status = document.getElementById('aiStatus');
    const answer = document.getElementById('aiAnswer');
    if (!status || !answer) return;
    const prompt = (promptOverride || promptEl?.value || '').trim();
    if (!currentToken) {
      status.textContent = '请先登录后再使用 AI 问答。';
      return;
    }
    if (!prompt) {
      status.textContent = '请输入问题';
      return;
    }
    status.textContent = '正在请求 AI……';
    answer.textContent = '';
    try {
      await waitForBackend();
      const data = await requestJson('/api/ai/chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ prompt })
      });
      answer.textContent = data.answer || 'AI 没有返回内容。';
      status.textContent = '完成';
    } catch (err) {
      status.textContent = err.message;
    }
  }

  function handleAiTest() {
    const promptEl = document.getElementById('aiPrompt');
    if (promptEl) promptEl.value = '你好';
    handleAiChat('你好');
  }

  function renderPostBody(container, post, { full = false } = {}) {
    container.replaceChildren();
    const body = document.createElement('div');
    body.className = 'post-body';
    body.style.whiteSpace = 'pre-wrap';
    body.style.margin = '8px 0';
    body.innerHTML = renderMarkdown(post.content);
    container.appendChild(body);

    if (!full && post.truncated) {
      const note = document.createElement('p');
      note.className = 'status-text';
      note.textContent = '列表为摘要（大图已省略以加快加载）。';
      container.appendChild(note);

      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'button ghost';
      expandBtn.style.marginTop = '8px';
      expandBtn.textContent = '展开全文 / 查看图片';
      expandBtn.addEventListener('click', async () => {
        expandBtn.disabled = true;
        expandBtn.textContent = '正在加载全文……';
        try {
          await waitForBackend();
          const fullPost = await requestJson(`/api/posts/${post.id}`);
          renderPostBody(container, fullPost, { full: true });
        } catch (err) {
          expandBtn.disabled = false;
          expandBtn.textContent = '展开失败，点击重试';
          note.textContent = err.message || '加载全文失败';
        }
      });
      container.appendChild(expandBtn);
    }
  }

  function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'post';
    article.dataset.postId = String(post.id);
    const title = document.createElement('h4');
    title.textContent = post.title;
    const bodyWrap = document.createElement('div');
    renderPostBody(bodyWrap, post, { full: !post.truncated });
    const meta = document.createElement('small');
    meta.textContent = '作者：' + post.author + ' | ' + new Date(post.createdAt).toLocaleString();
    article.append(title, bodyWrap, meta);
    return article;
  }

  async function loadPosts() {
    const postsDiv = document.getElementById('posts');
    const statusEl = document.getElementById('postStatus');
    if (!postsDiv || !statusEl) return;
    statusEl.textContent = '正在加载帖子……';
    try {
      await waitForBackend();
      const data = await requestJson('/api/posts?limit=20');
      const posts = Array.isArray(data) ? data : data.items;
      postsDiv.replaceChildren(...posts.map(createPostElement));
      statusEl.textContent = posts.length ? '共 ' + posts.length + ' 篇帖子' : '还没有帖子，登录后发布第一篇吧。';
    } catch {
      postsDiv.innerHTML = '<article class="post"><h4>动态服务暂未连接</h4><p>后端唤醒后会自动重试；也可手动刷新页面。</p><small>静态内容仍可正常浏览。</small></article>';
      statusEl.textContent = '暂未连接到动态服务。';
    }
  }

  function bindImageInput() {
    const input = document.getElementById('postImages');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    input.addEventListener('change', async function (e) {
      const files = Array.from(e.target.files || []);
      const errorEl = document.getElementById('editorError');
      for (const file of files) {
        if (pendingImages.length >= MAX_IMAGES) {
          if (errorEl) errorEl.textContent = '最多只能添加 5 张图片。';
          break;
        }
        if (!file.type.startsWith('image/')) {
          if (errorEl) errorEl.textContent = '只能上传图片文件。';
          continue;
        }
        if (file.size > MAX_SOURCE_IMAGE_BYTES) {
          if (errorEl) errorEl.textContent = '单张原图不能超过 8MB。';
          continue;
        }
        try {
          if (errorEl) errorEl.textContent = '正在压缩图片……';
          const base64 = await compressImageFile(file);
          pendingImages.push(base64);
          renderImagePreviews();
          if (errorEl) errorEl.textContent = '';
        } catch {
          if (errorEl) errorEl.textContent = '图片处理失败，请换一张再试。';
        }
      }
      this.value = '';
    });
  }

  async function initSiteApp(options = {}) {
    bindImageInput();
    document.getElementById('authModal')?.addEventListener('click', function (e) {
      if (e.target === this) closeAuthModal();
    });
    document.getElementById('editorModal')?.addEventListener('click', function (e) {
      if (e.target === this) closeEditorModal();
    });
    document.getElementById('profileModal')?.addEventListener('click', function (e) {
      if (e.target === this) closeProfileModal();
    });

    const ready = await waitForBackend();
    if (currentToken) await fetchCurrentUser();
    updateUserBar();
    if (options.enableAi) await loadDailyQuote();
    await loadPosts();
    if (ready && typeof global.SiteVisit?.refresh === 'function') {
      global.SiteVisit.refresh();
    }
  }

  Object.assign(global, {
    toggleTheme,
    toggleMusicPlayer,
    toggleMusicCollapse,
    openAuthModal,
    closeAuthModal,
    switchAuthTab,
    handleLogin,
    handleRegister,
    handleLogout,
    openProfileModal,
    closeProfileModal,
    handleUpdateProfile,
    openEditorModal,
    closeEditorModal,
    handleCreatePost,
    handleAiChat,
    handleAiTest,
    removeImage,
    initSiteApp,
    waitForBackend,
    requestJson,
    apiUrl
  });
})(window);
