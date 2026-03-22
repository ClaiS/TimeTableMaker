import React from 'react'

const NAV = [
  { id: 'tkb',    icon: '📅', label: 'Thời Khóa Biểu', group: 'CHÍNH' },
  { id: 'free',   icon: '🕐', label: 'Lịch Trống',      group: null },
  { id: 'upload', icon: '📤', label: 'Cập Nhật TKB',    group: 'QUẢN LÝ' },
  { id: 'notif',  icon: '🔔', label: 'Thông Báo',       group: null },
]

export default function Sidebar({ active, onChange }) {
  return (
    <aside style={s.sidebar}>
      {/* Logo */}
      <div style={s.logo}>
        <div style={s.logoBox}>
          <span style={s.logoText}>HU</span>
        </div>
        <div>
          <div style={s.logoTitle}>HUTECH TKB</div>
          <div style={s.logoSub}>Hệ thống Giảng viên</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={s.nav}>
        {NAV.map(item => (
          <React.Fragment key={item.id}>
            {item.group && <div style={s.sep}>{item.group}</div>}
            <button
              style={{ ...s.navItem, ...(active === item.id ? s.navItemActive : {}) }}
              onClick={() => onChange(item.id)}
            >
              <span style={s.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {active === item.id && <div style={s.activePip} />}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.footerAvatar}>TV</div>
        <div>
          <div style={s.footerName}>Trần Văn A</div>
          <div style={s.footerSub}>HK2 2025–2026</div>
        </div>
      </div>
    </aside>
  )
}

const s = {
  sidebar: {
    width: 220, background: '#fff', borderRight: '1px solid #E5E7EB',
    display: 'flex', flexDirection: 'column',
    position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100,
  },
  logo: {
    padding: '18px 16px', borderBottom: '1px solid #E5E7EB',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  logoBox: {
    width: 38, height: 38, background: 'linear-gradient(135deg,#DC2626,#B91C1C)',
    borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, boxShadow: '0 2px 8px rgba(220,38,38,.35)',
  },
  logoText: { color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: -0.5 },
  logoTitle: { fontSize: 13, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 },
  logoSub: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  nav: { padding: '10px 8px', flex: 1, overflowY: 'auto' },
  sep: {
    fontSize: 9, color: '#CBD5E1', fontWeight: 700,
    padding: '12px 10px 4px', letterSpacing: 1, textTransform: 'uppercase',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '9px 10px', borderRadius: 8, width: '100%', border: 'none',
    background: 'transparent', fontSize: 13, color: '#64748B',
    fontWeight: 500, marginBottom: 2, textAlign: 'left',
    transition: 'all .15s', cursor: 'pointer', position: 'relative',
  },
  navItemActive: {
    background: '#FEF2F2', color: '#DC2626', fontWeight: 700,
  },
  navIcon: { fontSize: 16, width: 20, textAlign: 'center' },
  activePip: {
    position: 'absolute', right: 10, width: 6, height: 6,
    borderRadius: 3, background: '#DC2626',
  },
  footer: {
    padding: '12px 14px', borderTop: '1px solid #E5E7EB',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  footerAvatar: {
    width: 32, height: 32, borderRadius: 8,
    background: 'linear-gradient(135deg,#DC2626,#B91C1C)',
    color: '#fff', fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  footerName: { fontSize: 12, fontWeight: 700, color: '#0F172A' },
  footerSub: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
}
