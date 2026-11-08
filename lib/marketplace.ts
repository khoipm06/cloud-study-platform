import { validQuiz } from './rules';

export const STARTING_VND = 500_000;
const MAX_GRANT_VND = 100_000_000;
const PAGE_SIZE = 20;

// Courses sold before review existed stay readable to enrolled learners.
export const legacySaleReview = `(
  c.status='PUBLISHED' AND c.price_vnd>0
  AND EXISTS(SELECT 1 FROM members WHERE id=c.owner_id AND role<>'ADMIN')
  AND NOT EXISTS(SELECT 1 FROM course_review_events WHERE course_id=c.id AND kind='APPROVED')
)`;

function balanceSql(member: string) {
  return `(
    (SELECT coalesce(sum(amount_vnd), 0) FROM wallet_transactions WHERE to_user_id=${member})
    - (SELECT coalesce(sum(amount_vnd), 0) FROM wallet_transactions WHERE from_user_id=${member})
  )`;
}

export async function walletBalance(s: any, userId: string) {
  const row = await s.one(`SELECT ${balanceSql('m.id')} balance_vnd FROM members m WHERE m.id=?`, userId);
  return row?.balance_vnd ?? 0;
}

async function openWallet(s: any, userId: string) {
  if (!STARTING_VND) return;
  await s.run(`
    INSERT OR IGNORE INTO wallet_transactions(id,kind,to_user_id,amount_vnd,created_at)
    SELECT ?, 'WELCOME', id, ?, ? FROM members
    WHERE id=? AND blocked=0 AND NOT EXISTS(
      SELECT 1 FROM wallet_transactions WHERE to_user_id=? AND kind='WELCOME'
    )
  `, 'welcome:' + userId, STARTING_VND, s.now(), userId, userId);
}

export async function accountWalletBalance(s: any, userId: string) {
  await openWallet(s, userId);
  return walletBalance(s, userId);
}

const walletEvents = `
  SELECT 'wallet:' || w.id id,
    CASE WHEN w.kind='PURCHASE' THEN CASE WHEN w.from_user_id=me.id THEN 'PURCHASE' ELSE 'SALE' END
      ELSE w.kind END kind,
    w.created_at, w.course_id, c.title, w.reason detail,
    CASE WHEN w.from_user_id=me.id THEN -w.amount_vnd ELSE w.amount_vnd END amount_vnd, NULL score
  FROM wallet_transactions w CROSS JOIN me LEFT JOIN courses c ON c.id=w.course_id
  WHERE w.from_user_id=me.id OR w.to_user_id=me.id
`;

const learningEvents = `
  SELECT 'enroll:' || e.course_id, 'ENROLL', e.created_at, c.id, c.title, '', NULL, NULL
  FROM enrollments e JOIN courses c ON c.id=e.course_id CROSS JOIN me
  WHERE e.user_id=me.id AND NOT EXISTS(
    SELECT 1 FROM wallet_transactions w WHERE w.from_user_id=me.id AND w.course_id=c.id AND w.kind='PURCHASE'
  )
  UNION ALL
  SELECT 'lesson:' || x.lesson_id, 'COMPLETE', x.created_at, c.id, c.title, l.title, NULL, NULL
  FROM completions x JOIN lessons l ON l.id=x.lesson_id JOIN courses c ON c.id=l.course_id CROSS JOIN me
  WHERE x.user_id=me.id
  UNION ALL
  SELECT 'quiz:' || a.id, 'QUIZ', a.submitted_at, c.id, c.title, 'Quiz luyện tập', NULL, a.score
  FROM attempts a JOIN courses c ON c.id=a.course_id CROSS JOIN me
  WHERE a.user_id=me.id AND a.status='SUBMITTED'
  UNION ALL
  SELECT 'named:' || a.id, 'QUIZ', a.submitted_at, c.id, c.title, q.title, NULL, a.score
  FROM named_quiz_attempts a JOIN courses c ON c.id=a.course_id
    JOIN course_quizzes q ON q.id=a.quiz_id CROSS JOIN me
  WHERE a.user_id=me.id AND a.status='SUBMITTED'
  UNION ALL
  SELECT 'course:' || c.id, 'CREATED', c.created_at, c.id, c.title, '', NULL, NULL
  FROM courses c CROSS JOIN me WHERE c.owner_id=me.id
  UNION ALL
  SELECT 'review:' || e.id, e.kind, e.created_at, c.id, e.course_title, e.reason, NULL, NULL
  FROM course_review_events e CROSS JOIN me LEFT JOIN courses c ON c.id=e.course_id
  WHERE e.owner_id=me.id
`;

