/* No fetch handler or page caching: private learning responses stay in the app. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload;
  try { payload = event.data.json(); } catch { payload = {}; }
  // Keep lock-screen text generic, even if a malformed message arrives.
  event.waitUntil(self.registration.showNotification('Cloud study platform', {
    body: payload.tag === 'mohoc-test' ? 'Thông báo thử đã đến thiết bị này.' : 'Bạn có lịch học đến hạn. Mở kế hoạch để xem chi tiết.',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0,100) : 'mohoc-study',
    data: {route: 'planner'},
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = new URL('/#planner', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows => {
    const tab = windows.find(x => new URL(x.url).origin === self.location.origin);
    if (tab) { await tab.navigate(destination); return tab.focus(); }
    return self.clients.openWindow(destination);
  }));
});
