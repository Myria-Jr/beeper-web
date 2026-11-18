const NETWORK_META = {
  whatsapp: { color: '#25D366', short: 'WA' },
  telegram: { color: '#2AABEE', short: 'TG' },
  signal: { color: '#3A76F0', short: 'SG' },
  imessage: { color: '#007AFF', short: 'iM' },
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
  const palette = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6', '#00C7BE', '#30B0C7'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
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

const state = {
  mode: 'connecting',
  demo: localStorage.getItem('beeper_demo') === '1',
  apiUrl: localStorage.getItem('beeper_url') || '',
  token: localStorage.getItem('beeper_token') || '',
  theme: localStorage.getItem('beeper_theme') || 'light',
  filter: 'all', // 'all' | 'unread' | 'archived'
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
  connectionPill: document.getElementById('connection-pill'),
  connectionLabel: document.getElementById('connection-label'),
  networkList: document.getElementById('network-list'),
  badgeAll: document.getElementById('badge-all'),
  badgeUnread: document.getElementById('badge-unread'),
  listTitle: document.getElementById('list-title'),
  searchInput: document.getElementById('search-input'),
  btnClearSearch: document.getElementById('btn-clear-search'),
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
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
  settingDemo: document.getElementById('setting-demo'),
  settingUrl: document.getElementById('setting-url'),
  settingToken: document.getElementById('setting-token'),
  settingsTestResult: document.getElementById('settings-test-result'),
  toast: document.getElementById('toast'),
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function buildHeaders(extra = {}) {
  const headers = { ...extra };
  if (state.apiUrl) headers['x-beeper-url'] = state.apiUrl;
  if (state.token) headers['x-beeper-token'] = state.token;
  if (state.demo) headers['x-beeper-demo'] = '1';
  return headers;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: buildHeaders(options.headers || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('beeper_theme', theme);
  document.getElementById('theme-label').textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function setConnectionUI(mode, label) {
  state.mode = mode;
  els.connectionPill.className = `connection-pill ${mode}`;
  els.connectionLabel.textContent = label;
}

async function checkHealthAndInit() {
  try {
    const health = await apiFetch('/api/health');
    if (health.connected) {
      setConnectionUI(health.mode, health.mode === 'demo' ? 'Demo-Modus' : `Verbunden (${health.accountCount})`);
    } else {
      // Automatically switch to Demo Mode on first visit if local Beeper isn't running
      if (localStorage.getItem('beeper_demo') === null) {
        state.demo = true;
        localStorage.setItem('beeper_demo', '1');
        setConnectionUI('demo', 'Demo-Modus');
        showToast('Kein lokaler Beeper gefunden — Demo-Modus aktiviert');
      } else {
        setConnectionUI('offline', 'Nicht verbunden');
      }
    }
  } catch {
    setConnectionUI('offline', 'Offline');
  }

  await Promise.all([loadAccounts(), loadChats()]);
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
    els.chatList.innerHTML = `<div style="padding:20px;color:var(--text-muted);font-size:13.5px;">Chats konnten nicht geladen werden: ${err.message}</div>`;
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
    btn.className = `nav-item ${state.accountFilter === acc.accountID ? 'active' : ''}`;
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
    els.chatList.innerHTML = '<div style="padding:28px 16px;text-align:center;color:var(--text-muted);font-size:14px;">Keine Chats gefunden.</div>';
    return;
  }

  for (const chat of state.chats) {
    const meta = getNetworkMeta(chat.network);
    const row = document.createElement('div');
    const isUnread = (chat.unreadCount || 0) > 0;
    row.className = `chat-row ${chat.id === state.activeChatId ? 'active' : ''} ${isUnread ? 'unread' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', chat.id === state.activeChatId ? 'true' : 'false');

    const previewText = chat.preview?.text || 'Keine Nachrichten';
    const timeText = formatTime(chat.lastActivity || chat.preview?.timestamp);

    row.innerHTML = `
      <div class="avatar-wrap">
        <div class="avatar" style="background:${hashColor(chat.title)}">${escapeHtml(getInitials(chat.title))}</div>
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
  els.messageThread.innerHTML = '<div style="margin:auto;color:var(--text-muted);font-size:13.5px;">Lade Verlauf…</div>';
  try {
    const data = await apiFetch(`/api/chats/${encodeURIComponent(chatId)}/messages`);
    const items = (data.items || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    state.messages = items;
    renderMessages();
  } catch (err) {
    els.messageThread.innerHTML = `<div style="margin:auto;color:var(--red);font-size:13.5px;">Fehler: ${escapeHtml(err.message)}</div>`;
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

    if (msg.reactions?.length) {
      const reactWrap = document.createElement('div');
      reactWrap.className = 'msg-reactions';
      for (const r of msg.reactions) {
        const chip = document.createElement('span');
        chip.className = 'reaction-chip';
        chip.textContent = r.key;
        reactWrap.appendChild(chip);
      }
      bubble.appendChild(reactWrap);
    }

    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const replyBtn = document.createElement('button');
    replyBtn.className = 'msg-action-btn';
    replyBtn.title = 'Antworten';
    replyBtn.textContent = '↩';
    replyBtn.addEventListener('click', () => {
      state.replyTo = msg;
      renderReplyBanner();
      els.composerInput.focus();
    });
    actions.appendChild(replyBtn);

    if (outgoing) {
      const delBtn = document.createElement('button');
      delBtn.className = 'msg-action-btn';
      delBtn.title = 'Löschen';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', () => deleteMessage(msg.id));
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
    meta.textContent = formatTime(lastMsg.timestamp) + (lastMsg.edited ? ' · bearbeitet' : '');
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
    showToast(`Senden fehlgeschlagen: ${err.message}`);
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
    showToast(`Fehler: ${err.message}`);
  }
}

function renderInspector(chat) {
  const participants = chat.participants?.items || [];
  els.inspectorBody.innerHTML = `
    <div class="inspector-hero">
      <div class="avatar avatar-lg" style="background:${hashColor(chat.title)}">${escapeHtml(getInitials(chat.title))}</div>
      <div style="font-weight:700;font-size:17px;">${escapeHtml(chat.title)}</div>
      <div style="font-size:13px;color:var(--text-muted);">${escapeHtml(chat.network)} · ${chat.type === 'group' ? 'Gruppe' : 'Direktchat'}</div>
    </div>
    <div class="inspector-section">
      <div class="inspector-section-title">Teilnehmer (${participants.length})</div>
      ${participants
        .map(
          (p) => `
        <div class="participant-row">
          <span>${escapeHtml(p.fullName || p.username || p.id)}</span>
          <span style="color:var(--text-muted);font-size:12px;">${p.isSelf ? 'Du' : escapeHtml(p.username || p.phoneNumber || '')}</span>
        </div>`
        )
        .join('') || '<div style="color:var(--text-muted);font-size:13px;">Keine Details</div>'}
    </div>
    <div class="inspector-section">
      <div class="inspector-section-title">Metadaten</div>
      <div style="font-size:12px;color:var(--text-secondary);word-break:break-all;"><strong>Chat ID:</strong> ${escapeHtml(chat.id)}</div>
      <div style="font-size:12px;color:var(--text-secondary);word-break:break-all;"><strong>Account:</strong> ${escapeHtml(chat.accountID)}</div>
    </div>
  `;
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarBackdrop.classList.add('open');
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarBackdrop.classList.remove('open');
}

function openSettings() {
  els.settingDemo.checked = state.demo;
  els.settingUrl.value = state.apiUrl || 'http://localhost:23373';
  els.settingToken.value = state.token;
  els.settingsTestResult.classList.add('hidden');
  els.settingsModal.classList.remove('hidden');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event Listeners
document.querySelectorAll('.nav-item[data-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-filter]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    els.listTitle.textContent = btn.querySelector('.nav-label').textContent;
    loadChats();
    closeSidebar();
  });
});

let searchTimer;
els.searchInput.addEventListener('input', () => {
  state.searchQuery = els.searchInput.value.trim();
  els.btnClearSearch.classList.toggle('hidden', !state.searchQuery);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadChats, 200);
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
  try {
    await apiFetch(`/api/chats/${encodeURIComponent(state.activeChatId)}/unread`, { method: 'POST' });
    await loadChats();
    showToast('Als ungelesen markiert');
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('btn-archive-chat').addEventListener('click', async () => {
  if (!state.activeChatId) return;
  try {
    await apiFetch(`/api/chats/${encodeURIComponent(state.activeChatId)}/archive`, { method: 'POST' });
    state.activeChatId = null;
    els.stageActive.classList.add('hidden');
    els.stageEmpty.classList.remove('hidden');
    els.shell.classList.remove('mobile-stage-open');
    await loadChats();
    showToast('Chat archiviert / verschoben');
  } catch (err) {
    showToast(err.message);
  }
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

document.getElementById('btn-back-to-list').addEventListener('click', () => {
  els.shell.classList.remove('mobile-stage-open');
});

document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-empty-settings').addEventListener('click', openSettings);
els.connectionPill.addEventListener('click', openSettings);
document.getElementById('btn-close-settings').addEventListener('click', () => {
  els.settingsModal.classList.add('hidden');
});

document.getElementById('btn-test-connection').addEventListener('click', async () => {
  els.settingsTestResult.className = 'test-result';
  els.settingsTestResult.textContent = 'Teste Verbindung…';
  els.settingsTestResult.classList.remove('hidden');

  try {
    const res = await fetch('/api/health', {
      headers: {
        'x-beeper-url': els.settingUrl.value.trim(),
        'x-beeper-token': els.settingToken.value.trim(),
        ...(els.settingDemo.checked ? { 'x-beeper-demo': '1' } : {}),
      },
    });
    const data = await res.json();
    if (data.connected) {
      els.settingsTestResult.classList.add('ok');
      els.settingsTestResult.textContent = `Erfolgreich (${data.mode === 'demo' ? 'Demo-Modus' : `${data.accountCount} Accounts gefunden`})`;
    } else {
      els.settingsTestResult.classList.add('err');
      els.settingsTestResult.textContent = data.error || 'Verbindung fehlgeschlagen';
    }
  } catch (err) {
    els.settingsTestResult.classList.add('err');
    els.settingsTestResult.textContent = err.message;
  }
});

els.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  state.demo = els.settingDemo.checked;
  state.apiUrl = els.settingUrl.value.trim();
  state.token = els.settingToken.value.trim();

  localStorage.setItem('beeper_demo', state.demo ? '1' : '0');
  localStorage.setItem('beeper_url', state.apiUrl);
  localStorage.setItem('beeper_token', state.token);

  els.settingsModal.classList.add('hidden');
  state.activeChatId = null;
  els.stageActive.classList.add('hidden');
  els.stageEmpty.classList.remove('hidden');
  await checkHealthAndInit();
});

// Keyboard shortcut Cmd/Ctrl + K for search
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    els.searchInput.focus();
  }
});

// Initialize
applyTheme(state.theme);
checkHealthAndInit();