export async function marketplaceRead(s: any, req: Request, path: string[], u: any) {
  const section = path[0];
  if (!['wallet', 'activity', 'course-reviews'].includes(section)) return null;
  const params = new URL(req.url).searchParams;
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(params.get('page'))) || 1));
  const offset = (page - 1) * PAGE_SIZE;

  if (section === 'course-reviews') {
    if (u.role !== 'ADMIN') s.fail(403, 'Chỉ quản trị viên có quyền duyệt khóa học.');
    const rows = await s.all(`
      SELECT c.id, c.title, c.category, c.price_vnd, c.version, c.hidden, m.name author,
        ${legacySaleReview} sale_pending_review,
        (SELECT max(created_at) FROM course_review_events WHERE course_id=c.id AND kind='SUBMITTED') submitted_at
      FROM courses c JOIN members m ON m.id=c.owner_id
      WHERE c.status='PENDING_REVIEW' OR ${legacySaleReview}
      ORDER BY coalesce(submitted_at,c.created_at), c.id LIMIT ? OFFSET ?
    `, PAGE_SIZE + 1, offset);
    return s.json({ rows: rows.slice(0, PAGE_SIZE), page, has_next: rows.length > PAGE_SIZE });
  }

  const wallet = section === 'wallet'
    ? { balance_vnd: await accountWalletBalance(s, u.id), starting_vnd: STARTING_VND }
    : {};
  if (section === 'wallet' && params.get('summary') === '1') return s.json(wallet);
  const events = section === 'activity' ? walletEvents + ' UNION ALL ' + learningEvents : walletEvents;
  const rows = await s.all(`
    WITH me(id) AS (VALUES (?)), events AS (${events})
    SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
  `, u.id, PAGE_SIZE + 1, offset);
  return s.json({ rows: rows.slice(0, PAGE_SIZE), page, has_next: rows.length > PAGE_SIZE, ...wallet });
}

