'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { Dialog } from './dialog';
import { featureApi as api } from './features-client';

type User = { id: string; role: 'ADMIN' | 'LEARNER' };
type Course = {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  price_vnd: number;
  version: number;
  hidden: number;
  sale_pending_review?: boolean | number;
  can_manage?: boolean;
  quiz?: ReviewQuestion[];
  review?: { kind: string; reason: string };
};
type ReviewQuestion = { id: string; prompt: string; options: string[]; correct: number; explanation?: string };
type Page<T> = { rows: T[]; page: number; has_next: boolean };
type WalletSummary = { balance_vnd: number; starting_vnd: number };
type LogEvent = {
  id: string;
  kind: string;
  created_at: string;
  course_id: string | null;
  title: string | null;
  detail: string;
  amount_vnd: number | null;
  score: number | null;
};
type ReviewRow = Pick<Course, 'id' | 'title' | 'price_vnd' | 'hidden' | 'sale_pending_review'> & {
  category: string;
  author: string;
  submitted_at: string | null;
};

const number = new Intl.NumberFormat('vi-VN');
const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export const formatVnd = (amount: number) => number.format(amount) + ' ₫';
const courseStatusLabels: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING_REVIEW: 'Chờ duyệt', PUBLISHED: 'Đã xuất bản', ARCHIVED: 'Đã lưu trữ',
};
export function courseStatus(course: Pick<Course, 'status' | 'hidden' | 'sale_pending_review'>) {
  if (course.hidden) return 'Đang ẩn';
  if (course.sale_pending_review) return 'Chờ duyệt bán';
  return courseStatusLabels[course.status] ?? course.status;
}

function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Vui lòng thử lại.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, error, setError, run };
}

function useMarketData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setData(null);
    setError('');
    if (!path) return;
    let active = true;
    api(path).then(result => { if (active) setData(result); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [path, revision]);
  return { data, error, reload: () => setRevision(value => value + 1) };
}

function Pager({ page, hasNext, onChange }: { page: number; hasNext: boolean; onChange: (page: number) => void }) {
  if (page === 1 && !hasNext) return null;
  return <div className="pagination">
    <span>Trang {page}</span>
    <button className="btn secondary" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15}/> Trước</button>
    <button className="btn secondary" disabled={!hasNext} onClick={() => onChange(page + 1)}>Tiếp <ChevronRight size={15}/></button>
  </div>;
}

const logLabels: Record<string, string> = {
  WELCOME: 'VND khởi đầu', GRANT: 'Nhận VND từ quản trị viên',
  PURCHASE: 'Mua khóa học', SALE: 'Bán khóa học', ENROLL: 'Ghi danh',
  COMPLETE: 'Hoàn thành bài học', QUIZ: 'Nộp quiz', CREATED: 'Tạo khóa học',
  SUBMITTED: 'Gửi duyệt', APPROVED: 'Khóa học được duyệt', REJECTED: 'Khóa học bị trả lại',
  WITHDRAWN: 'Rút yêu cầu duyệt', ARCHIVED: 'Lưu trữ khóa học',
};

