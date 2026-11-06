import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';
const now = () => new Date().toISOString();

class Failure extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(s: number, m: string): never { throw new Failure(s, m); }
const json = (v: any, s = 200) => Response.json(v, { status: s, headers: { 'Cache-Control': 'no-store' } });

function db() { if (!env.DB) fail(503, 'Cơ sở dữ liệu chưa sẵn sàng.'); return env.DB!; }
function statement(sql: string, ...args: any[]) { return db().prepare(sql).bind(...args); }
async function one(sql: string, ...args: any[]) { return statement(sql, ...args).first<any>(); }
async function run(sql: string, ...args: any[]) { return statement(sql, ...args).run(); }
function str(v: any, min = 1, max = 150) { if (typeof v !== 'string' || v.trim().length < min || v.length > max) fail(422, `Nội dung cần từ ${min} đến ${max} ký tự.`); return v.trim(); }

async function identity() {
  const i = await getChatGPTUser(); if (!i) fail(401, 'Đăng nhập để lưu hành trình học của bạn.');
  let u = await one('SELECT * FROM members WHERE id=?', i.userId);
  if (!u) {
    const count = await one('SELECT count(*) n FROM members');
    const role = count.n === 0 ? 'ADMIN' : 'LEARNER';
    await run('INSERT INTO members VALUES(?,?,?,?,?,?,?)', i.userId, i.displayName || 'Người học mới', i.email || 'learner@example.com', role, 0, 5, now());
    u = await one('SELECT * FROM members WHERE id=?', i.userId);
  }
  if (u && u.blocked) fail(403, 'Tài khoản của bạn tạm thời bị khóa.');
  return u;
}

async function handler(req: Request) {
  try {
    const path = new URL(req.url).pathname.replace(/^\/api\//, '').split('/');
    if (path[0] === 'health') return json({ ok: true });
    const read = req.method === 'GET';
    if (!read) {
      if (req.headers.get('x-mo-hoc') !== '1') fail(403, 'Thiếu xác nhận nguồn yêu cầu.');
      const origin = req.headers.get('origin');
      if (origin && origin !== new URL(req.url).origin) fail(403, 'Nguồn yêu cầu không hợp lệ.');
    }
    const u = await identity();

    if (read && path[0] === 'state') {
      return json({ user: u, courses: [], notes: [], history: [], activity: [] });
    }

    if (path[0] === 'profile') {
      const b = await req.json() as any;
      const name = str(b.name, 2, 80);
      const goal = Math.min(60, Math.max(1, Number(b.goal) || 5));
      await run('UPDATE members SET name=?, goal=? WHERE id=?', name, goal, u.id);
      return json({ ok: true });
    }

    fail(404, 'Đường dẫn không tồn tại.');
  } catch (e) {
    if (e instanceof Failure) return json({ error: e.message }, e.status);
    console.error('API request failed', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'Chưa thể hoàn tất. Vui lòng thử lại sau.' }, 500);
  }
}

export const GET = handler;
export const POST = handler;
