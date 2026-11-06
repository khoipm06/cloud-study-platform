'use client';
import { useState, useEffect } from 'react';
import { Target, ShieldCheck, LogOut } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/state')
      .then(res => res.json())
      .then(data => { if (data.user) setUser(data.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="breadcrumb"><b>Mở học</b> / Tổng quan</div>
        <div className="top-search">
          {user ? (
            <div className="profile">
              <div className="avatar">{user.name.charAt(0)}</div>
              <span><b>{user.name}</b><small>{user.role}</small></span>
            </div>
          ) : (
            <small>Đang xác thực người dùng...</small>
          )}
        </div>
      </header>
      <main>
        <div className="page-title-row">
          <div>
            <div className="eyebrow">CHÀO MỪNG TRỞ LẠI</div>
            <h1>Xin chào{user ? `, ${user.name}` : ''}! <span className="wave">👋</span></h1>
            <p>Hệ thống xác thực và quản lý tài khoản thành viên đã được kích hoạt.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