export function MarketLog({ mode, user }: { mode: 'wallet' | 'activity'; user: User | null }) {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useMarketData<Page<LogEvent> & Partial<WalletSummary>>(user ? mode + '?page=' + page : null);
  const wallet = mode === 'wallet';
  const title = wallet ? 'Ví VND mô phỏng' : 'Nhật ký hoạt động';
  const Icon = wallet ? Wallet : ClipboardList;
  if (!user) return <div className="blank">
    <Icon size={28}/><h3>{title}</h3><p>Đăng nhập để xem {wallet ? 'số dư và giao dịch' : 'hoạt động học tập và khóa học của bạn'}.</p>
    <a className="btn primary" href="#auth">Đăng nhập</a>
  </div>;
  return <>
    <div className="page-title-row">
      <div><div className="eyebrow">{wallet ? 'VÍ CỦA BẠN' : 'HÀNH TRÌNH CỦA BẠN'}</div><h1>{title}</h1>
        <p>{wallet ? 'Dùng VND mô phỏng để mua khóa học và nhận doanh thu từ khóa bạn tạo.' : 'Theo dõi các lượt học, ghi danh, giao dịch ví và quyết định duyệt khóa học.'}</p></div>
      <button className="btn secondary" onClick={reload}><RefreshCw size={15}/> Làm mới</button>
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    {wallet && data && <section className="panel wallet-summary">
      <div className="small-course-icon mint"><Wallet size={23}/></div>
      <div><p>Số dư khả dụng</p><strong>{formatVnd(data.balance_vnd ?? 0)}</strong>
        <p>{data.starting_vnd ? `Mỗi tài khoản nhận ${formatVnd(data.starting_vnd)} khi mở ví lần đầu. ` : ''}Quản trị viên có thể cấp thêm VND mô phỏng.</p></div>
    </section>}
    <section className="panel section">
      <div className="panel-heading"><h2>{wallet ? 'Giao dịch trong ví' : 'Hoạt động gần đây'}</h2></div>
      {!data && !error && <p className="advanced-pad muted" role="status">Đang tải…</p>}
      {data && (data.rows.length ? <ul className="market-log">
        {data.rows.map(row => <li key={row.id}>
          <div>
            <strong>{logLabels[row.kind] ?? row.kind}</strong>
            {row.title && <p>{row.course_id
              ? <a className="text-btn" href={'#course/' + row.course_id}>{row.title} <ArrowUpRight size={13}/></a>
              : row.title}</p>}
            {row.detail && <p>{row.detail}</p>}
          </div>
          <div className="market-log-meta">
            {row.amount_vnd !== null && <strong className={row.amount_vnd > 0 ? 'wallet-in' : 'wallet-out'}>
              {row.amount_vnd > 0 ? '+' : '−'}{formatVnd(Math.abs(row.amount_vnd))}
            </strong>}
            {row.score !== null && <strong>{row.score}/100</strong>}
            <time dateTime={row.created_at}>{date.format(new Date(row.created_at))}</time>
          </div>
        </li>)}
      </ul> : <p className="advanced-pad muted">Chưa có {wallet ? 'giao dịch' : 'hoạt động'} trên trang này.</p>)}
      {data && <Pager page={page} hasNext={data.has_next} onChange={setPage}/>}
    </section>
  </>;
}

