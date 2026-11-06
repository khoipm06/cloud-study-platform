import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { seedCourses } from '../../../lib/seed';

export const dynamic = 'force-dynamic';
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

class Failure extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(s: number, m: string): never { throw new Failure(s, m); }
const json = (v: any, s = 200) => Response.json(v, { status: s, headers: { 'Cache-Control': 'no-store' } });

function db() { if (!env.DB) fail(503, 'Cơ sở dữ liệu chưa sẵn sàng.'); return env.DB!; }
function statement(sql: string, ...args: any[]) { return db().prepare(sql).bind(...args); }
async function one(sql: string, ...args: any[]) { return statement(sql, ...args).first<any>(); }
async function all(sql: string, ...args: any[]) { return (await statement(sql, ...args).all<any>()).results; }
async function run(sql: string, ...args: any[]) { return statement(sql, ...args).run(); }
function str(v: any, min = 1, max = 150) { if (typeof v !== 'string' || v.trim().length < min || v.length > max) fail(422, `Nội dung cần từ ${min} đến ${max} ký tự.`); return v.trim(); }
const owns = (u: any, c: any) => u.id === c.owner_id || u.role === 'ADMIN';

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

async function course(id: string) {
  const c = await one('SELECT * FROM courses WHERE id=?', id);
  if (!c) fail(404, 'Không tìm thấy khóa học.');
  return c;
}

function checkVersion(row: any, b: any) {
  if (b.version !== undefined && Number(b.version) !== row.version) fail(409, 'Dữ liệu đã được chỉnh sửa ở phiên khác. Vui lòng tải lại trang.');
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
      const courses = await all(`SELECT c.*, m.name as instructor,
        (SELECT count(*) FROM lessons WHERE course_id=c.id) as lesson_count,
        0 as enrolled, 0 as completed
        FROM courses c JOIN members m ON m.id=c.owner_id
        WHERE (c.status='PUBLISHED' AND c.hidden=0) OR c.owner_id=? OR ?='ADMIN'
        ORDER BY c.created_at,c.id`, u.id, u.role);
      return json({ user: u, courses, notes: [], history: [], activity: [] });
    }

    if (read && path[0] === 'courses' && path[1]) {
      const c = await course(path[1]);
      const ls = await all('SELECT * FROM lessons WHERE course_id=? ORDER BY position', c.id);
      return json({ ...c, can_edit: owns(u, c), lessons: ls.map(l => ({ ...l, completed: false })) });
    }

    if (path[0] === 'course-save') {
      if (u.role === 'LEARNER') fail(403, 'Chỉ giảng viên hoặc quản trị viên có thể tạo khóa học.');
      const b = await req.json() as any;
      const title = str(b.title, 3, 120), description = str(b.description, 10, 1000);
      if (b.id) {
        const c = await course(b.id);
        if (!owns(u, c)) fail(403, 'Không có quyền sửa.');
        checkVersion(c, b);
        await run('UPDATE courses SET title=?, description=?, category=?, level=?, version=version+1 WHERE id=?', title, description, b.category, b.level, c.id);
        return json({ id: c.id });
      }
      const id = uid();
      await run('INSERT INTO courses(id,owner_id,title,description,category,level,color,created_at) VALUES(?,?,?,?,?,?,?,?)', id, u.id, title, description, b.category || 'Công nghệ', b.level || 'Nhập môn', 'mint', now());
      return json({ id }, 201);
    }

    if (path[0] === 'lesson-save') {
      const b = await req.json() as any;
      const c = await course(str(b.course_id));
      if (!owns(u, c)) fail(403, 'Không có quyền sửa.');
      const title = str(b.title, 3, 150), content = str(b.content, 20, 30000);
      const minutes = Number(b.minutes) || 10;
      if (b.id) {
        await run('UPDATE lessons SET title=?, content=?, minutes=?, version=version+1 WHERE id=?', title, content, minutes, b.id);
        return json({ id: b.id });
      }
      const id = uid();
      await run("INSERT INTO lessons(id,course_id,title,content,position,minutes) SELECT ?,?,?,?,coalesce((SELECT max(position) FROM lessons WHERE course_id=?),0)+1,?", id, c.id, title, content, c.id, minutes);
      return json({ id }, 201);
    }

    if (path[0] === 'course-status') {
      const b = await req.json() as any;
      const c = await course(str(b.course_id));
      if (!owns(u, c)) fail(403, 'Không có quyền sửa.');
      await run('UPDATE courses SET status=?, version=version+1 WHERE id=?', b.status, c.id);
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
