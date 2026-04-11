import React, { useState, useEffect } from "react";
import {
  SCHOOL_LIST,
  getColor,
  gid,
  DF,
  STATUS_LABEL,
} from "../shared/data.js";

const BLANK = {
  ma: "",
  ten: "",
  phong: "",
  lop: "",
  ss: 35,
  tb: 2,
  tk: 6,
  hk: "HK2 25-26",
  thu: 2,
  truong: "HUTECH",
  status: "normal",
};

export default function AEModal({ init, onSave, onClose }) {
  const [f, setF] = useState(init ? { ...init } : { ...BLANK });
  const [schoolQ, setSchoolQ] = useState(init?.truong || "HUTECH");
  const [showDrop, setShowDrop] = useState(false);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const cl = getColor({ ...f, truong: schoolQ });

  const filtered = SCHOOL_LIST.filter(
    (s) =>
      s.key.toLowerCase().includes(schoolQ.toLowerCase()) ||
      s.full.toLowerCase().includes(schoolQ.toLowerCase()),
  );

  const save = () => {
    if (!f.ma.trim() || !f.ten.trim()) {
      alert("Vui lòng nhập Mã môn và Tên môn!");
      return;
    }
    const tb = parseInt(f.tb) || 1;
    const tk = parseInt(f.tk) || tb;
    onSave({
      ...f,
      truong: schoolQ,
      tb,
      tk,
      st: tk - tb + 1,
      id: f.id || gid(),
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const h = () => setShowDrop(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div
        style={s.modal}
        onClick={(e) => e.stopPropagation()}
        className="slide-up"
      >
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>
            {init ? "️  Sửa buổi dạy" : "  Thêm buổi dạy"}
          </span>
          <button style={s.closeBtn} onClick={onClose}></button>
        </div>

        {/* Body */}
        <div style={s.body}>
          <div style={s.grid2}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={s.label}>Mã môn học *</label>
              <input
                style={s.input}
                value={f.ma}
                onChange={(e) => set("ma", e.target.value)}
                placeholder="VD: CMP3019"
              />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={s.label}>Tên môn học *</label>
              <input
                style={s.input}
                value={f.ten}
                onChange={(e) => set("ten", e.target.value)}
                placeholder="Tên học phần"
              />
            </div>
            <div>
              <label style={s.label}>Phòng học</label>
              <input
                style={s.input}
                value={f.phong}
                onChange={(e) => set("phong", e.target.value)}
                placeholder="E1-07.08"
              />
            </div>
            <div>
              <label style={s.label}>Lớp</label>
              <input
                style={s.input}
                value={f.lop}
                onChange={(e) => set("lop", e.target.value)}
                placeholder="01"
              />
            </div>
            <div>
              <label style={s.label}>Thứ</label>
              <select
                style={s.input}
                value={f.thu}
                onChange={(e) => set("thu", parseInt(e.target.value))}
              >
                {DF.map((d, i) => (
                  <option key={i} value={i + 2}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Trạng thái</label>
              <div style={s.statusRow}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => set("status", k)}
                    style={{
                      ...s.statusChip,
                      ...(f.status === k
                        ? k === "makeup"
                          ? s.chipMakeup
                          : k === "cancelled"
                            ? s.chipCancelled
                            : s.chipNormal
                        : {}),
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={s.label}>Tiết bắt đầu</label>
              <input
                style={s.input}
                type="number"
                min={1}
                max={15}
                value={f.tb}
                onChange={(e) => set("tb", e.target.value)}
              />
            </div>
            <div>
              <label style={s.label}>Tiết kết thúc</label>
              <input
                style={s.input}
                type="number"
                min={1}
                max={15}
                value={f.tk}
                onChange={(e) => set("tk", e.target.value)}
              />
            </div>
            <div>
              <label style={s.label}>Sĩ số</label>
              <input
                style={s.input}
                type="number"
                value={f.ss}
                onChange={(e) => set("ss", e.target.value)}
              />
            </div>
            <div>
              <label style={s.label}>Học kỳ</label>
              <input
                style={s.input}
                value={f.hk}
                onChange={(e) => set("hk", e.target.value)}
              />
            </div>

            {/* School input */}
            <div
              style={{ gridColumn: "1/-1", position: "relative" }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <label style={s.label}>
                Trường{" "}
                <span style={{ fontWeight: 400, color: "#94A3B8" }}>
                  (nhập tay hoặc chọn)
                </span>
              </label>
              <input
                style={{ ...s.input, borderColor: cl.br, borderWidth: 1.5 }}
                value={schoolQ}
                onChange={(e) => {
                  setSchoolQ(e.target.value);
                  setShowDrop(true);
                }}
                onFocus={() => setShowDrop(true)}
                placeholder="HUTECH, BKU, UIT..."
              />
              {/* Preview */}
              <div
                style={{
                  ...s.schoolPreview,
                  background: cl.bg,
                  borderColor: cl.br,
                }}
              >
                <div style={{ ...s.schoolSwatch, background: cl.br }} />
                <span style={{ fontSize: 12, color: cl.tx, fontWeight: 600 }}>
                  {schoolQ || "Nhập tên trường để xem màu"}
                </span>
              </div>
              {/* Dropdown */}
              {showDrop && filtered.length > 0 && (
                <div style={s.dropdown}>
                  {filtered.map((sch) => (
                    <div
                      key={sch.key}
                      style={s.dropItem}
                      onMouseDown={() => {
                        setSchoolQ(sch.key);
                        set("truong", sch.key);
                        setShowDrop(false);
                      }}
                    >
                      <div style={{ ...s.dropDot, background: sch.br }} />
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#0F172A",
                          }}
                        >
                          {sch.key}
                        </div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>
                          {sch.full}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.btnCancel} onClick={onClose}>
            Hủy
          </button>
          <button style={s.btnSave} onClick={save}>
            {" "}
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.45)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modal: {
    background: "#fff",
    borderRadius: 14,
    width: 520,
    maxWidth: "100%",
    maxHeight: "92vh",
    overflowY: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,.25)",
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    background: "#fff",
    zIndex: 10,
  },
  title: { fontSize: 15, fontWeight: 700, color: "#0F172A" },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: 20,
    color: "#94A3B8",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 6,
  },
  body: { padding: 20 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  label: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: 700,
    display: "block",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    color: "#0F172A",
    background: "#fff",
    outline: "none",
    transition: "border-color .15s",
    marginBottom: 0,
  },
  statusRow: { display: "flex", gap: 6 },
  statusChip: {
    flex: 1,
    padding: "9px 8px",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: "#64748B",
    background: "#fff",
    cursor: "pointer",
    transition: "all .15s",
  },
  chipNormal: {
    background: "#EFF6FF",
    borderColor: "#2563EB",
    color: "#1D4ED8",
  },
  chipMakeup: {
    background: "#D1FAE5",
    borderColor: "#059669",
    color: "#059669",
  },
  chipCancelled: {
    background: "#F1F5F9",
    borderColor: "#94A3B8",
    color: "#475569",
  },
  schoolPreview: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1.5px solid",
    marginTop: 8,
    marginBottom: 4,
  },
  schoolSwatch: { width: 14, height: 14, borderRadius: 4, flexShrink: 0 },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,.12)",
    zIndex: 50,
    maxHeight: 220,
    overflowY: "auto",
  },
  dropItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "1px solid #F8FAFC",
    transition: "background .1s",
  },
  dropDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  footer: {
    padding: "14px 20px",
    borderTop: "1px solid #E5E7EB",
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    position: "sticky",
    bottom: 0,
    background: "#fff",
  },
  btnCancel: {
    padding: "9px 20px",
    background: "#F8FAFC",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#64748B",
    cursor: "pointer",
  },
  btnSave: {
    padding: "9px 24px",
    background: "#DC2626",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
  },
};
