import { createHmac } from 'node:crypto';

const TOKEN = '8810873662:AAGm5e5if3A9oxIKZdwz9vuZH_ziPQnjGb8';
const BASE = 'https://naparudatetgwebapp.pages.dev';

function initDataFor(userId, name) {
  const entries = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AAHdF6IQAAAAAN0Xoha'],
    ['user', JSON.stringify({ id: userId, first_name: name })],
  ];
  const dcs = entries.slice().sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') + `&hash=${hash}`;
}

async function call(userId, name, force = false) {
  const res = await fetch(BASE + '/api/session', {
    method: 'POST',
    headers: {
      'X-Telegram-Init-Data': initDataFor(userId, name),
      'Content-Type': 'application/json',
      ...(force ? { 'X-Channel-Check': 'force' } : {}),
    },
    body: '{}',
  });
  const body = await res.json();
  console.log(userId, force ? 'force' : 'normal', '->', res.status, JSON.stringify(body).slice(0, 250));
  return { status: res.status, body };
}

await call(999000009, 'NotSubscribed');
await call(999000009, 'NotSubscribed', true);
await call(8810873662, 'BotAdmin');
