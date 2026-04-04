import { useCallback, useEffect, useRef, useState } from "react";
import AEModal from "../components/AEModal.jsx";
import {
  addDays,
  DF,
  fmtFull,
  fmtShort,
  getColor,
  getMonday,
  SCHOOL_MAP,
  TT,
} from "../shared/data.js";

const BREAK_BEFORE = new Set([4, 10]);
const SESS_STYLE = {
  S: { bg: "#FFFBEB", bl: "#FCD34D" },
  C: { bg: "#F5F3FF", bl: "#A78BFA" },
  T: { bg: "#F0FDF4", bl: "#6EE7B7" },
};

const API_BASE = "http://127.0.0.1:8000";

const mapFEtoBE = (item) => ({
  ma_mon: item.ma,
  ten_mon: item.ten,
  lop: item.lop,
  si_so: parseInt(item.ss) || 0,
  thu: parseInt(item.thu),
  tiet_bat_dau: parseInt(item.tb),
  tiet_ket_thuc: parseInt(item.tk),
  phong: item.phong,
  truong: item.truong,
  hoc_ky: item.hk,
  status: item.status,
});

const mapBEtoFE = (item) => ({
  id: item.id,
  ma: item.ma_mon,
  ten: item.ten_mon,
  lop: item.lop || item.nhom || "01",
  ss: item.si_so || 0,
  thu: item.thu,
  tb: item.tiet_bat_dau,
  tk: item.tiet_ket_thuc,
  phong: item.phong || "",
  truong: item.truong || "OTHER",
  hk: item.hoc_ky || "HK2",
  status: item.status || "normal",
});

// rowSpan = number of <tr> rows the cell must span (tier rows + break rows within span)
function calcRowSpan(tb, tk) {
  let span = tk - tb + 1;
  if (tb <= 3 && tk >= 4) span += 1; // break row before tier 4
  if (tb <= 9 && tk >= 10) span += 1; // break row before tier 10
  return span;
}