async function enrollFree(s: any, u: any, courseId: string) {
  await s.course(courseId);
  await s.run(`
    INSERT OR IGNORE INTO enrollments(user_id,course_id,created_at)
    SELECT m.id,c.id,? FROM courses c JOIN members m ON m.id=? AND m.blocked=0
    WHERE c.id=? AND c.status='PUBLISHED' AND c.hidden=0 AND c.price_vnd=0
  `, s.now(), u.id, courseId);
  if (await s.one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?', u.id, courseId)) return s.json({ ok: true });
  const current = await s.course(courseId);
  if (current.status !== 'PUBLISHED' || current.hidden) s.fail(403, 'Khóa học chưa mở ghi danh.');
  if (current.price_vnd > 0) s.fail(402, 'Khóa học này cần mua bằng số dư Ví VND.');
  return s.fail(409, 'Chưa thể ghi danh. Hãy tải lại khóa học.');
}

async function buyCourse(s: any, u: any, b: any) {
  const c = await s.course(s.str(b.course_id));
  await openWallet(s, u.id);
  const enrolled = () => s.one('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?', u.id, c.id);
  const answer = async () => s.json({ ok: true, balance_vnd: await walletBalance(s, u.id) });
  if (await enrolled()) return answer();
  if (c.status !== 'PUBLISHED' || c.hidden || c.sale_pending_review) s.fail(403, 'Khóa học chưa mở bán.');
  if (c.owner_id === u.id) s.fail(422, 'Bạn đã có quyền mở nội dung khóa học của mình.');
  if (c.price_vnd <= 0) s.fail(422, 'Khóa học này có thể ghi danh miễn phí.');
  s.checkVersion(c, b);

  const id = s.uid(), createdAt = s.now();
  const [transfer] = await s.db().batch([
    s.statement(`
      INSERT INTO wallet_transactions(id,kind,from_user_id,to_user_id,course_id,amount_vnd,created_at)
      SELECT ?, 'PURCHASE', buyer.id, c.owner_id, c.id, c.price_vnd, ?
      FROM courses c JOIN members buyer ON buyer.id=? AND buyer.blocked=0
      WHERE c.id=? AND c.version=? AND c.status='PUBLISHED' AND c.hidden=0
        AND c.price_vnd>0 AND c.owner_id<>buyer.id
        AND NOT ${legacySaleReview}
        AND NOT EXISTS(SELECT 1 FROM enrollments WHERE user_id=buyer.id AND course_id=c.id)
        AND ${balanceSql('buyer.id')}>=c.price_vnd
    `, id, createdAt, u.id, c.id, b.version),
    s.statement(`
      INSERT INTO enrollments(user_id,course_id,created_at)
      SELECT from_user_id,course_id,created_at FROM wallet_transactions WHERE id=?
    `, id),
    s.statement(`
      INSERT INTO audit(id,actor_id,action,resource,created_at,reason,request_id)
      SELECT 'wallet:' || id,from_user_id,'Mua khóa học bằng Ví VND',course_id,created_at,amount_vnd || ' VND',id
      FROM wallet_transactions WHERE id=?
    `, id),
  ]);
  if (transfer.meta.changes || await enrolled()) return answer();
  const current = await s.course(c.id);
  if (current.version !== c.version || current.status !== 'PUBLISHED' || current.hidden) {
    s.fail(409, 'Khóa học hoặc giá đã thay đổi. Hãy tải lại trước khi mua.');
  }
  if (await walletBalance(s, u.id) < c.price_vnd) s.fail(402, 'Số dư VND mô phỏng không đủ để mua khóa học này.');
  return s.fail(409, 'Chưa thể mua khóa học. Hãy tải lại và thử lại.');
}

async function grantVnd(s: any, u: any, b: any) {
  if (u.role !== 'ADMIN') s.fail(403, 'Chỉ quản trị viên có quyền cấp VND mô phỏng.');
  const target = s.str(b.user_id), reason = s.str(b.reason, 5, 500);
  const requestId = s.str(b.request_id, 36, 36);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId)) s.fail(422, 'Mã yêu cầu không hợp lệ.');
  const amount = b.amount_vnd;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_GRANT_VND) {
    s.fail(422, 'Nhập số nguyên từ 1 đến 100.000.000 VND.');
  }
  const id = `grant:${u.id}:${requestId}`;
  await s.db().batch([
    s.statement(`
      INSERT INTO wallet_transactions(id,kind,to_user_id,amount_vnd,actor_id,reason,created_at)
      SELECT ?, 'GRANT', recipient.id, ?, admin.id, ?, ?
      FROM members recipient JOIN members admin ON admin.id=? AND admin.role='ADMIN' AND admin.blocked=0
      WHERE recipient.id=? AND recipient.blocked=0
      ON CONFLICT(id) DO NOTHING
    `, id, amount, reason, s.now(), u.id, target),
    s.statement(`
      INSERT OR IGNORE INTO audit(id,actor_id,action,resource,created_at,reason,request_id)
      SELECT id,actor_id,'Cấp VND mô phỏng',to_user_id,created_at,amount_vnd || ' VND · ' || reason,?
      FROM wallet_transactions WHERE id=?
    `, requestId, id),
  ]);
  const entry = await s.one('SELECT to_user_id,amount_vnd,reason FROM wallet_transactions WHERE id=?', id);
  if (!entry) s.fail(404, 'Không tìm thấy tài khoản đang hoạt động để cấp VND.');
  if (entry.to_user_id !== target || entry.amount_vnd !== amount || entry.reason !== reason) {
    s.fail(409, 'Yêu cầu cấp VND đã được dùng với dữ liệu khác.');
  }
  return s.json({ ok: true, balance_vnd: await accountWalletBalance(s, target) });
}

const reviewActions = {
  SUBMITTED: 'Gửi duyệt khóa học',
  APPROVED: 'Duyệt và xuất bản khóa học',
  REJECTED: 'Từ chối khóa học',
  WITHDRAWN: 'Rút yêu cầu duyệt khóa học',
  ARCHIVED: 'Lưu trữ khóa học',
} as const;
type ReviewAction = keyof typeof reviewActions;

