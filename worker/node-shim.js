// The analytics handlers (server/analytics) are written against Node's req/res so they can run on a plain Node server,
// as Vercel functions, and here. This adapts a Workers Request into that shape and the result back into a Response.

export async function runNodeHandler(request, handler) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body: hasBody ? (await request.text()) : undefined, // a string: readJson() parses it (and enforces its size limit)
    socket: { remoteAddress: headers['cf-connecting-ip'] || 'unknown' },
  };

  let status = 200, outHeaders = {}, payload = null;
  const res = {
    headersSent: false,
    writeHead(code, h = {}) { status = code; outHeaders = { ...outHeaders, ...h }; this.headersSent = true; },
    end(data) { payload = data ?? null; },
  };
  await handler(req, res);

  const nullBody = status === 204 || status === 304 || request.method === 'HEAD';
  return new Response(nullBody ? null : payload, { status, headers: outHeaders });
}
