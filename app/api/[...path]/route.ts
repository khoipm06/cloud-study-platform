import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

const json = (v: any, s = 200) => Response.json(v, { status: s, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  const path = new URL(req.url).pathname.replace(/^\/api\//, '').split('/');
  if (path[0] === 'health') return json({ ok: true });
  return json({ error: 'Đường dẫn không tồn tại.' }, 404);
}

export async function POST(req: Request) {
  return json({ error: 'Đường dẫn không tồn tại.' }, 404);
}
