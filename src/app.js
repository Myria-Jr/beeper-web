const path = require('path');
const express = require('express');
const cors = require('cors');
const { createInitialState } = require('./mockData');

const app = express();
const demoState = createInitialState();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static frontend files (used in local Node/Express mode; Vercel serves public/ directly too)
app.use(express.static(path.join(__dirname, '..', 'public')));

function getBeeperConfig(req) {
  const rawUrl =
    req.headers['x-beeper-url'] ||
    process.env.BEEPER_API_URL ||
    'http://localhost:23373';
  const token =
    req.headers['x-beeper-token'] ||
    process.env.BEEPER_ACCESS_TOKEN ||
    '';
  const forceDemo =
    req.query.demo === '1' ||
    req.headers['x-beeper-demo'] === '1';

  let baseUrl = String(rawUrl).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      baseUrl = 'http://localhost:23373';
    }
  } catch {
    baseUrl = 'http://localhost:23373';
  }

  return { baseUrl, token: String(token).trim(), forceDemo };
}

async function beeperFetch(config, apiPath, options = {}) {
  const url = `${config.baseUrl}${apiPath}`;
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 8000),
  });

  const contentType = response.headers.get('content-type') || '';
  if (options.raw) {
    return response;
  }

  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : {};
  }

  return { ok: response.ok, status: response.status, data };
}

function handleProxyError(res, err) {
  const message =
    err?.name === 'TimeoutError'
      ? 'Beeper Desktop API timed out (is Beeper Desktop running?)'
      : err?.cause?.code === 'ECONNREFUSED'
      ? 'Cannot connect to Beeper Desktop API (ECONNREFUSED)'
      : err?.message || 'Unknown proxy error';

  res.status(502).json({
    error: message,
    hint: 'Enable Beeper Desktop API in Beeper -> Settings -> Developers, or switch to Demo Mode.',
  });
}

// Health / Connection check
app.get('/api/health', async (req, res) => {
  const config = getBeeperConfig(req);
  if (config.forceDemo) {
    return res.json({
      ok: true,
      connected: true,
      mode: 'demo',
      apiUrl: config.baseUrl,
      accountCount: demoState.accounts.length,
    });
  }

  try {
    const result = await beeperFetch(config, '/v1/accounts', { timeoutMs: 3000 });
    if (!result.ok) {
      return res.json({
        ok: false,
        connected: false,
        mode: 'live',
        apiUrl: config.baseUrl,
        status: result.status,
        error: result.data?.message || `HTTP ${result.status}`,
      });
    }

    const items = Array.isArray(result.data) ? result.data : result.data?.items || [];
    return res.json({
      ok: true,
      connected: true,
      mode: 'live',
      apiUrl: config.baseUrl,
      accountCount: items.length,
    });
  } catch (err) {
    return res.json({
      ok: false,
      connected: false,
      mode: 'offline',
      apiUrl: config.baseUrl,
      error: err?.cause?.code === 'ECONNREFUSED' ? 'Beeper Desktop API unreachable' : err.message,
    });
  }
});

