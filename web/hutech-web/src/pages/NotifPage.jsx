import React, { useState } from 'react'
import { TT, DF, getColor, STATUS_LABEL } from '../shared/data.js'

export default function NotifPage({ classes }) {
  const [notifOn, setNotifOn] = useState(false)
  const [settings, setSettings] = useState([
    { key: '24h', label: '🔔  Nhắc trước 24 giờ', sub: '1 ngày trước mỗi buổi dạy', on: true },
    { key: '2h',  label: '⏰  Nhắc trước 2 giờ',  sub: '2 tiếng trước mỗi buổi',    on: true },
    { key: 'sfx', label: '🔊  Âm thanh',           sub: 'Phát âm khi có nhắc nhở',   on: false },
  ])

  const toggle = key => setSettings(p => p.map(s => s.key === key ? { ...s, on: !s.on } : s))

  const handleNotif = () => {
    if (!notifOn && 'Notification' in window) {
      Notification.requestPermission().then(p => { if (p === 'granted') setNotifOn(true) })
    } else {
      setNotifOn(p => !p)
    }
  }

  return (
    <div style={s.page}>
      <div style={s.cols}>
        <div style={s.col}>
          {/* Banner */}
          <div style={{ ...s.banner, background: notifOn ? '#064E3B' : '#1D4ED8' }}>
            <div>
              <div style={s.bannerTitle}>{notifOn ? '🔔  Thông báo đã bật' : '🔔  Push Notification'}</div>
              <div style={s.bannerSub}>Nhận nhắc nhở 24 giờ trước mỗi buổi dạy</div>
            </div>
            <button style={{ ...s.bannerBtn, color: notifOn ? '#064E3B' : '#DC2626' }} onClick={handleNotif}>
              {notifOn ? 'Đã bật ✓' : 'Bật thông báo'}
            </button>
          </div>

          {/* Sample notif */}
          <div style={s.sampleCard}>
            <div style={s.sampleIcon}>🔔</div>
            <div>
              <div style={s.sampleLabel}>NHẮC NHỞ · Vừa gửi</div>
              <div style={s.sampleTitle}>Ngày mai bạn có lớp lúc 7h30 sáng</div>
              <div style={s.sampleSub}>Phân tích Thiết kế Hệ thống · E1-07.08 · Lớp 02</div>
            </div>
          </div>

          {/* Settings */}
          <div style={s.card}>
            <div style={s.cardHead}>Cài đặt thông báo</div>
            {settings.map(setting => (
              <div key={setting.key} style={s.settingRow}>
                <div>
                  <div style={s.settingLabel}>{setting.label}</div>
                  <div style={s.settingSub}>{setting.sub}</div>
                </div>
                <div style={{ ...s.toggle, background: setting.on ? '#DC2626' : '#D1D5DB' }} onClick={() => toggle(setting.key)}>
                  <div style={{ ...s.toggleThumb, left: setting.on ? 22 : 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.col}>
          {/* Upcoming */}
          <div style={s.card}>
            <div style={s.cardHead}>Lịch dạy sắp tới</div>
            {classes.map(c => {
              const cl = getColor(c)
              return (
                <div key={c.id} style={s.notifRow}>
                  <div style={{ ...s.notifBar, background: cl.br }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ ...s.notifDay, color: cl.br }}>{DF[c.thu - 2]} · Tiết {c.tb}–{c.tk} · {TT[c.tb - 1]?.s}</div>
                    <div style={s.notifName}>{c.ten}</div>
                    <div style={s.notifMeta}>{c.phong} · {c.ma} · {c.truong}</div>
                  </div>
                  <div style={s.notifBadge}>Sắp tới</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: { animation: 'fadeIn .25s ease' },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  col: { display: 'flex', flexDirection: 'column', gap: 14 },
  banner: { borderRadius: 12, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  bannerTitle: { color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 3 },
  bannerSub: { color: 'rgba(255,255,255,.8)', fontSize: 12 },
  bannerBtn: { padding: '8px 20px', background: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  sampleCard: { background: '#fff', borderRadius: 10, padding: '13px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: '4px solid #DC2626', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  sampleIcon: { width: 38, height: 38, background: '#FEF2F2', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  sampleLabel: { fontSize: 10, color: '#DC2626', fontWeight: 700, marginBottom: 3 },
  sampleTitle: { fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 2 },
  sampleSub: { fontSize: 11, color: '#94A3B8' },
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' },
  cardHead: { padding: '10px 14px', background: '#FAFAFA', borderBottom: '1px solid #F3F4F6', fontSize: 13, fontWeight: 700, color: '#0F172A' },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid #F9FAFB' },
  settingLabel: { fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 2 },
  settingSub: { fontSize: 11, color: '#94A3B8' },
  toggle: { width: 42, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .2s' },
  toggleThumb: { position: 'absolute', top: 3, width: 18, height: 18, background: '#fff', borderRadius: 9, transition: 'left .2s' },
  notifRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F9FAFB' },
  notifBar: { width: 3, height: 40, borderRadius: 2, flexShrink: 0 },
  notifDay: { fontSize: 11, fontWeight: 700, marginBottom: 1 },
  notifName: { fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 1 },
  notifMeta: { fontSize: 10, color: '#94A3B8' },
  notifBadge: { background: '#DCFCE7', color: '#15803D', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, flexShrink: 0 },
}
