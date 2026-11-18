const NETWORK_META = {
  whatsapp: { color: '#25D366', short: 'WA' },
  telegram: { color: '#2AABEE', short: 'TG' },
  signal: { color: '#3A76F0', short: 'SG' },
  imessage: { color: '#0B57D0', short: 'iM' },
  slack: { color: '#E01E5A', short: 'SL' },
  discord: { color: '#5865F2', short: 'DC' },
  instagram: { color: '#E4405F', short: 'IG' },
  messenger: { color: '#0084FF', short: 'FB' },
  matrix: { color: '#0DBD8B', short: 'MX' },
};

function getNetworkMeta(network = '') {
  const key = network.toLowerCase();
  for (const [name, meta] of Object.entries(NETWORK_META)) {
    if (key.includes(name)) return meta;
  }
  return { color: '#64748B', short: network.slice(0, 2).toUpperCase() || 'BP' };
}

function getInitials(title = '') {
  const clean = title.replace(/^#/, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hashColor(str = '') {
  const palette = ['#6750A4', '#0099E5', '#2E6B4E', '#9C4130', '#8E2463', '#825500', '#006A6A', '#3B5BA9'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function formatDayLabel(iso) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Heute';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Gestern';
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const savedUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('beeper_user') || 'null');
  } catch {
    return null;
  }
})();

const isNativeApp = ['capacitor:', 'file:'].includes(window.location.protocol);

const state = {
  user: savedUser,
  authMode: localStorage.getItem('beeper_auth_mode') || 'desktop',
  serverUrl: localStorage.getItem('beeper_server_url') || (isNativeApp ? 'http://localhost:3000' : ''),
  apiUrl: localStorage.getItem('beeper_url') || 'http://localhost:23373',
  token: localStorage.getItem('beeper_token') || '',
  theme: localStorage.getItem('beeper_theme') || 'light',
  seed: localStorage.getItem('beeper_seed') || 'lavender',
  filter: 'all',
  accountFilter: null,
  searchQuery: '',
  accounts: [],
  chats: [],
  activeChatId: null,
  messages: [],
  replyTo: null,
  inspectorOpen: false,
};

const els = {
  shell: document.getElementById('app'),
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  accountAvatar: document.getElementById('account-avatar'),
  accountName: document.getElementById('account-name'),
  accountHandle: document.getElementById('account-handle'),
  statusDot: document.getElementById('status-dot'),
  networkList: document.getElementById('network-list'),
  badgeUnread: document.getElementById('badge-unread'),
  listTitle: document.getElementById('list-title'),
  searchInput: document.getElementById('search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  wavyLoader: document.getElementById('wavy-loader'),
  chatList: document.getElementById('chat-list'),
  stageEmpty: document.getElementById('stage-empty'),
  stageActive: document.getElementById('stage-active'),
  stageAvatar: document.getElementById('stage-avatar'),
  stageTitle: document.getElementById('stage-title'),
  stageSubtitle: document.getElementById('stage-subtitle'),
  messageThread: document.getElementById('message-thread'),
  replyBanner: document.getElementById('reply-banner'),
  replyAuthor: document.getElementById('reply-author'),
  replySnippet: document.getElementById('reply-snippet'),
  composerForm: document.getElementById('composer-form'),
  composerInput: document.getElementById('composer-input'),
  btnSend: document.getElementById('btn-send'),
  inspector: document.getElementById('inspector'),
  inspectorBody: document.getElementById('inspector-body'),
  authModal: document.getElementById('auth-modal'),
  signedInBar: document.getElementById('signed-in-bar'),
  signedInSummary: document.getElementById('signed-in-summary'),
  toast: document.getElementById('toast'),
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('beeper_theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  document.getElementById('theme-label').textContent = theme === 'dark' ? 'Light' : 'Dark';
}

function applySeed(seed) {
  state.seed = seed;
  document.documentElement.setAttribute('data-seed', seed);
  localStorage.setItem('beeper_seed', seed);
  document.querySelectorAll('.seed-dot').forEach((d) => {
    d.classList.toggle('active', d.dataset.seed === seed);
  });
}

function updateAccountUI() {
  const user = state.user;
  if (user) {
    els.accountAvatar.textContent = getInitials(user.fullName || user.username || 'B');
    els.accountName.textContent = user.fullName || 'Beeper User';
    els.accountHandle.textContent = user.username || user.id || 'Verbunden';
    els.statusDot.className = 'status-dot live';
    els.signedInBar.classList.remove('hidden');
    els.signedInSummary.textContent = `Verbunden als ${user.fullName || user.username}`;
    document.getElementById('login-btn-label').textContent = 'Konto & API';
  } else {
    els.accountAvatar.textContent = '?';
    els.accountName.textContent = 'Nicht verbunden';
    els.accountHandle.textContent = 'Klicken zum Verbinden';
    els.statusDot.className = 'status-dot';
    els.signedInBar.classList.add('hidden');
    document.getElementById('login-btn-label').textContent = 'Beeper verbinden';
  }
}

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.apiUrl) headers['x-beeper-url'] = state.apiUrl;
  if (state.token) headers['x-beeper-token'] = state.token;
  if (state.authMode === 'matrix') {
    headers['x-beeper-mode'] = 'matrix';
    if (state.user?.id) headers['x-beeper-userid'] = state.user.id;
  }
  return headers;
}