// Beeper Account Login (Desktop API Token, Beeper Matrix Account, or Demo)
app.post('/api/auth/login', async (req, res) => {
  const { mode = 'desktop', apiUrl, token, identifier, password } = req.body || {};

  if (mode === 'demo') {
    return res.json({
      ok: true,
      mode: 'demo',
      user: {
        id: '@alexmercer:beeper.com',
        fullName: 'Alex Mercer',
        username: '@alexmercer',
        networkCount: demoState.accounts.length,
      },
    });
  }

  if (mode === 'beeper') {
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Bitte Beeper-Handle/E-Mail und Passwort eingeben.' });
    }
    try {
      const userIdent = String(identifier).trim();
      const loginPayload = {
        type: 'm.login.password',
        identifier: userIdent.includes('@') && !userIdent.startsWith('@')
          ? { type: 'm.id.thirdparty', medium: 'email', address: userIdent }
          : { type: 'm.id.user', user: userIdent },
        password: String(password),
        initial_device_display_name: 'Beeper Web (iPad)',
      };
      const resp = await fetch('https://matrix.beeper.com/_matrix/client/v3/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload),
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(resp.status).json({
          error: data.error || 'Anmeldung bei Beeper fehlgeschlagen',
          errcode: data.errcode,
        });
      }
      return res.json({
        ok: true,
        mode: 'beeper',
        accessToken: data.access_token,
        user: {
          id: data.user_id,
          fullName: userIdent.replace(/^@/, '').split(':')[0],
          username: data.user_id,
          deviceId: data.device_id,
        },
      });
    } catch (err) {
      return res.status(502).json({ error: `Beeper Login nicht erreichbar: ${err.message}` });
    }
  }

  // Default: Beeper Desktop API verification
  const targetUrl = String(apiUrl || process.env.BEEPER_API_URL || 'http://localhost:23373').trim().replace(/\/+$/, '');
  const targetToken = String(token || process.env.BEEPER_ACCESS_TOKEN || '').trim();
  try {
    const result = await beeperFetch({ baseUrl: targetUrl, token: targetToken }, '/v1/accounts', { timeoutMs: 5000 });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.data?.message || `HTTP ${result.status}` });
    }
    const items = Array.isArray(result.data) ? result.data : result.data?.items || [];
    const primaryUser = items.find((a) => a.user)?.user || {};
    return res.json({
      ok: true,
      mode: 'live',
      apiUrl: targetUrl,
      user: {
        id: primaryUser.id || 'beeper-desktop',
        fullName: primaryUser.fullName || 'Beeper User',
        username: primaryUser.username || `${items.length} Netzwerke`,
        networkCount: items.length,
      },
    });
  } catch (err) {
    return res.status(502).json({
      error: err?.cause?.code === 'ECONNREFUSED'
        ? 'Beeper Desktop API nicht erreichbar (läuft Beeper Desktop auf Port 23373?)'
        : err.message,
    });
  }
});

// List connected accounts
app.get('/api/accounts', async (req, res) => {
  const config = getBeeperConfig(req);
  if (config.forceDemo) {
    return res.json({ items: demoState.accounts });
  }

  try {
    const result = await beeperFetch(config, '/v1/accounts');
    if (!result.ok) return res.status(result.status).json(result.data);
    const items = Array.isArray(result.data) ? result.data : result.data?.items || [];
    res.json({ items });
  } catch (err) {
    handleProxyError(res, err);
  }
});