export function CourseEnrollment({ course, user, onEnrolled }: {
  course: Course; user: User | null; onEnrolled: (paid: boolean) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const { busy, error, setError, run } = useAction();
  const { data: wallet, error: walletError, reload } = useMarketData<WalletSummary>(confirm ? 'wallet?summary=1' : null);
  const paid = course.price_vnd > 0;
  if (course.status !== 'PUBLISHED' || course.hidden || course.sale_pending_review || (paid && user?.id === course.owner_id)) return null;

  const enroll = () => run(async () => {
    if (paid) await api('wallet-buy', { course_id: course.id, version: course.version });
    else await api('enroll', { course_id: course.id });
    setConfirm(false);
    await onEnrolled(paid);
  });
  const close = () => { if (!busy) { setConfirm(false); setError(''); } };
  const enough = !!wallet && wallet.balance_vnd >= course.price_vnd;
  return <div>
    {!confirm && error && <p className="alert" role="alert">{error}</p>}
    <button className="btn primary" disabled={busy} onClick={() => {
      if (!user) { window.location.hash = 'auth'; return; }
      if (paid) { reload(); setConfirm(true); }
      else void enroll();
    }}>{paid ? <><Wallet size={17}/> Mua khóa học</> : <><Check size={17}/> Ghi danh miễn phí</>}</button>
    {confirm && <Dialog title="Mua bằng Ví VND mô phỏng" onClose={close}>
      <p>Ghi danh khóa <strong>{course.title}</strong></p>
      <dl className="wallet-confirm">
        <div><dt>Giá khóa học</dt><dd>{formatVnd(course.price_vnd)}</dd></div>
        <div><dt>Số dư hiện tại</dt><dd>{wallet ? formatVnd(wallet.balance_vnd) : '—'}</dd></div>
        {enough && <div><dt>Số dư sau khi mua</dt><dd>{formatVnd(wallet.balance_vnd - course.price_vnd)}</dd></div>}
      </dl>
      {!wallet && !walletError && <p className="muted" role="status">Đang kiểm tra số dư…</p>}
      {(walletError || error || (wallet && !enough)) && <p className="alert" role="alert">
        {walletError || error || 'Số dư chưa đủ. Bạn có thể nhờ quản trị viên cấp thêm VND mô phỏng.'}
      </p>}
      <div className="modal-actions">
        {walletError && <button className="btn secondary" onClick={reload}>Tải lại số dư</button>}
        <button className="btn secondary" disabled={busy} onClick={close}>Hủy</button>
        <button className="btn primary" disabled={busy || !enough} onClick={enroll}>{busy ? 'Đang ghi danh…' : 'Xác nhận mua'}</button>
      </div>
    </Dialog>}
  </div>;
}

export function CoursePrice({ course, onChanged }: { course: Course; onChanged: () => Promise<unknown> }) {
  const { busy, error, run } = useAction();
  return <section className="panel section">
    <div className="panel-heading"><div><h2><Wallet size={18}/> Giá khóa học</h2>
      <p className="form-help">Đặt giá 0 cho khóa miễn phí. Với khóa trả phí, ví người tạo nhận toàn bộ giá khóa học sau mỗi lượt mua.</p></div></div>
    <form className="advanced-pad" onSubmit={event => {
      event.preventDefault();
      const amount = Number(new FormData(event.currentTarget).get('price_vnd'));
      void run(async () => {
        await api('course-price', { course_id: course.id, version: course.version, price_vnd: amount });
        await onChanged();
      });
    }}>
      {error && <div className="alert" role="alert">{error}</div>}
      <label>Giá VND mô phỏng<input key={course.version} name="price_vnd" type="number" min={0} max={100000000} step={1} defaultValue={course.price_vnd} required/></label>
      <p className="form-help">Giá trả phí từ 10.000 ₫ đến 100.000.000 ₫.</p>
      <button className="btn secondary" disabled={busy}>Lưu giá</button>
    </form>
  </section>;
}

export function WalletGrantDialog({ member, onClose, onGranted }: {
  member: { id: string; name: string }; onClose: () => void; onGranted: (message: string) => void;
}) {
  const { busy, error, run } = useAction();
  const [requestId] = useState(() => crypto.randomUUID());
  const close = () => { if (!busy) onClose(); };
  return <Dialog title="Cấp VND mô phỏng" onClose={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get('amount'));
      void run(async () => {
        await api('wallet-grant', { user_id: member.id, amount_vnd: amount, reason: form.get('reason'), request_id: requestId });
        onGranted(`Đã cấp ${formatVnd(amount)} cho ${member.name}.`);
      });
    }}>
      <p>Người nhận <strong>{member.name}</strong></p>
      {error && <p className="alert" role="alert">{error}</p>}
      <label>Số VND mô phỏng<input type="number" name="amount" min={1} max={100000000} step={1} required/></label>
      <label>Lý do cấp VND<textarea name="reason" minLength={5} maxLength={500} required/></label>
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={close}>Hủy</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Đang cấp…' : 'Xác nhận cấp'}</button>
      </div>
    </form>
  </Dialog>;
}

export function ReviewQueue() {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useMarketData<Page<ReviewRow>>('course-reviews?page=' + page);
  return <section className="panel section">
    <div className="panel-heading"><div><h2><ShieldCheck size={19}/> Khóa học chờ duyệt</h2>
      <p className="form-help">Mở khóa học để xem bài học, học liệu và quiz trước khi duyệt.</p></div>
      <button className="btn secondary" onClick={reload}><RefreshCw size={15}/> Làm mới</button>
    </div>
    {error && <div className="advanced-pad"><p className="alert" role="alert">{error}</p></div>}
    {!data && !error && <p className="advanced-pad muted" role="status">Đang tải hàng chờ…</p>}
    {data && (data.rows.length ? <ul className="market-log">
      {data.rows.map(row => <li key={row.id}><div><strong>{row.title}</strong>
        <p>{row.author} · {row.category} · {row.price_vnd > 0 ? formatVnd(row.price_vnd) + ' mô phỏng' : 'Miễn phí'}</p>
        <p>{row.submitted_at ? date.format(new Date(row.submitted_at)) : 'Khóa đã đăng trước đây'}{row.hidden ? ' · Đang ẩn' : ''}</p>
      </div><a className="btn secondary" href={'#course/' + row.id}>Xem để duyệt <ArrowUpRight size={15}/></a></li>)}
    </ul> : <p className="advanced-pad muted">Chưa có khóa học chờ duyệt trên trang này.</p>)}
    {data && <Pager page={page} hasNext={data.has_next} onChange={setPage}/>}
  </section>;
}

