/**
 * Cloudflare Pages Function: проксирует /api/* на backend.
 *
 * Настройка в Cloudflare Pages → Settings → Environment variables:
 *   BACKEND_URL = https://<ваш-backend>
 *
 * Frontend при этом использует относительный /api и не зависит от CORS
 * и от того, какой именно backend-домен сейчас активен.
 */
export async function onRequest(context) {
  const { request, env } = context;
  // Задайте BACKEND_URL в Cloudflare Pages:
  // Settings → Environment variables → BACKEND_URL = https://<backend>
  const backendUrl = env.BACKEND_URL;

  if (!backendUrl) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'В Cloudflare Pages не задан BACKEND_URL. Задеплойте backend на Render и укажите его URL.',
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, backendUrl);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  // localtunnel иначе отдаёт 511 вместо API; на Render заголовок игнорируется.
  headers.set('bypass-tunnel-reminder', 'true');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  try {
    const response = await fetch(target.toString(), init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', responseHeaders.get('Cache-Control') ?? 'no-store');
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'BAD_GATEWAY',
          message: `Backend недоступен: ${String(error)}`,
        },
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
}