function resolveApiPath(path) {
  const base = (state.serverUrl || '').trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(resolveApiPath(path), {
    ...options,
    headers: buildHeaders(options.headers || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function initApp() {
  updateAccountUI();

  if (!state.user) {
    // Check if server env vars (BEEPER_API_URL / BEEPER_ACCESS_TOKEN) are already live
    try {
      const health = await apiFetch('/api/health');
      if (health.connected) {
        state.user = {
          id: health.userId || 'beeper-desktop',
          fullName: 'Beeper Desktop',
          username: `${health.accountCount ?? ''} Netzwerke`.trim(),
        };
        localStorage.setItem('beeper_user', JSON.stringify(state.user));
        updateAccountUI();
      }
    } catch {
      // Remain unconnected until user signs in
    }
  }

  if (state.user) {
    await Promise.all([loadAccounts(), loadChats()]);
  } else {
    els.chatList.innerHTML =
      '<div style="padding:32px 18px;text-align:center;color:var(--md-on-surface-variant);font-size:13.5px;">Noch nicht verbunden.<br/>Klicke auf <strong>Beeper verbinden</strong>, um deine Chats zu laden.</div>';
  }
}

async function loadAccounts() {
  try {
    const data = await apiFetch('/api/accounts');
    state.accounts = data.items || [];
    renderNetworks();
  } catch {
    state.accounts = [];
    renderNetworks();
  }
}

async function loadChats() {
  if (!state.user) return;
  els.wavyLoader.classList.remove('hidden');

  const params = new URLSearchParams();
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.filter === 'unread') params.set('unreadOnly', 'true');
  if (state.filter === 'archived') params.set('archived', 'true');
  if (state.accountFilter) params.set('accountIDs', state.accountFilter);

  try {
    const data = await apiFetch(`/api/chats?${params.toString()}`);
    state.chats = data.items || [];
    renderChatList();
    updateBadges();
  } catch (err) {
    els.chatList.innerHTML = `<div style="padding:24px 16px;color:var(--md-on-surface-variant);font-size:13.5px;">Verbindungsfehler: ${escapeHtml(err.message)}</div>`;
  } finally {
    els.wavyLoader.classList.add('hidden');
  }
}

function updateBadges() {
  const unreadTotal = state.chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  els.badgeUnread.textContent = unreadTotal;
  els.badgeUnread.classList.toggle('hidden', unreadTotal === 0);
}

function renderNetworks() {
  els.networkList.innerHTML = '';
  for (const acc of state.accounts) {
    const name = acc.network || acc.accountID;
    const meta = getNetworkMeta(name);
    const btn = document.createElement('button');
    btn.className = `m3-nav-pill ${state.accountFilter === acc.accountID ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="network-dot" style="background:${meta.color}"></span>
      <span class="nav-label">${escapeHtml(name)}</span>
    `;
    btn.addEventListener('click', () => {
      state.accountFilter = state.accountFilter === acc.accountID ? null : acc.accountID;
      renderNetworks();
      loadChats();
      closeSidebar();
    });
    els.networkList.appendChild(btn);
  }
}

function renderChatList() {
  els.chatList.innerHTML = '';
  if (state.chats.length === 0) {
    els.chatList.innerHTML =
      '<div style="padding:28px 16px;text-align:center;color:var(--md-on-surface-variant);font-size:14px;">Keine Chats gefunden.</div>';
    return;
  }

  for (const chat of state.chats) {
    const meta = getNetworkMeta(chat.network);
    const row = document.createElement('div');
    const isUnread = (chat.unreadCount || 0) > 0;
    row.className = `chat-row ${chat.id === state.activeChatId ? 'active' : ''}`;
    row.setAttribute('role', 'option');

    const previewText = chat.preview?.text || 'Keine Nachrichten';
    const timeText = formatTime(chat.lastActivity || chat.preview?.timestamp);

    row.innerHTML = `
      <div class="avatar-wrap">
        <div class="m3-avatar" style="background:${hashColor(chat.title)}">${escapeHtml(getInitials(chat.title))}</div>
        <span class="network-badge" style="background:${meta.color}">${escapeHtml(meta.short)}</span>
      </div>
      <div class="chat-row-body">
        <div class="chat-row-top">
          <span class="chat-row-title">${chat.isPinned ? '📌 ' : ''}${escapeHtml(chat.title)}</span>
          <span class="chat-row-time">${escapeHtml(timeText)}</span>
        </div>
        <div class="chat-row-bottom">
          <span class="chat-row-preview">${escapeHtml(previewText)}</span>
          ${isUnread ? `<span class="unread-pill">${chat.unreadCount}</span>` : ''}
        </div>
      </div>
    `;
    row.addEventListener('click', () => selectChat(chat.id));
    els.chatList.appendChild(row);
  }
}

async function selectChat(chatId) {
  state.activeChatId = chatId;
  state.replyTo = null;
  renderReplyBanner();
  renderChatList();

  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) return;

  els.stageEmpty.classList.add('hidden');
  els.stageActive.classList.remove('hidden');
  els.shell.classList.add('mobile-stage-open');

  els.stageAvatar.textContent = getInitials(chat.title);
  els.stageAvatar.style.background = hashColor(chat.title);
  els.stageTitle.textContent = chat.title;
  const count = chat.participants?.items?.length || 0;
  els.stageSubtitle.textContent = `${chat.network}${chat.type === 'group' && count ? ` · ${count} Teilnehmer` : ''}`;

  if ((chat.unreadCount || 0) > 0) {
    chat.unreadCount = 0;
    renderChatList();
    updateBadges();
    apiFetch(`/api/chats/${encodeURIComponent(chatId)}/read`, { method: 'POST' }).catch(() => {});
  }

  await loadMessages(chatId);
  if (state.inspectorOpen) renderInspector(chat);
}

async function loadMessages(chatId) {
  els.messageThread.innerHTML = '<div style="margin:auto;color:var(--md-on-surface-variant);font-size:13.5px;">Lade Verlauf…</div>';
  try {
    const data = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/messages`);
    state.messages = (data.items || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    renderMessages();
  } catch (err) {
    els.messageThread.innerHTML = `<div style="margin:auto;color:#d93025;font-size:13.5px;">Fehler: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMessages() {
  els.messageThread.innerHTML = '';
  const chat = state.chats.find((c) => c.id === state.activeChatId);
  const isGroup = chat?.type === 'group';
  let lastDay = '';
  let currentGroup = null;
  let lastSender = null;

  for (const msg of state.messages) {
    const day = formatDayLabel(msg.timestamp);
    if (day !== lastDay) {
      lastDay = day;
      lastSender = null;
      const divider = document.createElement('div');
      divider.className = 'date-divider';
      divider.textContent = day;
      els.messageThread.appendChild(divider);
    }

    const outgoing = Boolean(msg.isSender);
    const senderKey = outgoing ? '__self__' : msg.senderID || msg.senderName || 'other';
    if (!currentGroup || lastSender !== senderKey) {
      currentGroup = document.createElement('div');
      currentGroup.className = `msg-group ${outgoing ? 'outgoing' : 'incoming'}`;
      if (!outgoing && isGroup && msg.senderName) {
        const senderEl = document.createElement('div');
        senderEl.className = 'msg-sender';
        senderEl.textContent = msg.senderName;
        currentGroup.appendChild(senderEl);
      }
      els.messageThread.appendChild(currentGroup);
      lastSender = senderKey;
    }

    const row = document.createElement('div');
    row.className = 'msg-row';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text || '[Anhang]';

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const replyBtn = document.createElement('button');
    replyBtn.className = 'msg-action-btn';
    replyBtn.title = 'Antworten';
    replyBtn.textContent = '↩';
    replyBtn.onclick = () => {
      state.replyTo = msg;
      renderReplyBanner();
      els.composerInput.focus();
    };
    actions.appendChild(replyBtn);

    if (outgoing) {
      const delBtn = document.createElement('button');
      delBtn.className = 'msg-action-btn';
      delBtn.title = 'Löschen';
      delBtn.textContent = '🗑';
      delBtn.onclick = () => deleteMessage(msg.id);
      actions.appendChild(delBtn);
    }

    row.appendChild(bubble);
    row.appendChild(actions);
    currentGroup.appendChild(row);
  }

  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg && currentGroup) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = formatTime(lastMsg.timestamp);
    currentGroup.appendChild(meta);
  }
  els.messageThread.scrollTop = els.messageThread.scrollHeight;
}

function renderReplyBanner() {
  if (!state.replyTo) {
    els.replyBanner.classList.add('hidden');
    return;
  }
  els.replyBanner.classList.remove('hidden');
  els.replyAuthor.textContent = state.replyTo.isSender ? 'dich' : state.replyTo.senderName || 'Nachricht';
  els.replySnippet.textContent = state.replyTo.text || '';
}

async function sendMessage(text) {
  if (!state.activeChatId || !text.trim()) return;
  const chatId = state.activeChatId;
  const payload = { text: text.trim() };
  if (state.replyTo) payload.replyToMessageID = state.replyTo.id;

  els.composerInput.value = '';
  els.composerInput.style.height = 'auto';
  els.btnSend.disabled = true;
  state.replyTo = null;
  renderReplyBanner();

  try {
    await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await Promise.all([loadMessages(chatId), loadChats()]);
  } catch (err) {
    showToast(`Fehler: ${err.message}`);
  }
}

async function deleteMessage(messageId) {
  if (!state.activeChatId) return;
  try {
    await apiFetch(`/api/chats/${encodeURIComponent(state.activeChatId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    await loadMessages(state.activeChatId);
    showToast('Nachricht gelöscht');
  } catch (err) {
    showToast(err.message);
  }
}

function renderInspector(chat) {
  const participants = chat.participants?.items || [];
  els.inspectorBody.innerHTML = `
    <div class="inspector-hero">
      <div class="m3-avatar m3-avatar-lg" style="background:${hashColor(chat.title)}">${escapeHtml(getInitials(chat.title))}</div>
      <div style="font-weight:700;font-size:17px;">${escapeHtml(chat.title)}</div>
      <div style="font-size:13px;color:var(--md-on-surface-variant);">${escapeHtml(chat.network)}</div>
    </div>
    <div class="inspector-section">
      <div class="inspector-section-title">Teilnehmer (${participants.length})</div>
      ${participants.map((p) => `<div class="participant-row"><span>${escapeHtml(p.fullName || p.id)}</span><span style="opacity:0.7">${p.isSelf ? 'Du' : ''}</span></div>`).join('')}
    </div>
  `;
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('.m3-nav-pill[data-filter]').forEach((b) => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  document.querySelectorAll('.m3-connected-btn[data-filter]').forEach((b) => {
    const active = b.dataset.filter === filter;
    b.classList.toggle('active', active);
    const label = b.dataset.filter === 'all' ? 'Alle' : b.dataset.filter === 'unread' ? 'Ungelesen' : 'Archiv';
    b.textContent = active ? `✓ ${label}` : label;
  });
  els.listTitle.textContent = filter === 'all' ? 'Chats' : filter === 'unread' ? 'Ungelesen' : 'Archiv';
  loadChats();
  closeSidebar();
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarBackdrop.classList.add('open');
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarBackdrop.classList.remove('open');
}

function openAuthModal() {
  const srvGroup = document.getElementById('server-url-group');
  if (isNativeApp) srvGroup.classList.remove('hidden');
  document.getElementById('server-url').value = state.serverUrl;
  document.getElementById('desktop-url').value = state.apiUrl;
  document.getElementById('desktop-token').value = state.token;
  document.getElementById('auth-error-beeper').classList.add('hidden');
  document.getElementById('auth-error-desktop').classList.add('hidden');
  els.authModal.classList.remove('hidden');
}

// Auth Modal Tabs
document.querySelectorAll('.seg-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.seg-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.authTab;
    document.getElementById('form-auth-desktop').classList.toggle('hidden', target !== 'desktop');
    document.getElementById('form-auth-beeper').classList.toggle('hidden', target !== 'beeper');
  });
});

// Login: Beeper Desktop API
document.getElementById('form-auth-desktop').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('auth-error-desktop');
  errBox.classList.add('hidden');
  if (isNativeApp) {
    state.serverUrl = document.getElementById('server-url').value.trim();
    localStorage.setItem('beeper_server_url', state.serverUrl);
  }
  const apiUrl = document.getElementById('desktop-url').value.trim();
  const token = document.getElementById('desktop-token').value.trim();
  try {
    const resp = await fetch(resolveApiPath('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'desktop', apiUrl, token }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Verbindung fehlgeschlagen');
    state.user = data.user;
    state.authMode = 'desktop';
    state.apiUrl = apiUrl;
    state.token = token;
    localStorage.setItem('beeper_user', JSON.stringify(state.user));
    localStorage.setItem('beeper_auth_mode', 'desktop');
    localStorage.setItem('beeper_url', apiUrl);
    localStorage.setItem('beeper_token', token);
    updateAccountUI();
    els.authModal.classList.add('hidden');
    showToast('Mit Beeper Desktop verbunden!');
    await Promise.all([loadAccounts(), loadChats()]);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

// Login: Beeper Account (matrix.beeper.com)
document.getElementById('form-auth-beeper').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('auth-error-beeper');
  errBox.classList.add('hidden');
  const identifier = document.getElementById('beeper-ident').value.trim();
  const password = document.getElementById('beeper-pass').value;
  try {
    const resp = await fetch(resolveApiPath('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'beeper', identifier, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Anmeldung fehlgeschlagen');
    state.user = data.user;
    state.authMode = 'matrix';
    state.token = data.accessToken || '';
    localStorage.setItem('beeper_user', JSON.stringify(state.user));
    localStorage.setItem('beeper_auth_mode', 'matrix');
    localStorage.setItem('beeper_token', state.token);
    updateAccountUI();
    els.authModal.classList.add('hidden');
    showToast(`Willkommen, ${state.user.fullName}!`);
    await Promise.all([loadAccounts(), loadChats()]);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
});

document.getElementById('btn-signout').addEventListener('click', () => {
  state.user = null;
  state.token = '';
  state.chats = [];
  state.accounts = [];
  state.activeChatId = null;
  localStorage.removeItem('beeper_user');
  localStorage.removeItem('beeper_token');
  els.stageActive.classList.add('hidden');
  els.stageEmpty.classList.remove('hidden');
  els.chatList.innerHTML = '';
  els.networkList.innerHTML = '';
  updateAccountUI();
  els.authModal.classList.add('hidden');
  showToast('Verbindung getrennt');
});

// Filter Pills & Connected Segmented Group
document.querySelectorAll('.m3-nav-pill[data-filter], .m3-connected-btn[data-filter]').forEach((btn) => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
});

document.querySelectorAll('.seed-dot').forEach((dot) => {
  dot.addEventListener('click', () => applySeed(dot.dataset.seed));
});

document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

els.searchInput.addEventListener('input', () => {
  state.searchQuery = els.searchInput.value.trim();
  els.btnClearSearch.classList.toggle('hidden', !state.searchQuery);
  loadChats();
});

els.btnClearSearch.addEventListener('click', () => {
  els.searchInput.value = '';
  state.searchQuery = '';
  els.btnClearSearch.classList.add('hidden');
  loadChats();
});

els.composerInput.addEventListener('input', () => {
  els.composerInput.style.height = 'auto';
  els.composerInput.style.height = `${Math.min(els.composerInput.scrollHeight, 140)}px`;
  els.btnSend.disabled = !els.composerInput.value.trim();
});

els.composerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (els.composerInput.value.trim()) sendMessage(els.composerInput.value);
  }
});

els.composerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(els.composerInput.value);
});

document.getElementById('btn-focus-composer').addEventListener('click', () => {
  els.composerInput.focus();
});

document.getElementById('btn-cancel-reply').addEventListener('click', () => {
  state.replyTo = null;
  renderReplyBanner();
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  loadChats();
  if (state.activeChatId) loadMessages(state.activeChatId);
  showToast('Aktualisiert');
});

document.getElementById('btn-mark-unread').addEventListener('click', async () => {
  if (!state.activeChatId) return;
  await apiFetch(`/api/chats/${encodeURIComponent(state.activeChatId)}/unread`, { method: 'POST' });
  await loadChats();
});

document.getElementById('btn-archive-chat').addEventListener('click', async () => {
  if (!state.activeChatId) return;
  await apiFetch(`/api/chats/${encodeURIComponent(state.activeChatId)}/archive`, { method: 'POST' });
  state.activeChatId = null;
  els.stageActive.classList.add('hidden');
  els.stageEmpty.classList.remove('hidden');
  els.shell.classList.remove('mobile-stage-open');
  await loadChats();
});

document.getElementById('btn-toggle-inspector').addEventListener('click', () => {
  state.inspectorOpen = !state.inspectorOpen;
  els.inspector.classList.toggle('hidden', !state.inspectorOpen);
  if (state.inspectorOpen && state.activeChatId) {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    if (chat) renderInspector(chat);
  }
});

document.getElementById('btn-close-inspector').addEventListener('click', () => {
  state.inspectorOpen = false;
  els.inspector.classList.add('hidden');
});

document.getElementById('btn-open-sidebar').addEventListener('click', openSidebar);
document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebar);
els.sidebarBackdrop.addEventListener('click', closeSidebar);
document.getElementById('btn-back-to-list').addEventListener('click', () => els.shell.classList.remove('mobile-stage-open'));

document.getElementById('account-card').addEventListener('click', openAuthModal);
document.getElementById('btn-open-login').addEventListener('click', openAuthModal);
document.getElementById('btn-empty-login').addEventListener('click', openAuthModal);
document.getElementById('btn-close-auth').addEventListener('click', () => els.authModal.classList.add('hidden'));

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    els.searchInput.focus();
  }
  if (e.key === 'Escape') {
    els.authModal.classList.add('hidden');
    if (state.inspectorOpen) {
      state.inspectorOpen = false;
      els.inspector.classList.add('hidden');
    }
  }
});

applyTheme(state.theme);
applySeed(state.seed);
initApp();
