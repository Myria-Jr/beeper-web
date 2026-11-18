const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const APP_VERSION = '1.0.0-beta.1';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
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
  const matrixMode = req.headers['x-beeper-mode'] === 'matrix';

  let baseUrl = String(rawUrl).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      baseUrl = 'http://localhost:23373';
    }
  } catch {
    baseUrl = 'http://localhost:23373';
  }

  return { baseUrl, token: String(token).trim(), matrixMode };
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

  if (options.raw) return response;

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : {};
  }

  return { ok: response.ok, status: response.status, data };
}

async function matrixFetch(token, apiPath, options = {}) {
  const resp = await fetch(`https://matrix.beeper.com${apiPath}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

function handleProxyError(res, err) {
  const message =
    err?.name === 'TimeoutError'
      ? 'Beeper API Zeitüberschreitung (läuft Beeper Desktop / Tunnel?)'
      : err?.cause?.code === 'ECONNREFUSED'
      ? 'Verbindung zur Beeper Desktop API abgelehnt (Port 23373 nicht erreichbar)'
      : err?.message || 'Unbekannter Proxy-Fehler';

  res.status(502).json({
    error: message,
    hint: 'Aktiviere die Beeper Desktop API unter Einstellungen → Developers oder melde dich mit deinem Beeper-Konto an.',
  });
}

// Health / Connection check
app.get('/api/health', async (req, res) => {
  const config = getBeeperConfig(req);

  if (config.matrixMode && config.token) {
    try {
      const who = await matrixFetch(config.token, '/_matrix/client/v3/account/whoami');
      if (who.ok) {
        return res.json({
          ok: true,
          connected: true,
          mode: 'matrix',
          version: APP_VERSION,
          userId: who.data?.user_id,
        });
      }
      return res.json({ ok: false, connected: false, mode: 'matrix', version: APP_VERSION, error: who.data?.error });
    } catch (err) {
      return res.json({ ok: false, connected: false, mode: 'matrix', version: APP_VERSION, error: err.message });
    }
  }

  try {
    const result = await beeperFetch(config, '/v1/accounts', { timeoutMs: 3500 });
    if (!result.ok) {
      return res.json({
        ok: false,
        connected: false,
        mode: 'desktop',
        version: APP_VERSION,
        apiUrl: config.baseUrl,
        status: result.status,
        error: result.data?.message || `HTTP ${result.status}`,
      });
    }

    const items = Array.isArray(result.data) ? result.data : result.data?.items || [];
    return res.json({
      ok: true,
      connected: true,
      mode: 'desktop',
      version: APP_VERSION,
      apiUrl: config.baseUrl,
      accountCount: items.length,
    });
  } catch (err) {
    return res.json({
      ok: false,
      connected: false,
      mode: 'offline',
      version: APP_VERSION,
      apiUrl: config.baseUrl,
      error: err?.cause?.code === 'ECONNREFUSED' ? 'Beeper Desktop API nicht erreichbar' : err.message,
    });
  }
});

// Beeper Account Login (Desktop API Token or Beeper Matrix Account)
app.post('/api/auth/login', async (req, res) => {
  const { mode = 'desktop', apiUrl, token, identifier, password } = req.body || {};

  if (mode === 'beeper') {
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Bitte Beeper-Handle/E-Mail und Passwort eingeben.' });
    }
    try {
      const userIdent = String(identifier).trim();
      const loginPayload = {
        type: 'm.login.password',
        identifier:
          userIdent.includes('@') && !userIdent.startsWith('@')
            ? { type: 'm.id.thirdparty', medium: 'email', address: userIdent }
            : { type: 'm.id.user', user: userIdent },
        password: String(password),
        initial_device_display_name: 'Beeper Web Beta v1.0 (iPad)',
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
        mode: 'matrix',
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
      mode: 'desktop',
      apiUrl: targetUrl,
      user: {
        id: primaryUser.id || 'beeper-desktop',
        fullName: primaryUser.fullName || 'Beeper Desktop',
        username: primaryUser.username || `${items.length} Netzwerke`,
        networkCount: items.length,
      },
    });
  } catch (err) {
    return res.status(502).json({
      error:
        err?.cause?.code === 'ECONNREFUSED'
          ? 'Beeper Desktop API nicht erreichbar (läuft Beeper Desktop / Tunnel?)'
          : err.message,
    });
  }
});

// List connected accounts
app.get('/api/accounts', async (req, res) => {
  const config = getBeeperConfig(req);
  if (config.matrixMode) {
    return res.json({
      items: [{ accountID: 'matrix.beeper.com', network: 'Beeper Matrix', statusText: 'Connected' }],
    });
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

  if (config.matrixMode) {
    try {
      const sync = await matrixFetch(config.token, '/_matrix/client/v3/sync?timeout=0');
      if (!sync.ok) return res.status(sync.status).json(sync.data);
      const joined = sync.data?.rooms?.join || {};
      let chats = Object.entries(joined).map(([roomId, room]) => {
        const stateEvents = room.state?.events || [];
        const timeline = room.timeline?.events || [];
        const nameEv = [...stateEvents, ...timeline].find((e) => e.type === 'm.room.name');
        const msgEv = [...timeline].reverse().find((e) => e.type === 'm.room.message' || e.type === 'm.room.encrypted');
        const previewText =
          msgEv?.type === 'm.room.encrypted'
            ? '🔒 Verschlüsselte Nachricht (Beeper Desktop API für Klartext)'
            : msgEv?.content?.body || 'Keine Nachrichten';
        const ts = msgEv?.origin_server_ts ? new Date(msgEv.origin_server_ts).toISOString() : new Date().toISOString();
        return {
          id: roomId,
          accountID: 'matrix.beeper.com',
          network: 'Beeper Matrix',
          title: nameEv?.content?.name || roomId,
          type: 'group',
          unreadCount: room.unread_notifications?.notification_count || 0,
          isArchived: false,
          lastActivity: ts,
          preview: { text: previewText, timestamp: ts },
        };
      });
      if (unreadOnly === 'true') chats = chats.filter((c) => c.unreadCount > 0);
      if (q) {
        const query = String(q).toLowerCase();
        chats = chats.filter((c) => c.title.toLowerCase().includes(query));
      }
      chats.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      return res.json({ items: chats, hasMore: false });
    } catch (err) {
      return handleProxyError(res, err);
    }
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
  try {
    const result = await beeperFetch(config, `/v1/chats/${encodeURIComponent(req.params.chatId)}`);
    res.status(result.status).json(result.data);
  } catch (err) {
    handleProxyError(res, err);
  }
});

// List messages in a chat
app.get('/api/chats/:chatId/messages', async (req, res) => {
  const config = getBeeperConfig(req);
  const { chatId } = req.params;

  if (config.matrixMode) {
    try {
      const selfId = req.headers['x-beeper-userid'] || '';
      const result = await matrixFetch(
        config.token,
        `/_matrix/client/v3/rooms/${encodeURIComponent(chatId)}/messages?dir=b&limit=50`
      );
      if (!result.ok) return res.status(result.status).json(result.data);
      const chunk = (result.data?.chunk || [])
        .filter((e) => e.type === 'm.room.message' || e.type === 'm.room.encrypted')
        .map((e) => ({
          id: e.event_id,
          chatID: chatId,
          senderID: e.sender,
          senderName: e.sender.replace(/^@/, '').split(':')[0],
          isSender: selfId ? e.sender === selfId : false,
          text:
            e.type === 'm.room.encrypted'
              ? '🔒 Verschlüsselte Nachricht (E2EE — für Klartext Beeper Desktop API + Tunnel nutzen)'
              : e.content?.body || '[Nachricht]',
          timestamp: new Date(e.origin_server_ts).toISOString(),
        }));
      return res.json({ items: chunk.reverse(), hasMore: false });
    } catch (err) {
      return handleProxyError(res, err);
    }
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
    return res.status(400).json({ error: 'Nachrichtentext fehlt' });
  }

  if (config.matrixMode) {
    try {
      const txnId = `m${Date.now()}`;
      const result = await matrixFetch(
        config.token,
        `/_matrix/client/v3/rooms/${encodeURIComponent(chatId)}/send/m.room.message/${txnId}`,
        { method: 'PUT', body: { msgtype: 'm.text', body: String(text).trim() } }
      );
      return res.status(result.status).json(result.data);
    } catch (err) {
      return handleProxyError(res, err);
    }
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

  if (config.matrixMode) {
    return res.json({ ok: true });
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

// Proxy encrypted mxc:// or local media assets from Beeper Desktop API
app.get('/api/assets', async (req, res) => {
  const config = getBeeperConfig(req);
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'Missing url query parameter' });

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

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
