const base = process.argv[2];
if (!base || !process.env.API_KEY) throw new Error("Usage: node --env-file=.dev.vars scripts/check-preview-security.mjs <preview-url>");
const link = "https://x.com/NASA/status/2040059770237849635";
const url = new URL("/api/v1/parse", base);
url.searchParams.set("link", link);
const get = headers => fetch(url, { headers });
const unauthorized = await get({});
const first = await get({ authorization: `Bearer ${process.env.API_KEY}` });
const second = await get({ authorization: `Bearer ${process.env.API_KEY}` });
const post = async token => {
  const response = await fetch(new URL("/api/v1/parse", base), {
    method: "POST",
    headers: { origin: new URL(base).origin, "content-type": "application/json", "x-client-type": "web" },
    body: JSON.stringify({ link, turnstileToken: token }),
  });
  const body = await response.json();
  return { status: response.status, code: body.error?.code };
};
const missingToken = await post("");
const validToken = await post("XXXX.DUMMY.TOKEN.XXXX");
const forged = await fetch(new URL("/api/v1/resource/forged", base), { method: "HEAD" });
const invalidUrl = new URL("/api/v1/parse?page=2&link=invalid", base);
const limited = [];
for (let i = 0; i < 80; i++) limited.push((await fetch(invalidUrl)).status);
console.log(JSON.stringify({ unauthorized: unauthorized.status, first: { status: first.status, cache: first.headers.get("x-cache-status") }, second: { status: second.status, cache: second.headers.get("x-cache-status") }, missingToken, validToken, forged: forged.status, rateLimit: Object.fromEntries([...new Set(limited)].map(status => [status, limited.filter(value => value === status).length])) }));