async function changeCourseStatus(s: any, u: any, c: any, action: ReviewAction, status: string, reason = '') {
  const publishing = action === 'SUBMITTED' || action === 'APPROVED';
  if (publishing) {
    if (c.hidden) s.fail(409, 'Khóa học đang bị ẩn. Hãy liên hệ quản trị viên.');
    if (!await s.one('SELECT 1 FROM categories WHERE name=? AND active=1', c.category)) {
      s.fail(422, 'Danh mục đã ngừng sử dụng.');
    }
    const required = await s.one('SELECT 1 FROM lessons WHERE course_id=? AND required=1 LIMIT 1', c.id);
    const quiz = validQuiz(JSON.parse(c.quiz)) || await s.one(`
      SELECT 1 FROM course_quizzes WHERE course_id=? AND status='PUBLISHED' AND json_array_length(questions)>0 LIMIT 1
    `, c.id);
    if (!required || !quiz) s.fail(422, 'Cần ít nhất một bài bắt buộc và một quiz hợp lệ trước khi gửi duyệt hoặc xuất bản.');
  }

  const id = s.uid(), createdAt = s.now();
  const [event] = await s.db().batch([
    s.statement(`
      INSERT INTO course_review_events(id,course_id,course_title,owner_id,actor_id,kind,reason,created_at)
      SELECT ?,c.id,c.title,c.owner_id,?, ?, ?, ? FROM courses c
      WHERE c.id=? AND c.version=? AND c.status=?
        AND (?=0 OR (
          c.hidden=0 AND EXISTS(SELECT 1 FROM categories WHERE name=c.category AND active=1)
          AND EXISTS(SELECT 1 FROM lessons WHERE course_id=c.id AND required=1)
          AND (json_array_length(c.quiz)>0 OR EXISTS(
            SELECT 1 FROM course_quizzes WHERE course_id=c.id AND status='PUBLISHED' AND json_array_length(questions)>0
          ))
        ))
    `, id, u.id, action, reason, createdAt, c.id, c.version, c.status, publishing ? 1 : 0),
    s.statement(`
      UPDATE courses SET status=?,version=version+1 WHERE id=?
        AND EXISTS(SELECT 1 FROM course_review_events WHERE id=? AND course_id=courses.id)
    `, status, c.id, id),
    s.statement(`
      INSERT INTO audit(id,actor_id,action,resource,created_at,reason,request_id)
      SELECT id,actor_id,?,course_id,created_at,reason,id FROM course_review_events WHERE id=?
    `, reviewActions[action], id),
  ]);
  if (!event.meta.changes) s.fail(409, 'Nội dung hoặc trạng thái đã thay đổi. Hãy tải lại khóa học.');
  return s.json({ ok: true, status, version: c.version + 1 });
}

export async function marketplaceWrite(s: any, path: string[], u: any, b: any) {
  if (path[0] === 'enroll') return enrollFree(s, u, s.str(b.course_id));
  if (path[0] === 'wallet-buy') return buyCourse(s, u, b);
  if (path[0] === 'wallet-grant') return grantVnd(s, u, b);
  if (path[0] === 'course-review') {
    if (u.role !== 'ADMIN') s.fail(403, 'Chỉ quản trị viên có quyền duyệt khóa học.');
    const c = await s.course(s.str(b.course_id));
    s.checkVersion(c, b);
    if (c.status !== 'PENDING_REVIEW' && !c.sale_pending_review) s.fail(409, 'Khóa học hiện không ở trạng thái chờ duyệt.');
    if (b.action === 'APPROVE') return changeCourseStatus(s, u, c, 'APPROVED', 'PUBLISHED');
    if (b.action === 'REJECT') return changeCourseStatus(s, u, c, 'REJECTED', c.sale_pending_review ? 'ARCHIVED' : 'DRAFT', s.str(b.reason, 5, 1000));
    return s.fail(422, 'Hãy chọn duyệt hoặc trả lại bản nháp.');
  }
  if (path[0] !== 'course-status') return null;

  const c = await s.course(s.str(b.course_id));
  if (!s.owns(u, c)) s.fail(403, 'Bạn không có quyền quản lý khóa học này.');
  s.checkVersion(c, b);
  if (c.status === 'DRAFT' && b.status === 'PENDING_REVIEW') {
    return changeCourseStatus(s, u, c, 'SUBMITTED', 'PENDING_REVIEW');
  }
  if (c.status === 'DRAFT' && b.status === 'PUBLISHED') {
    if (u.role !== 'ADMIN' || c.owner_id !== u.id) s.fail(403, 'Hãy gửi khóa học để quản trị viên duyệt trước khi xuất bản.');
    return changeCourseStatus(s, u, c, 'APPROVED', 'PUBLISHED');
  }
  if (c.status === 'PENDING_REVIEW' && b.status === 'DRAFT') {
    if (c.owner_id !== u.id) s.fail(403, 'Chỉ người tạo khóa học được rút yêu cầu duyệt.');
    return changeCourseStatus(s, u, c, 'WITHDRAWN', 'DRAFT');
  }
  if (c.status === 'PUBLISHED' && b.status === 'ARCHIVED') return changeCourseStatus(s, u, c, 'ARCHIVED', 'ARCHIVED');
  return s.fail(422, 'Chuyển trạng thái khóa học không hợp lệ.');
}