export default function TKBPage({ classes, setClasses }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [tooltip, setTooltip] = useState(null); // { cls, x, y, locked }
  const [editCls, setEditCls] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const leaveTimer = useRef(null);

  const base = getMonday(new Date());
  const ws = addDays(base, weekOffset * 7);
  const we = addDays(ws, 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayMap = Array.from({ length: 7 }, () => []);
  classes.forEach((c) => {
    const di = c.thu - 2;
    if (di >= 0 && di <= 6) dayMap[di].push(c);
  });

  const saveClass = async (c) => {
    try {
      const payload = mapFEtoBE(c);
      if (c.id && classes.find((x) => x.id === c.id)) {
        const res = await fetch(`${API_BASE}/api/sessions/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setClasses((p) =>
            p.map((x) => (x.id === c.id ? mapBEtoFE(updated) : x)),
          );
        }
      } else {
        const res = await fetch(`${API_BASE}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const added = await res.json();
          setClasses((p) => [...p, mapBEtoFE(added)]);
        }
      }
      setEditCls(null);
      setShowAdd(false);
    } catch (e) {
      console.error(e);
      alert("Lỗi lưu DB");
    }
  };

  const deleteClass = async (id) => {
    if (window.confirm("Xóa buổi dạy này?")) {
      await fetch(`${API_BASE}/api/sessions/${id}`, { method: "DELETE" });
      setClasses((p) => p.filter((c) => c.id !== id));
      setTooltip(null);
    }
  };

  const cancelClass = async (id) => {
    await fetch(`${API_BASE}/api/sessions/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setClasses((p) =>
      p.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c)),
    );
    setTooltip(null);
  };

  const restoreClass = async id => { 
    await fetch(`${API_BASE}/api/sessions/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({status: 'normal'})
    });
    setClasses(p => p.map(c => c.id === id ? { ...c, status: 'normal' } : c)); 
    setTooltip(null); 
  }

  // ── Tooltip: follow cursor on block, lock on tooltip hover ──
  const safePos = (cx, cy) => {
    const TW = 264,
      TH = 320;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    let x = cx + 18,
      y = cy + 18;
    if (x + TW > vw - 8) x = cx - TW - 8;
    if (y + TH > vh - 8) y = cy - TH - 8;
    if (y < 8) y = 8;
    return { x, y };
  };

  const onBlockMouseMove = useCallback((cls, e) => {
    clearTimeout(leaveTimer.current);
    setTooltip((prev) => {
      if (prev?.locked) return prev;
      const { x, y } = safePos(e.clientX, e.clientY);
      return { cls, x, y, locked: false };
    });
  }, []);

  const onBlockMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => {
      setTooltip((prev) => (prev?.locked ? prev : null));
    }, 100);
  }, []);

  const onTooltipLeave = useCallback(() => setTooltip(null), []);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const schoolsSeen = [
    ...new Set(
      classes.filter((c) => c.status !== "cancelled").map((c) => c.truong),
    ),
  ];
  const hasMakeup = classes.some((c) => c.status === "makeup");
  const hasCancelled = classes.some((c) => c.status === "cancelled");

  return (
    <div style={s.page}>
      {/* ── Topbar ── */}
      <div style={s.topBar}>
        <div style={s.weekNav}>
          <button style={s.navBtn} onClick={() => setWeekOffset((o) => o - 1)}>
            ‹
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={s.weekRange}>
              {fmtFull(ws)} – {fmtFull(we)}
            </div>
            <div style={s.weekSub}>
              {weekOffset === 0
                ? "Tuần hiện tại"
                : weekOffset > 0
                  ? `+${weekOffset} tuần`
                  : `${weekOffset} tuần`}
            </div>
          </div>
          <button style={s.navBtn} onClick={() => setWeekOffset((o) => o + 1)}>
            ›
          </button>
          <button style={s.todayBtn} onClick={() => setWeekOffset(0)}>
            Hôm nay
          </button>
        </div>
        <button style={s.btnAdd} onClick={() => setShowAdd(true)}>
          + Thêm buổi
        </button>
      </div>

      {/* ── Grid ── */}
      <div style={s.gridWrap}>
        <div style={{ overflowX: "auto" }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 64, background: "#FAFAFA" }}>
                  Tiết
                </th>
                {DF.map((d, i) => {
                  const dt = addDays(ws, i);
                  const isToday = dt.getTime() === today.getTime();
                  return (
                    <th
                      key={i}
                      style={{ ...s.th, ...(isToday ? s.thToday : {}) }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{d}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: isToday ? 700 : 400,
                          marginTop: 1,
                        }}
                      >
                        {fmtShort(dt)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = [];
                const skipMap = {};

                for (let t = 1; t <= 15; t++) {
                  const tier = TT[t - 1];
                  const ss = SESS_STYLE[tier.sess];

                  // ── Break row inserted BEFORE tier 4 and tier 10 ──
                  if (BREAK_BEFORE.has(t)) {
                    rows.push(
                      <tr key={`brk${t}`}>
                        <td style={s.brkTier}>
                          <span style={{ fontSize: 8, color: "#B45309" }}>
                            ☕
                          </span>
                        </td>
                        <td colSpan={7} style={s.brkCell}>
                          {t === 4
                            ? "Giải lao 09:00 – 09:20"
                            : "Giải lao 14:45 – 15:05"}
                        </td>
                      </tr>,
                    );
                  }

                  const cells = [];
                  // Tier label
                  cells.push(
                    <td
                      key="tc"
                      style={{
                        ...s.tierCell,
                        background: ss.bg,
                        borderLeft: `3px solid ${ss.bl}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#374151",
                          fontFamily: "monospace",
                        }}
                      >
                        {t}
                      </div>
                      <div
                        style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}
                      >
                        {tier.s}
                      </div>
                    </td>,
                  );

                  for (let d = 0; d < 7; d++) {
                    if (skipMap[t]?.[d]) continue;

                    // Tính ngày thực tế của cột hiện tại
                    const currentCellDate = addDays(ws, d);

                    // Lọc môn thỏa mãn Thứ + Tiết Bắt Đầu + Ngày tháng
                    const found = dayMap[d].find(
                      (c) =>
                        c.tb === t &&
                        isDateInRanges(currentCellDate, c.date_ranges),
                    );

                    if (found) {
                      const cl = getColor(found);
                      const cancelled = found.status === "cancelled";
                      const makeup = found.status === "makeup";

                      // Mark tiers to skip
                      for (let r = found.tb + 1; r <= found.tk; r++) {
                        if (!skipMap[r]) skipMap[r] = {};
                        skipMap[r][d] = true;
                      }

                      const rowSpan = calcRowSpan(found.tb, found.tk);

                      cells.push(
                        <td
                          key={d}
                          rowSpan={rowSpan}
                          style={{
                            ...s.td,
                            padding: 3,
                            verticalAlign: "top",
                            position: "relative",
                          }}
                        >
                          {/*
                            Block uses position:absolute + inset so it fills the entire
                            cell height automatically — no hardcoded height needed.
                            Cell height = rowSpan * 40px + break_rows_inside * 8px
                            Block height = cell - 4px margin (inset 2px top+bottom)
                          */}
                          <div
                            style={{
                              ...s.block,
                              background: cancelled ? "#F1F5F9" : cl.bg,
                              borderLeftColor: cancelled ? "#94A3B8" : cl.br,
                              opacity: cancelled ? 0.65 : 1,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                            }}
                            onMouseMove={(e) => onBlockMouseMove(found, e)}
                            onMouseLeave={onBlockMouseLeave}
                            onClick={() => setEditCls(found)}
                          >
                            {/* Top: status tag + ma mon */}
                            <div>
                              {makeup && <div style={s.tagMakeup}>DẠY BÙ</div>}
                              {cancelled && (
                                <div style={s.tagCancelled}>ĐÃ HỦY</div>
                              )}
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: cancelled ? "#94A3B8" : cl.br,
                                  fontFamily: "monospace",
                                  lineHeight: 1.3,
                                }}
                              >
                                {found.ma}
                              </div>
                            </div>
                            {/* Middle: ten mon — largest, takes available space */}
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: cancelled ? "#94A3B8" : cl.tx,
                                lineHeight: 1.35,
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 4,
                                WebkitBoxOrient: "vertical",
                                flex: 1,
                                margin: "3px 0",
                              }}
                            >
                              {found.ten}
                            </div>
                            {/* Bottom: phong + lop */}
                            <div>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: cancelled ? "#CBD5E1" : cl.br,
                                  lineHeight: 1.3,
                                }}
                              >
                                {found.phong}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: cancelled ? "#CBD5E1" : cl.tx,
                                  opacity: 0.75,
                                  marginTop: 1,
                                  lineHeight: 1.3,
                                }}
                              >
                                Lớp {found.lop}
                              </div>
                            </div>
                          </div>
                        </td>,
                      );
                    } else {
                      cells.push(
                        <td
                          key={d}
                          style={{
                            ...s.td,
                            background: t % 2 === 0 ? "#fff" : "#FAFAFA",
                          }}
                        />,
                      );
                    }
                  }
                  rows.push(
                    <tr key={t} style={{ height: 40 }}>
                      {cells}
                    </tr>,
                  );
                }
                return rows;
              })()}
            </tbody>
          </table>
        </div>

        {/* ── Legend ── */}
        <div style={s.legend}>
          {schoolsSeen.map((sk) => {
            const cl = SCHOOL_MAP[sk] || {
              bg: "#F1F5F9",
              br: "#64748B",
              tx: "#1E293B",
            };
            return (
              <div
                key={sk}
                style={{
                  ...s.lgItem,
                  background: cl.bg,
                  border: `1px solid ${cl.br}`,
                }}
              >
                <div style={{ ...s.lgDot, background: cl.br }} />
                <span style={{ color: cl.tx, fontSize: 13, fontWeight: 600 }}>
                  {sk}
                </span>
              </div>
            );
          })}
          {hasMakeup && (
            <div
              style={{
                ...s.lgItem,
                background: "#D1FAE5",
                border: "1px solid #059669",
              }}
            >
              <div style={{ ...s.lgDot, background: "#059669" }} />
              <span style={{ color: "#064E3B", fontSize: 13, fontWeight: 600 }}>
                Dạy bù
              </span>
            </div>
          )}
          {hasCancelled && (
            <div
              style={{
                ...s.lgItem,
                background: "#F1F5F9",
                border: "1px solid #94A3B8",
              }}
            >
              <div style={{ ...s.lgDot, background: "#94A3B8" }} />
              <span style={{ color: "#475569", fontSize: 13, fontWeight: 600 }}>
                Đã hủy
              </span>
            </div>
          )}
          <div
            style={{
              ...s.lgItem,
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
            }}
          >
            <div style={{ ...s.lgDot, background: "#FCD34D" }} />
            <span style={{ color: "#92400E", fontSize: 13 }}>Sáng T1–6</span>
          </div>
          <div
            style={{
              ...s.lgItem,
              background: "#F5F3FF",
              border: "1px solid #A78BFA",
            }}
          >
            <div style={{ ...s.lgDot, background: "#A78BFA" }} />
            <span style={{ color: "#4C1D95", fontSize: 13 }}>Chiều T7–12</span>
          </div>
          <div
            style={{
              ...s.lgItem,
              background: "#F0FDF4",
              border: "1px solid #6EE7B7",
            }}
          >
            <div style={{ ...s.lgDot, background: "#6EE7B7" }} />
            <span style={{ color: "#064E3B", fontSize: 13 }}>Tối T13–15</span>
          </div>
        </div>
      </div>

      {/* ── Tooltip: hover to read, stays put when mouse enters it ── */}
      {tooltip && (
        <div style={{ ...s.tip, left: tooltip.x, top: tooltip.y }}>
          {/* Coloured header */}
          <div style={{ ...s.tipHead, background: getColor(tooltip.cls).br }}>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,.7)",
                fontFamily: "monospace",
                marginBottom: 3,
              }}
            >
              {tooltip.cls.ma} · {tooltip.cls.truong}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.4,
              }}
            >
              {tooltip.cls.ten}
            </div>
          </div>

          {/* Info rows */}
          <div style={{ padding: "5px 0" }}>
            {[
              ["Phòng", tooltip.cls.phong],
              ["Lớp", tooltip.cls.lop],
              ["Sĩ số", `${tooltip.cls.ss} SV`],
              [
                "Tiết",
                `${tooltip.cls.tb}–${tooltip.cls.tk} (${tooltip.cls.tk - tooltip.cls.tb + 1} tiết)`,
              ],
              [
                "Giờ",
                `${TT[tooltip.cls.tb - 1]?.s} – ${TT[tooltip.cls.tk - 1]?.e}`,
              ],
              [
                "Trạng thái",
                { normal: "Chính thức", makeup: "Dạy bù", cancelled: "Đã hủy" }[
                  tooltip.cls.status
                ],
              ],
              ["Học kỳ", tooltip.cls.hk],
            ].map(([l, v]) => (
              <div key={l} style={s.tipRow}>
                <span style={s.tipLbl}>{l}</span>
                <span style={s.tipVal}>{v}</span>
              </div>
            ))}
          </div>

          {/* Hint */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid rgba(255,255,255,.08)",
              fontSize: 12,
              color: "rgba(255,255,255,.4)",
              textAlign: "center",
            }}
          >
            Nhấn vào buổi dạy để sửa / xóa
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showAdd && (
        <AEModal onSave={saveClass} onClose={() => setShowAdd(false)} />
      )}
      {editCls && (
        <AEModal
          init={editCls}
          onSave={saveClass}
          onClose={() => setEditCls(null)}
        />
      )}
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    animation: "fadeIn .25s ease",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#fff",
    borderRadius: 12,
    padding: "12px 18px",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    flexWrap: "wrap",
    gap: 10,
  },
  weekNav: { display: "flex", alignItems: "center", gap: 12 },
  navBtn: {
    width: 36,
    height: 36,
    border: "1px solid #E5E7EB",
    background: "#F8FAFC",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 700,
    color: "#374151",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  todayBtn: {
    padding: "7px 16px",
    border: "1px solid #E5E7EB",
    background: "#fff",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "#64748B",
  },
  weekRange: { fontSize: 15, fontWeight: 700, color: "#0F172A" },
  weekSub: { fontSize: 13, color: "#DC2626", fontWeight: 600 },
  btnAdd: {
    padding: "9px 20px",
    background: "#DC2626",
    border: "none",
    borderRadius: 9,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  gridWrap: {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    overflow: "hidden",
    flex: 1,
  },
  table: { width: "100%", minWidth: 960, borderCollapse: "collapse" },
  th: {
    padding: "13px 8px",
    textAlign: "center",
    borderBottom: "2px solid #DC2626",
    borderRight: "1px solid #E5E7EB",
    color: "#374151",
    position: "sticky",
    top: 0,
    background: "#FAFAFA",
    zIndex: 5,
    fontSize: 14,
  },
  thToday: { background: "#FEF2F2", color: "#DC2626" },
  td: {
    borderRight: "1px solid #F3F4F6",
    borderBottom: "1px solid #F3F4F6",
    position: "relative",
    height: 50,
  },
  tierCell: {
    width: 74,
    textAlign: "center",
    padding: "4px 2px",
    borderRight: "1px solid #E5E7EB",
    verticalAlign: "middle",
    height: 50,
  },
  brkTier: {
    background: "#FFFDE7",
    borderBottom: "1px dashed #FCD34D",
    padding: "0 4px",
    textAlign: "center",
    height: 10,
  },
  brkCell: {
    background: "#FFFDE7",
    borderBottom: "1px dashed #FCD34D",
    fontSize: 10,
    color: "#B45309",
    textAlign: "center",
    padding: 0,
    height: 10,
  },
  block: {
    position: "absolute",
    inset: "2px 3px",
    borderRadius: 8,
    padding: "7px 9px",
    cursor: "pointer",
    overflow: "hidden",
    borderLeft: "4px solid",
    transition: "box-shadow .12s, opacity .15s",
  },
  tagMakeup: {
    fontSize: 10,
    fontWeight: 700,
    color: "#059669",
    marginBottom: 2,
  },
  tagCancelled: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94A3B8",
    marginBottom: 2,
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    padding: "12px 16px",
    borderTop: "1px solid #F3F4F6",
  },
  lgItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 11px",
    borderRadius: 7,
  },
  lgDot: { width: 11, height: 11, borderRadius: 3, flexShrink: 0 },
  tip: {
    position: "fixed",
    zIndex: 9999,
    background: "#1E293B",
    borderRadius: 13,
    width: 290,
    boxShadow: "0 16px 48px rgba(0,0,0,.5)",
    overflow: "hidden",
    pointerEvents: "none",
  },
  tipHead: { padding: "13px 16px" },
  tipRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "5px 16px",
    borderBottom: "1px solid rgba(255,255,255,.06)",
  },
  tipLbl: { color: "rgba(255,255,255,.5)", fontSize: 13, flexShrink: 0 },
  tipVal: { fontWeight: 600, fontSize: 13, textAlign: "right", color: "#fff" },
};
