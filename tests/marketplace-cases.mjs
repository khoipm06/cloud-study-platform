import assert from 'node:assert/strict';

export async function runMarketplaceChecks({ request, ok, database, owner }) {
  const member = (id, name) => ({ userId: id, displayName: name, email: id + '@example.test' });
  const seller = member('market-seller', 'Người tạo khóa học');
  const buyer = member('market-buyer', 'Người mua khóa học');
  const newcomer = member('market-newcomer', 'Người học khóa cũ');
  const row = id => database.prepare('SELECT * FROM courses WHERE id=?').get(id);
  const payload = id => ({ course_id: id, version: row(id).version });
  const transfers = id => database.prepare("SELECT * FROM wallet_transactions WHERE course_id=? AND kind='PURCHASE'").all(id);
  const enrolled = (user, id) => database.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?').get(user.userId, id);
  const status = (user, id, status) => request(user, 'course-status', { ...payload(id), status });
  const review = (id, action, reason) => request(owner, 'course-review', { ...payload(id), action, reason });
  const wallet = async user => (await request(user, 'wallet?summary=1')).data.balance_vnd;
  const buy = (user, id) => request(user, 'wallet-buy', payload(id));

  const opening = ok('regular seller receives one starting balance', await request(seller, 'state'));
  assert.equal(opening.user.role, 'LEARNER');
  assert.equal(opening.wallet_balance, 500_000);
  const initialBuyer = ok('regular buyer receives a starting balance', await request(buyer, 'state')).wallet_balance;
  ok('initialize legacy learner', await request(newcomer, 'state'));
  database.prepare("UPDATE members SET role='INSTRUCTOR' WHERE id=?").run(seller.userId);
  assert.equal(ok('legacy instructor signs in as regular user', await request(seller, 'state')).user.role, 'LEARNER');
  assert.equal(database.prepare('SELECT role FROM members WHERE id=?').get(seller.userId).role, 'LEARNER');
  await Promise.all([wallet(seller), wallet(seller)]);
  assert.equal(database.prepare("SELECT count(*) n FROM wallet_transactions WHERE to_user_id=? AND kind='WELCOME'").get(seller.userId).n, 1);

  async function draft(title, price) {
    const course = ok('regular account creates draft ' + title, await request(seller, 'course-save', {
      title, description: 'Nội dung khóa học dùng để kiểm thử ghi danh và kiểm duyệt.', category: 'Công nghệ', level: 'Nhập môn',
    }), 201);
    const lesson = ok('creator adds a required lesson', await request(seller, 'lesson-save', {
      course_id: course.id, title: 'Bài học bắt buộc', content: 'Nội dung bài học đầy đủ để admin xem trước.', minutes: 10, required: true,
    }), 201);
    const questions = [{ id: 'market-q', prompt: 'Chọn đáp án đúng', options: ['Đúng', 'Sai'], correct: 0, explanation: 'Đáp án đúng.', lesson_id: lesson.id }];
    ok('creator saves a valid quiz', await request(seller, 'quiz-save', { ...payload(course.id), questions }));
    if (price) ok('creator sets draft price', await request(seller, 'course-price', { ...payload(course.id), price_vnd: price }));
    return { id: course.id, lesson: lesson.id, questions };
  }

  async function publish(title, price) {
    const course = await draft(title, price);
    ok('creator submits complete course for review', await status(seller, course.id, 'PENDING_REVIEW'));
    ok('admin approves submitted course', await review(course.id, 'APPROVE'));
    return course.id;
  }

  const paid = await draft('Khóa trả phí cần duyệt', 160_000);
  const id = paid.id;
  const named = ok('creator prepares a named quiz for review', await request(seller, 'named-quiz-save', { course_id: id, title: 'Quiz theo chủ đề' }), 201);
  ok('creator saves named quiz content', await request(seller, 'named-quiz-save', { id: named.id, course_id: id, title: 'Quiz theo chủ đề', version: 1, questions: paid.questions }));
  ok('regular creator cannot publish directly', await status(seller, id, 'PUBLISHED'), 403);
  ok('another user cannot modify the draft', await request(buyer, 'course-price', { ...payload(id), price_vnd: 0 }), 403);
  ok('creator submits a paid course', await status(seller, id, 'PENDING_REVIEW'));
  assert.equal(row(id).status, 'PENDING_REVIEW');
  ok('anonymous visitor cannot see pending course', await request(null, 'courses/' + id), 404);
  ok('regular user cannot read review queue', await request(buyer, 'course-reviews'), 403);
  ok('pending course cannot be bought', await buy(buyer, id), 403);
  ok('regular user cannot approve own course', await request(seller, 'course-review', { ...payload(id), action: 'APPROVE' }), 403);
  ok('course price is locked during review', await request(seller, 'course-price', { ...payload(id), price_vnd: 0 }), 409);
  ok('lesson content is locked during review', await request(seller, 'lesson-save', {
    course_id: id, id: paid.lesson, version: 1, title: 'Thay bài', content: 'Nội dung khác trong lúc khóa chờ duyệt.', minutes: 10,
  }), 409);
  ok('named quiz publication is locked during review', await request(seller, 'named-quiz-status', { id: named.id, version: 2, status: 'PUBLISHED' }), 409);
  ok('lab editing is locked during review', await request(seller, 'lab-save', { course_id: id }), 409);
  const queue = ok('admin sees pending course in review queue', await request(owner, 'course-reviews'));
  assert.ok(queue.rows.some(course => course.id === id));
  const preview = ok('admin previews submitted lessons and default quiz', await request(owner, 'courses/' + id));
  assert.ok(preview.lessons[0].content.includes('admin xem trước'));
  assert.equal(preview.quiz[0].correct, 0);
  assert.equal(preview.can_edit, false);
  assert.equal(ok('admin can inspect named quiz answers', await request(owner, 'named-quiz/' + named.id)).questions[0].correct, 0);
  ok('unrelated user cannot inspect named quiz answers', await request(buyer, 'named-quiz/' + named.id), 403);
  ok('rejecting course requires feedback', await review(id, 'REJECT', ''), 422);
  ok('admin returns draft with feedback', await review(id, 'REJECT', 'Hãy thêm ví dụ thực hành.'));
  assert.equal(ok('creator can read rejection reason', await request(seller, 'courses/' + id)).review.reason, 'Hãy thêm ví dụ thực hành.');
  ok('creator resubmits rejected draft', await status(seller, id, 'PENDING_REVIEW'));
  const stale = payload(id);
  ok('creator withdraws to edit', await status(seller, id, 'DRAFT'));
  ok('creator resubmits withdrawn draft', await status(seller, id, 'PENDING_REVIEW'));
  ok('stale review version cannot approve updated submission', await request(owner, 'course-review', { ...stale, action: 'APPROVE' }), 409);
  ok('admin approves latest submission', await review(id, 'APPROVE'));
  ok('approved course appears publicly with its price', await request(null, 'courses/' + id));
  ok('approved course is locked against unreviewed price changes', await request(seller, 'course-price', { ...payload(id), price_vnd: 1 }), 409);
  ok('seller cannot buy their own paid course', await buy(seller, id), 422);
  ok('anonymous visitor cannot buy', await buy(null, id), 401);
  ok('paid course rejects the free enrollment endpoint', await request(buyer, 'enroll', { course_id: id }), 402);

  const sameCourse = await Promise.all([buy(buyer, id), buy(buyer, id)]);
  for (const result of sameCourse) {
    assert.equal(ok('concurrent same-course purchase is idempotent', result).balance_vnd, initialBuyer - 160_000);
  }
  assert.equal(transfers(id).length, 1);
  assert.equal(transfers(id)[0].to_user_id, seller.userId);
  assert.ok(enrolled(buyer, id));
  assert.equal(await wallet(seller), opening.wallet_balance + 160_000);
  const sellerLog = ok('seller sees incoming sale and review outcomes', await request(seller, 'activity'));
  assert.ok(sellerLog.rows.some(row => row.kind === 'SALE' && row.course_id === id && row.amount_vnd === 160_000));
  assert.ok(sellerLog.rows.some(row => row.kind === 'REJECTED' && row.detail === 'Hãy thêm ví dụ thực hành.'));
  const buyerLog = ok('buyer activity shows outgoing purchase but no seller history', await request(buyer, 'activity?user_id=' + seller.userId));
  assert.ok(buyerLog.rows.some(row => row.kind === 'PURCHASE' && row.course_id === id && row.amount_vnd === -160_000));
  assert.ok(!buyerLog.rows.some(row => row.kind === 'SALE' || row.kind === 'REJECTED'));
  assert.ok(!buyerLog.rows.some(row => row.kind === 'ENROLL' && row.course_id === id));
  ok('buyer completes a purchased lesson', await request(buyer, 'complete', { lesson_id: paid.lesson }));
  assert.ok(ok('activity shows completed lesson', await request(buyer, 'activity')).rows.some(row => row.kind === 'COMPLETE' && row.course_id === id));

  const free = await draft('Khóa miễn phí cần duyệt', 0);
  ok('free draft is not open for enrollment', await request(buyer, 'enroll', { course_id: free.id }), 403);
  ok('free course enters the review queue', await status(seller, free.id, 'PENDING_REVIEW'));
  ok('free pending course is not open for enrollment', await request(buyer, 'enroll', { course_id: free.id }), 403);
  ok('admin approves free course', await review(free.id, 'APPROVE'));
  const beforeFree = await wallet(buyer);
  ok('approved free course enrolls without wallet debit', await request(buyer, 'enroll', { course_id: free.id }));
  assert.equal(await wallet(buyer), beforeFree);
  assert.equal(transfers(free.id).length, 0);

  const first = await publish('Khóa giá hai trăm hai mươi nghìn A', 220_000);
  const second = await publish('Khóa giá hai trăm hai mươi nghìn B', 220_000);
  const concurrent = await Promise.all([buy(buyer, first), buy(buyer, second)]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 402]);
  assert.equal(transfers(first).length + transfers(second).length, 1);
  assert.equal(await wallet(buyer), beforeFree - 220_000);
  console.log('PASS concurrent purchases cannot overspend the same wallet');

  const rollback = await publish('Khóa kiểm thử hoàn tác', 30_000);
  const balanceBeforeFailure = await wallet(buyer);
  const sellerBeforeFailure = await wallet(seller);
  database.exec("CREATE TEMP TRIGGER fail_wallet_enrollment BEFORE INSERT ON enrollments WHEN NEW.user_id='market-buyer' BEGIN SELECT RAISE(ABORT,'fixture enrollment failure'); END;");
  try {
    ok('enrollment failure rolls back the wallet transfer', await buy(buyer, rollback), 500);
    assert.equal(transfers(rollback).length, 0);
    assert.equal(await wallet(buyer), balanceBeforeFailure);
    assert.equal(await wallet(seller), sellerBeforeFailure);
    assert.equal(enrolled(buyer, rollback), undefined);
  } finally {
    database.exec('DROP TRIGGER fail_wallet_enrollment');
  }
  const beforePriceChange = payload(rollback);
  ok('admin updates the price as reviewer', await request(owner, 'course-price', { ...beforePriceChange, price_vnd: 35_000 }));
  ok('old displayed price cannot debit wallet', await request(buyer, 'wallet-buy', beforePriceChange), 409);
  ok('purchase succeeds after retry at the reviewed price', await buy(buyer, rollback));
  assert.equal(transfers(rollback)[0].amount_vnd, 35_000);

  const grant = { user_id: buyer.userId, amount_vnd: 25_000, request_id: crypto.randomUUID(), reason: 'Cấp thêm cho bài kiểm thử' };
  ok('regular account cannot issue VND', await request(buyer, 'wallet-grant', grant), 403);
  const granted = ok('admin grants a positive VND amount with reason', await request(owner, 'wallet-grant', grant));
  assert.equal(granted.balance_vnd, balanceBeforeFailure - 35_000 + 25_000);
  assert.equal(ok('same grant request is idempotent', await request(owner, 'wallet-grant', grant)).balance_vnd, granted.balance_vnd);
  ok('grant id cannot be reused for a different amount', await request(owner, 'wallet-grant', { ...grant, amount_vnd: 1 }), 409);
  ok('grant must use a positive integer', await request(owner, 'wallet-grant', { ...grant, amount_vnd: 1.5 }), 422);
  assert.ok(ok('grant appears in recipient wallet log', await request(buyer, 'wallet')).rows.some(row => row.kind === 'GRANT' && row.amount_vnd === 25_000));

  const legacy = await draft('Khóa trả phí đã bán trước đây', 75_000);
  database.prepare("UPDATE courses SET status='PUBLISHED' WHERE id=?").run(legacy.id);
  database.prepare('INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)').run(newcomer.userId, legacy.id, new Date().toISOString());
  assert.equal(ok('legacy enrolled learner retains lessons while review is pending', await request(newcomer, 'courses/' + legacy.id)).lessons[0].content.includes('admin xem trước'), true);
  ok('new buyer cannot buy a legacy course before review', await buy(buyer, legacy.id), 403);
  assert.equal(ok('legacy paid course is hidden from public catalog before review', await request(null, 'catalog?q=' + encodeURIComponent('đã bán trước đây'))).total, 0);
  assert.ok(ok('admin sees legacy sale in review queue', await request(owner, 'course-reviews')).rows.some(row => row.id === legacy.id && row.sale_pending_review));
  ok('admin approves legacy course for new sales', await review(legacy.id, 'APPROVE'));
  ok('reviewed legacy course can be bought', await buy(buyer, legacy.id));
  assert.ok(enrolled(newcomer, legacy.id));
  assert.equal(transfers(legacy.id).length, 1);
}
