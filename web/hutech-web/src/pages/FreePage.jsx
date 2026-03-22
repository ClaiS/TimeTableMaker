import React, { useState } from 'react'
import { TT, DF, DF_SHORT, getColor } from '../shared/data.js'

// Buổi sáng: tiết 1–6, chiều: 7–12, tối: 13–15
const SESSIONS = [
  { key: 'S', label: 'Sáng',  from: 1,  to: 6,  color: '#B45309', bg: '#FFFBEB', border: '#FCD34D' },
  { key: 'C', label: 'Chiều', from: 7,  to: 12, color: '#4C1D95', bg: '#F5F3FF', border: '#A78BFA' },
  { key: 'T', label: 'Tối',   from: 13, to: 15, color: '#064E3B', bg: '#F0FDF4', border: '#6EE7B7' },
]

// Compute continuous free ranges within a tier window [from, to]
function freeRangesInWindow(occ, from, to) {
  const ranges = []
  let st = null
  for (let t = from; t <= to; t++) {
    if (!occ.has(t)) {
      if (st === null) st = t
    } else {
      if (st !== null) { ranges.push({ f: st, t: t - 1 }); st = null }
    }
  }
  if (st !== null) ranges.push({ f: st, t: to })
  return ranges
}

function tierLabel(f, t) {
  if (f === t) return `Tiết ${f}`          // single tier: "Tiết 1"
  return `Tiết ${f}–${t}`                  // range: "Tiết 1–6"
}

export default function FreePage({ classes }) {
  const [filter, setFilter] = useState(null)

  const days = DF.map((dn, idx) => {
    const thu = idx + 2
    const dcs = classes.filter(c => c.thu === thu)
    const occ = new Set()
    dcs.forEach(c => { for (let t = c.tb; t <= c.tk; t++) occ.add(t) })

    // Per session free slots
    const sessions = SESSIONS.map(sess => {
      const ranges = freeRangesInWindow(occ, sess.from, sess.to)
      return { ...sess, ranges }
    }).filter(sess => sess.ranges.length > 0)

    const totalFreeSlots = sessions.reduce((acc, s) => acc + s.ranges.length, 0)
    return { dn, idx, thu, dcs, sessions, totalFreeSlots }
  })

  const shown = filter !== null ? [days[filter]] : days

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>Lịch Trống Trong Tuần</div>
          <div style={s.sub}>Tổng hợp theo buổi: Sáng (T1–6) · Chiều (T7–12) · Tối (T13–15)</div>
        </div>
        <div style={s.filters}>
          <button style={{ ...s.chip, ...(filter === null ? s.chipActive : {}) }} onClick={() => setFilter(null)}>Tất cả</button>
          {DF_SHORT.map((d, i) => (
            <button key={i} style={{ ...s.chip, ...(filter === i ? s.chipActive : {}) }} onClick={() => setFilter(i)}>{d}</button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div style={s.grid}>
        {shown.map(day => (
          <div key={day.thu} style={s.card}>
            {/* Card header */}
            <div style={s.cardHead}>
              <span style={s.cardDay}>{day.dn}</span>
              <span style={{ ...s.badge, ...(day.totalFreeSlots > 0 ? s.badgeGreen : s.badgeRed) }}>
                {day.totalFreeSlots > 0 ? `${day.totalFreeSlots} khoảng trống` : 'Kín lịch'}
              </span>
            </div>

            {day.sessions.length === 0
              ? <div style={s.emptyTx}>Không có tiết trống</div>
              : day.sessions.map(sess => (
                <div key={sess.key}>
                  {/* Session label */}
                  <div style={{ ...s.sessLabel, background: sess.bg, borderLeft: `3px solid ${sess.border}` }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: sess.color }}>
                      {sess.label} (T{sess.from}–{sess.to})
                    </span>
                  </div>
                  {sess.ranges.map((sl, si) => (
                    <div key={si} style={s.slot}>
                      <div style={s.dot} />
                      <div style={{ flex: 1 }}>
                        <div style={s.slotTier}>{tierLabel(sl.f, sl.t)}</div>
                        <div style={s.slotTime}>
                          {TT[sl.f - 1]?.s} → {TT[sl.t - 1]?.e}
                          {sl.f !== sl.t && ` · ${sl.t - sl.f + 1} tiết`}
                        </div>
                      </div>
                      <div style={s.freeTag}>Trống</div>
                    </div>
                  ))}
                </div>
              ))
            }

            {/* Occupied chips */}
            {day.dcs.length > 0 && (
              <div style={s.occWrap}>
                <div style={s.occLabel}>Đã có lịch:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                  {day.dcs.map(c => {
                    const cl = getColor(c)
                    return (
                      <span key={c.id} style={{ ...s.occChip, background: cl.bg, borderColor: cl.br, color: cl.tx }}>
                        T{c.tb}–{c.tk}: {c.ma}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  page:      { display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn .25s ease' },
  header:    { background: '#fff', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  title:     { fontSize: 14, fontWeight: 700, color: '#0F172A' },
  sub:       { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  filters:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip:      { padding: '5px 12px', border: '1px solid #E5E7EB', borderRadius: 14, fontSize: 12, fontWeight: 600, color: '#64748B', background: '#fff', cursor: 'pointer', transition: 'all .15s' },
  chipActive:{ background: '#DC2626', borderColor: '#DC2626', color: '#fff' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  card:      { background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' },
  cardHead:  { padding: '10px 14px', background: '#FAFAFA', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardDay:   { fontSize: 13, fontWeight: 700, color: '#0F172A' },
  badge:     { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 },
  badgeGreen:{ background: '#DCFCE7', color: '#15803D' },
  badgeRed:  { background: '#FEF2F2', color: '#DC2626' },
  emptyTx:   { padding: 14, textAlign: 'center', fontSize: 12, color: '#94A3B8' },
  sessLabel: { padding: '4px 14px', margin: '4px 0 0' },
  slot:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #F9FAFB' },
  dot:       { width: 8, height: 8, borderRadius: 4, background: '#22C55E', flexShrink: 0 },
  slotTier:  { fontSize: 12, fontWeight: 700, color: '#0F172A' },
  slotTime:  { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  freeTag:   { background: '#DCFCE7', color: '#15803D', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5 },
  occWrap:   { padding: '8px 14px', background: '#FAFAFA', borderTop: '1px solid #F3F4F6' },
  occLabel:  { fontSize: 10, color: '#94A3B8' },
  occChip:   { fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, border: '1px solid' },
}