export function QuizPreview({ questions }: { questions: ReviewQuestion[] }) {
  if (!questions.length) return <p className="muted">Quiz chưa có câu hỏi.</p>;
  return <ol className="market-quiz-preview">{questions.map(question => <li key={question.id}>
    <strong>{question.prompt}</strong>
    <ul>{question.options.map((option, index) => <li key={index}>{index === question.correct ? <b>{option} ✓</b> : option}</li>)}</ul>
    {question.explanation && <p>{question.explanation}</p>}
  </li>)}</ol>;
}

export function CourseReviewPanel({ course, user, onChanged }: {
  course: Course; user: User | null; onChanged: (message: string) => Promise<void>;
}) {
  const { busy, error, setError, run } = useAction();
  const [reject, setReject] = useState(false);
  if (!user || !course.can_manage) return null;
  const pending = course.status === 'PENDING_REVIEW' || !!course.sale_pending_review;
  const rejected = course.review?.kind === 'REJECTED';
  if (!pending && !rejected) return null;
  const reviewer = user.role === 'ADMIN';
  const legacy = !!course.sale_pending_review;
  const decide = (action: 'APPROVE' | 'REJECT', reason?: FormDataEntryValue | null) => run(async () => {
    await api('course-review', { course_id: course.id, version: course.version, action, reason });
    setReject(false);
    await onChanged(action === 'APPROVE' ? 'Đã duyệt và xuất bản khóa học.' : legacy ? 'Đã dừng bán khóa học.' : 'Đã trả khóa học về bản nháp.');
  });
  const close = () => { if (!busy) { setReject(false); setError(''); } };
  return <section className="panel market-review">
    <div className="market-review-heading">
      <ShieldCheck size={21}/><h2>{pending ? (legacy ? 'Chờ duyệt để mở bán' : 'Khóa học đang chờ duyệt') : 'Phản hồi từ quản trị viên'}</h2>
    </div>
    {rejected && <p className="review-reason">{course.review?.reason}</p>}
    {pending && reviewer && <div className="button-row">
      <button className="btn primary" disabled={busy || !!course.hidden} onClick={() => decide('APPROVE')}>Duyệt và xuất bản</button>
      <button className="btn secondary" disabled={busy} onClick={() => { setError(''); setReject(true); }}>{legacy ? 'Dừng bán' : 'Trả lại để sửa'}</button>
    </div>}
    {course.status === 'PENDING_REVIEW' && course.owner_id === user.id && <button className="text-btn" disabled={busy} onClick={() => run(async () => {
      await api('course-status', { course_id: course.id, version: course.version, status: 'DRAFT' });
      await onChanged('Đã rút yêu cầu. Bạn có thể tiếp tục sửa bản nháp.');
    })}>Rút yêu cầu duyệt</button>}
    {pending && course.quiz && course.quiz.length > 0 && <details className="market-quiz-details">
      <summary>Xem quiz luyện tập · {course.quiz.length} câu</summary><QuizPreview questions={course.quiz}/>
    </details>}
    {!reject && error && <p className="alert" role="alert">{error}</p>}
    {reject && <Dialog title={legacy ? 'Dừng bán khóa học' : 'Trả lại bản nháp'} onClose={close}>
      {error && <p className="alert" role="alert">{error}</p>}
      <form onSubmit={event => {
        event.preventDefault();
        void decide('REJECT', new FormData(event.currentTarget).get('reason'));
      }}>
        <label>Lý do gửi người tạo<textarea name="reason" minLength={5} maxLength={1000} required/></label>
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={close}>Hủy</button>
          <button className="btn primary" disabled={busy}>Xác nhận</button>
        </div>
      </form>
    </Dialog>}
  </section>;
}
