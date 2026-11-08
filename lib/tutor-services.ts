import {searchCourseMaterials} from './advanced-services';

async function ownThread(s: any, u: any, id: any, requireAccess = true) {
  const thread = await s.one('SELECT * FROM tutor_threads WHERE id=? AND user_id=?', s.str(id), u.id);
  if (!thread) s.fail(404, 'Không tìm thấy cuộc trò chuyện của bạn.');
  if (requireAccess) await s.access(u, await s.course(thread.course_id));
  return thread;
}
async function threadView(s: any, thread: any) {
  const rows = await s.all('SELECT * FROM (SELECT * FROM tutor_messages WHERE thread_id=? ORDER BY created_at DESC,id DESC LIMIT 40) ORDER BY created_at,id', thread.id);
  const validLessons = new Set((await s.all('SELECT id FROM lessons WHERE course_id=?', thread.course_id)).map((x: any) => x.id));
  return { thread, ai_configured: false, mode: 'EXTRACTIVE_SEARCH',
    messages: rows.map((m: any) => ({ ...m, citations: JSON.parse(m.citations).filter((c: any) => validLessons.has(c.lesson_id)) })),
    total: (await s.one('SELECT count(*) n FROM tutor_messages WHERE thread_id=?', thread.id)).n };
}
export async function tutorRead(s: any, req: Request, path: string[], u: any) {
  if (path[0] === 'tutor-threads') {
    const id = s.str(new URL(req.url).searchParams.get('course_id'));
    await s.access(u, await s.course(id));
    return s.json({ ai_configured: false, mode: 'EXTRACTIVE_SEARCH', threads: await s.all(
      'SELECT * FROM tutor_threads WHERE user_id=? AND course_id=? ORDER BY updated_at DESC,id LIMIT 30', u.id, id) });
  }
  if (path[0] === 'tutor-thread') return s.json(await threadView(s, await ownThread(s, u, path[1])));
  return null;
}
export async function tutorWrite(s: any, path: string[], u: any, b: any) {
  if (path[0] === 'tutor-create') {
    const c = await s.course(s.str(b.course_id)); await s.access(u, c);
    const id = s.uid(), title = s.str(b.title || 'Cuộc trò chuyện mới', 1, 100);
    const r = await s.run(`INSERT INTO tutor_threads(id,user_id,course_id,title,created_at,updated_at)
      SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM tutor_threads WHERE user_id=? AND course_id=?)<30`, id, u.id, c.id, title, s.now(), s.now(), u.id, c.id);
    if (!r.meta.changes) s.fail(422, 'Tối đa 30 cuộc trò chuyện mỗi khóa. Hãy xóa cuộc cũ trước khi tạo thêm.');
    return s.json(await threadView(s, await ownThread(s, u, id)), 201);
  }
  if (!['tutor-message', 'tutor-delete'].includes(path[0])) return null;
  const thread = await ownThread(s, u, b.thread_id, path[0] !== 'tutor-delete');
  if (path[0] === 'tutor-delete') {
    s.checkVersion(thread, b);
    const r = await s.run('DELETE FROM tutor_threads WHERE id=? AND user_id=? AND version=?', thread.id, u.id, b.version);
    if (!r.meta.changes) s.fail(409, 'Cuộc trò chuyện vừa thay đổi. Hãy tải lại.');
    return s.json({ ok: true });
  }
  const requestId = s.str(b.request_id, 8, 80), question = s.str(b.question, 2, 2000);
  if (!/^[a-zA-Z0-9_-]+$/.test(requestId)) s.fail(422, 'Mã yêu cầu không hợp lệ.');
  const previous = await s.one('SELECT question FROM tutor_messages WHERE thread_id=? AND request_id=?', thread.id, requestId);
  if (previous) {
    if (previous.question !== question) s.fail(409, 'Mã yêu cầu đã được dùng cho câu hỏi khác.');
    return s.json(await threadView(s, thread));
  }
  s.checkVersion(thread, b);
  let query = question;
  const normalized = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().replace(/[?.!]+$/g, '').trim();
  if (/^(giai thich them|noi ro hon|vi du|cho vi du|tiep tuc)$/.test(normalized)) {
    const last = await s.one('SELECT question FROM tutor_messages WHERE thread_id=? ORDER BY created_at DESC,id DESC LIMIT 1', thread.id);
    if (last) query = last.question;
  }
  const found = await searchCourseMaterials(s, u, thread.course_id, query);
  const citations = found.results.slice(0, 3);
  const answer = citations.length
    ? 'Mình tìm thấy các trích đoạn sau trong bài đọc của khóa học. Bạn có thể mở nguồn để đọc đầy đủ.'
    : 'Chưa tìm thấy trích đoạn phù hợp trong bài đọc của khóa này. Hãy thử tên khái niệm hoặc từ khóa cụ thể hơn.';
  const id = s.uid(), timestamp = s.now();
  const r = await s.db().batch([
    s.statement(`INSERT INTO tutor_messages(id,thread_id,request_id,question,answer,citations,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tutor_threads WHERE id=? AND user_id=? AND version=?)
      AND (SELECT count(*) FROM tutor_messages WHERE thread_id=?)<100
      AND (SELECT count(*) FROM tutor_messages m JOIN tutor_threads t ON t.id=m.thread_id WHERE t.user_id=? AND m.created_at>?)<60`,
      id, thread.id, requestId, question, answer, JSON.stringify(citations), timestamp, thread.id, u.id, b.version,
      thread.id, u.id, new Date(Date.now() - 3600000).toISOString()),
    s.statement(`UPDATE tutor_threads SET title=CASE WHEN title='Cuộc trò chuyện mới' THEN ? ELSE title END,version=version+1,updated_at=?
      WHERE id=? AND user_id=? AND version=? AND EXISTS(SELECT 1 FROM tutor_messages WHERE id=?)`, question.slice(0, 100), timestamp, thread.id, u.id, b.version, id)
  ]);
  if (!r[0].meta.changes) s.fail(409, 'Cuộc trò chuyện vừa thay đổi hoặc đã đạt giới hạn 100 lượt/cuộc, 60 lượt/giờ. Hãy tải lại.');
  return s.json(await threadView(s, await ownThread(s, u, thread.id)), 201);
}
