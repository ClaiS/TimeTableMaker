import React, { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import TKBPage from './pages/TKBPage.jsx'
import FreePage from './pages/FreePage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import NotifPage from './pages/NotifPage.jsx'
import { INIT_CLASSES } from './shared/data.js'

const PAGE_TITLES = {
  tkb:    '📅  Thời Khóa Biểu',
  free:   '🕐  Lịch Trống',
  upload: '📤  Cập Nhật TKB',
  notif:  '🔔  Thông Báo',
}

export default function App() {
  const [tab, setTab] = useState('tkb')
  const [classes, setClasses] = useState(INIT_CLASSES)
  const [notifBanner, setNotifBanner] = useState(true)

  return (
    <div style={s.root}>
      <Sidebar active={tab} onChange={setTab} />

      <div style={s.main}>
        {/* Topbar */}
        <div style={s.topbar}>
          <div style={s.topbarLeft}>
            <span style={s.topbarTitle}>{PAGE_TITLES[tab]}</span>
          </div>
          <div style={s.topbarRight}>
            <span style={s.topBadge}>GV: Trần Văn A</span>
            <span style={s.topBadge}>HK2 2025–2026</span>
            <span style={{ cursor: 'pointer', fontSize: 18 }} onClick={() => setTab('notif')} title="Thông báo">🔔</span>
          </div>
        </div>

        {/* Notification banner */}
        {notifBanner && (
          <div style={s.notifBanner}>
            <span>🔔</span>
            <span style={{ flex: 1 }}><strong>Nhắc nhở:</strong> Ngày mai 7h30 · Phân tích Thiết kế Hệ thống · E1-07.08</span>
            <button style={s.bannerClose} onClick={() => setNotifBanner(false)}>✕</button>
          </div>
        )}

        {/* Content */}
        <div style={s.content}>
          {tab === 'tkb'    && <TKBPage classes={classes} setClasses={setClasses} />}
          {tab === 'free'   && <FreePage classes={classes} />}
          {tab === 'upload' && <UploadPage onSuccess={nc => { setClasses(p => [...p, ...nc]); setTab('tkb') }} />}
          {tab === 'notif'  && <NotifPage classes={classes} />}
        </div>
      </div>
    </div>
  )
}

const s = {
  root: { display: 'flex', minHeight: '100vh' },
  main: { marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 },
  topbar: {
    background: '#DC2626', color: '#fff',
    padding: '0 24px', height: 56,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 50,
    boxShadow: '0 2px 8px rgba(220,38,38,.35)',
  },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topbarTitle: { fontSize: 16, fontWeight: 700, letterSpacing: -.2 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  topBadge: { background: 'rgba(255,255,255,.2)', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  notifBanner: {
    background: '#1D4ED8', color: '#fff',
    padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
  },
  bannerClose: { background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', opacity: .8, padding: '2px 4px' },
  content: { padding: '20px 24px', flex: 1, overflowY: 'auto' },
}
