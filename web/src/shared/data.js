// ─── SCHOOL COLORS ───
export const SCHOOL_LIST = [
  { key: 'HUTECH',  full: 'HUTECH – ĐH Công nghệ TP.HCM',         bg: '#DBEAFE', br: '#2563EB', tx: '#1E3A8A' },
  { key: 'BKU',     full: 'BKU – ĐH Bách Khoa TP.HCM',            bg: '#FEF3C7', br: '#D97706', tx: '#78350F' },
  { key: 'UIT',     full: 'UIT – ĐH Công nghệ Thông tin',          bg: '#D1FAE5', br: '#059669', tx: '#064E3B' },
  { key: 'UEL',     full: 'UEL – ĐH Kinh tế - Luật',               bg: '#EDE9FE', br: '#7C3AED', tx: '#2E1065' },
  { key: 'HCMUTE',  full: 'HCMUTE – ĐH Sư phạm Kỹ thuật TP.HCM',  bg: '#FCE7F3', br: '#DB2777', tx: '#831843' },
  { key: 'TDTU',    full: 'TDTU – ĐH Tôn Đức Thắng',               bg: '#CCFBF1', br: '#0D9488', tx: '#042F2E' },
  { key: 'HCMUAF',  full: 'HCMUAF – ĐH Nông Lâm TP.HCM',           bg: '#FEF9C3', br: '#CA8A04', tx: '#713F12' },
  { key: 'UEF',     full: 'UEF – ĐH Kinh tế - Tài chính',          bg: '#FFF7ED', br: '#EA580C', tx: '#7C2D12' },
  { key: 'VLU',     full: 'VLU – ĐH Văn Lang',                      bg: '#ECFDF5', br: '#16A34A', tx: '#14532D' },
  { key: 'HUI',     full: 'HUI – ĐH Công nghiệp TP.HCM',            bg: '#FDF4FF', br: '#A21CAF', tx: '#4A044E' },
  { key: 'HCMUS',   full: 'HCMUS – ĐH Khoa học Tự nhiên',           bg: '#ECFEFF', br: '#0891B2', tx: '#164E63' },
  { key: 'OTHER',   full: 'Trường khác / Nhập tay',                  bg: '#F1F5F9', br: '#64748B', tx: '#1E293B' },
]

export const SCHOOL_MAP = Object.fromEntries(SCHOOL_LIST.map(s => [s.key, s]))

function hashColor(str) {
  const PALETTE = [
    { bg: '#FEF9C3', br: '#CA8A04', tx: '#713F12' },
    { bg: '#FCE7F3', br: '#9D174D', tx: '#831843' },
    { bg: '#ECFDF5', br: '#047857', tx: '#022C22' },
    { bg: '#EFF6FF', br: '#1D4ED8', tx: '#1E3A8A' },
    { bg: '#FFF7ED', br: '#C2410C', tx: '#7C2D12' },
    { bg: '#F5F3FF', br: '#6D28D9', tx: '#2E1065' },
    { bg: '#ECFEFF', br: '#0E7490', tx: '#164E63' },
    { bg: '#FDF4FF', br: '#A21CAF', tx: '#4A044E' },
  ]
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export function getColor(cls) {
  if (cls.status === 'makeup') return { bg: '#D1FAE5', br: '#059669', tx: '#064E3B' }
  const key = (cls.truong || '').trim().toUpperCase()
  if (SCHOOL_MAP[key]) return SCHOOL_MAP[key]
  const found = SCHOOL_LIST.find(s => s.full.toUpperCase().includes(key))
  if (found) return found
  return hashColor(key || 'OTHER')
}

// ─── TIER DATA ───
export const TT = [
  { n: 1,  s: '06:45', e: '07:30', sess: 'S' },
  { n: 2,  s: '07:30', e: '08:15', sess: 'S' },
  { n: 3,  s: '08:15', e: '09:00', sess: 'S' },
  { n: 4,  s: '09:20', e: '10:05', sess: 'S' },
  { n: 5,  s: '10:05', e: '10:50', sess: 'S' },
  { n: 6,  s: '10:50', e: '11:35', sess: 'S' },
  { n: 7,  s: '12:30', e: '13:15', sess: 'C' },
  { n: 8,  s: '13:15', e: '14:00', sess: 'C' },
  { n: 9,  s: '14:00', e: '14:45', sess: 'C' },
  { n: 10, s: '15:05', e: '15:50', sess: 'C' },
  { n: 11, s: '15:50', e: '16:35', sess: 'C' },
  { n: 12, s: '16:35', e: '17:20', sess: 'C' },
  { n: 13, s: '18:00', e: '18:45', sess: 'T' },
  { n: 14, s: '18:45', e: '19:30', sess: 'T' },
  { n: 15, s: '19:30', e: '20:15', sess: 'T' },
]

export const DF = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
export const DF_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// ─── MOCK DATA ───
let _nid = 100
export const gid = () => ++_nid


// ─── DATE HELPERS ───
export function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1))
  dt.setHours(0, 0, 0, 0)
  return dt
}
export function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
export function fmtShort(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
export function fmtFull(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export const STATUS_LABEL = { normal: 'Chính thức', makeup: 'Dạy bù', cancelled: 'Đã hủy' }