// List or search chats
app.get('/api/chats', async (req, res) => {
  const config = getBeeperConfig(req);
  const { q, accountIDs, unreadOnly, cursor, limit, archived } = req.query;

  if (config.forceDemo) {
    let chats = [...demoState.chats];
    if (archived === 'true') {
      chats = chats.filter((c) => c.isArchived);
    } else if (archived !== 'all') {
      chats = chats.filter((c) => !c.isArchived);
    }
    if (unreadOnly === 'true') {
      chats = chats.filter((c) => (c.unreadCount || 0) > 0);
    }
    if (accountIDs) {
      const ids = String(accountIDs).split(',').filter(Boolean);
      if (ids.length > 0) chats = chats.filter((c) => ids.includes(c.accountID));
    }
    if (q) {
      const query = String(q).toLowerCase();
      chats = chats.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.network.toLowerCase().includes(query) ||
          (c.preview?.text || '').toLowerCase().includes(query)
      );
    }
    chats.sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });
    return res.json({ items: chats, hasMore: false });
  }

  try {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (cursor) params.set('cursor', String(cursor));
    if (accountIDs) {
      String(accountIDs)
        .split(',')
        .filter(Boolean)
        .forEach((id) => params.append('accountIDs', id));
    }

    let endpoint = '/v1/chats';
    if (q || unreadOnly === 'true' || archived === 'true') {
      endpoint = '/v1/chats/search';
      if (q) params.set('query', String(q));
      if (unreadOnly === 'true') params.set('unreadOnly', 'true');
      if (archived === 'true') params.set('inbox', 'archive');
    }

    const qs = params.toString();
    const result = await beeperFetch(config, qs ? `${endpoint}?${qs}` : endpoint);
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Get single chat details
app.get('/api/chats/:chatId', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId } = req.params;

  if (config.forceDemo) {
    const chat = demoState.chats.find((c) => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    return res.json(chat);
  }

  try {
    const result = await beeperFetch(config, `/v1/chats/${encodeURIComponent(chatId)}`);
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// List messages in a chat
app.get('/api/chats/:chatId/messages', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId } = req.params;

  if (config.forceDemo) {
    const items = demoState.messagesByChat[chatId] || [];
    return res.json({ items, hasMore: false });
  }

  try {
    const params = new URLSearchParams();
    if (req.query.cursor) params.set('cursor', String(req.query.cursor));
    if (req.query.limit) params.set('limit', String(req.query.limit));
    const qs = params.toString();
    const endpoint = `/v1/chats/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ''}`;
    const result = await beeperFetch(config, endpoint);
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Send message to a chat
app.post('/api/chats/:chatId/messages', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId } = req.params;
  const { text, replyToMessageID } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  if (config.forceDemo) {
    const chat = demoState.chats.find((c) => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    const msg = {
      id: `msg_demo_${Date.now()}`,
      chatID: chatId,
      senderID: 'self',
      senderName: 'Alex Mercer',
      isSender: true,
      text: String(text).trim(),
      timestamp: new Date().toISOString(),
      ...(replyToMessageID ? { replyToMessageID } : {}),
    };
    demoState.messagesByChat[chatId] = demoState.messagesByChat[chatId] || [];
    demoState.messagesByChat[chatId].push(msg);
    chat.preview = {
      id: msg.id,
      text: msg.text,
      timestamp: msg.timestamp,
      senderID: msg.senderID,
    };
    chat.lastActivity = msg.timestamp;
    chat.unreadCount = 0;
    return res.status(201).json({ chatID: chatId, pendingMessageID: msg.id, message: msg });
  }

  try {
    const payload = { text: String(text).trim() };
    if (replyToMessageID) payload.replyToMessageID = replyToMessageID;
    const result = await beeperFetch(
      config,
      `/v1/chats/${encodeURIComponent(chatId)}/messages`,
      { method: 'POST', body: payload }
    );
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Edit message
app.put('/api/chats/:chatId/messages/:messageId', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId, messageId } = req.params;
  const { text } = req.body || {};

  if (config.forceDemo) {
    const list = demoState.messagesByChat[chatId] || [];
    const msg = list.find((m) => m.id === messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    msg.text = String(text || '').trim();
    msg.edited = true;
    return res.json(msg);
  }

  try {
    const result = await beeperFetch(
      config,
      `/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'PUT', body: { text } }
    );
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Delete message
app.delete('/api/chats/:chatId/messages/:messageId', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId, messageId } = req.params;

  if (config.forceDemo) {
    const list = demoState.messagesByChat[chatId] || [];
    demoState.messagesByChat[chatId] = list.filter((m) => m.id !== messageId);
    return res.json({ deleted: true });
  }

  try {
    const result = await beeperFetch(
      config,
      `/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE' }
    );
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Mark chat as read / unread / archive
app.post('/api/chats/:chatId/:action(read|unread|archive)', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId, action } = req.params;

  if (config.forceDemo) {
    const chat = demoState.chats.find((c) => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (action === 'read') chat.unreadCount = 0;
    if (action === 'unread') chat.unreadCount = Math.max(1, chat.unreadCount || 0);
    if (action === 'archive') chat.isArchived = !chat.isArchived;
    return res.json(chat);
  }

  try {
    const result = await beeperFetch(
      config,
      `/v1/chats/${encodeURIComponent(chatId)}/${action}`,
      { method: 'POST', body: req.body || {} }
    );
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Search messages across all chats
app.get('/api/messages/search', async (req, res) => {
  const config = getBeeperConfig(req);
  const q = String(req.query.q || '').trim();

  if (config.forceDemo) {
    const lower = q.toLowerCase();
    const items = [];
    for (const [chatId, msgs] of Object.entries(demoState.messagesByChat)) {
      for (const m of msgs) {
        if (!lower || m.text.toLowerCase().includes(lower)) {
          items.push({ ...m, chatID: chatId });
        }
      }
    }
    return res.json({ items });
  }

  try {
    const params = new URLSearchParams();
    if (q) params.set('query', q);
    const result = await beeperFetch(config, `/v1/messages/search?${params.toString()}`);
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// Proxy encrypted mxc:// or local media assets from Beeper Desktop API
app.get('/api/assets', async (req, res) => {
  const config = getBeeperConfig(req);
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url query parameter' });
  if (config.forceDemo) return res.status(404).end();

  try {
    const response = await beeperFetch(
      config,
      `/v1/assets/serve?url=${encodeURIComponent(String(targetUrl))}`,
      { raw: true, timeoutMs: 15000 }
    );
    if (!response.ok) return res.status(response.status).end();
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// SPA fallback for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
