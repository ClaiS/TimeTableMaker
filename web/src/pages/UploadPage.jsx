import { useState } from "react";
import { SCHOOL_LIST, SCHOOL_MAP } from "../shared/data.js";

const SCHOOL_KEYWORDS = {
  HUTECH: ["hutech", "công nghệ tp.hcm", "công nghệ thành phố"],
  BKU: ["bku", "bách khoa hcm", "hcmut"],
  UIT: ["uit", "công nghệ thông tin"],
  UEL: ["uel", "kinh tế - luật"],
  HCMUTE: ["hcmute", "sư phạm kỹ thuật"],
  TDTU: ["tdtu", "tôn đức thắng"],
  HCMUAF: ["hcmuaf", "nông lâm"],
  UEF: ["uef", "kinh tế tài chính"],
  VLU: ["vlu", "văn lang"],
  HUI: ["hui", "công nghiệp tp"],
  HCMUS: ["hcmus", "khoa học tự nhiên"],
};

const API_BASE = "http://127.0.0.1:8000";

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

function detectSchool(name) {
  const t = name.toLowerCase();
  for (const [key, kws] of Object.entries(SCHOOL_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return key;
  }
  return "HUTECH";
}

export default function UploadPage({ onSuccess }) {
  const [st, setSt] = useState("idle"); // idle | progress | done
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [detected, setDetected] = useState("");
  const [dragging, setDragging] = useState(false);

  const doUpload = async (file) => {
    setSt("progress");
    setProgress(20);
    setProgressLabel("Đang tải file...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1. Phân tích OCR / PDF
      setProgress(50);
      setProgressLabel("Phân tích dữ liệu...");
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.detail || "Lỗi upload");

      // 2. Chốt lưu thẳng vào DB
      setProgress(80);
      setProgressLabel("Lưu dữ liệu...");
      const confirmRes = await fetch(
        `${API_BASE}/api/upload/confirm/${uploadData.file_id}`,
        { method: "POST" },
      );
      if (!confirmRes.ok) throw new Error("Lỗi lưu");

      // 3. Lấy lại bộ TKB mới nhất
      setProgress(100);
      setProgressLabel("Hoàn tất!");
      setDetected(uploadData.truong);

      const getRes = await fetch(`${API_BASE}/api/sessions`);
      const finalData = await getRes.json();

      setTimeout(() => {
        setSt("done");
        // Lưu data vào ref/window để ấn Apply thì đẩy ra ngoài
        window.latestUploadedData = finalData.map(mapBEtoFE);
      }, 500);
    } catch (e) {
      console.error(e);
      alert("Đã xảy ra lỗi khi xử lý: " + e.message);
      setSt("idle");
      setProgress(0);
    }
  };

  const apply = () => {
    if (window.latestUploadedData) {
      onSuccess(window.latestUploadedData);
    }
    setSt("idle");
    setProgress(0);
  };

  const cl = SCHOOL_MAP[detected] || {
    bg: "#F1F5F9",
    br: "#64748B",
    tx: "#1E293B",
  };

  return (
    <div style={s.page}>
      <div style={s.left}>
        {/* Info banner */}
        <div style={s.infoBanner}>
          <div style={s.infoIcon}></div>
          <div>
            <div style={s.infoTitle}>Nhận diện tên trường tự động</div>
            <div style={s.infoTx}>
              Hệ thống đọc góc trên trái file PDF/Excel để nhận diện tên trường
              và tự gán màu phân loại.
            </div>
          </div>
        </div>

        {st === "idle" && (
          <>
            {/* Drop zone */}
            <label
              style={{ ...s.dropZone, ...(dragging ? s.dropZoneDrag : {}) }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) doUpload(f);
              }}
            >
              <div style={s.dropIcon}></div>
              <div style={s.dropTitle}>Kéo thả hoặc nhấn để chọn file</div>
              <div style={s.dropSub}>
                Hỗ trợ PDF (.pdf) và Excel (.xlsx, .xls)
              </div>
              <div style={s.dropBtn}>Chọn file</div>
              <input
                type="file"
                accept=".pdf,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doUpload(f);
                }}
              />
            </label>

            {/* Scan note */}
            <div style={s.scanNote}>
              <span style={{ fontSize: 20 }}></span>
              <div>
                <div style={s.scanTitle}>Chụp ảnh / Scan bằng điện thoại</div>
                <div style={s.scanSub}>
                  Tính năng OCR scan có đầy đủ trên app mobile React Native
                </div>
              </div>
            </div>
          </>
        )}

        {st === "progress" && (
          <div style={s.progressBox}>
            <div style={s.progressIcon}>{progress < 70 ? "⬆️" : ""}</div>
            <div style={s.progressTitle}>{progressLabel}</div>
            <div style={s.progressTrack}>
              <div style={{ ...s.progressFill, width: `${progress}%` }} />
            </div>
            <div style={s.progressPct}>{progress}%</div>
          </div>
        )}

        {st === "done" && (
          <div style={s.doneBox}>
            <div style={s.doneHeader}>
              <div style={{ fontSize: 40, marginBottom: 8 }}></div>
              <div style={s.doneTitle}>Phân tích thành công!</div>
              <div style={s.doneSub}>
                Nhận diện trường:{" "}
                <strong style={{ color: cl.br }}>{detected}</strong> · 1 buổi
                dạy mới
              </div>
            </div>
            <div
              style={{
                ...s.donePreview,
                background: cl.bg,
                borderLeftColor: cl.br,
              }}
            >
              <div style={{ ...s.doneCode, color: cl.br }}>
                CS101 · {detected}
              </div>
              <div style={{ ...s.doneName, color: cl.tx }}>Giải tích 1</div>
              <div style={{ ...s.doneMeta, color: cl.br }}>
                Thứ 3 · Tiết 1–5 · Phòng B2-401 · Lớp EE01
              </div>
            </div>
            <div style={s.doneActions}>
              <button style={s.btnCancel} onClick={() => setSt("idle")}>
                Bỏ qua
              </button>
              <button style={s.btnApply} onClick={apply}>
                Cập nhật TKB
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: school legend */}
      <div style={s.right}>
        <div style={s.legendCard}>
          <div style={s.legendTitle}>Màu phân loại theo trường</div>
          {SCHOOL_LIST.map((sch) => (
            <div
              key={sch.key}
              style={{
                ...s.legendRow,
                background: sch.bg,
                borderColor: sch.br,
              }}
            >
              <div style={{ ...s.legendDot, background: sch.br }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: sch.tx }}>
                  {sch.key}
                </div>
                <div style={{ fontSize: 10, color: sch.tx, opacity: 0.75 }}>
                  {sch.full.split("–")[1]?.trim()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    display: "flex",
    gap: 20,
    alignItems: "flex-start",
    animation: "fadeIn .25s ease",
  },
  left: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
  },
  right: { width: 280, flexShrink: 0 },
  infoBanner: {
    background: "#F0F9FF",
    border: "1px solid #BAE6FD",
    borderRadius: 10,
    padding: "12px 14px",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  infoIcon: { fontSize: 22, flexShrink: 0, marginTop: 1 },
  infoTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0369A1",
    marginBottom: 4,
  },
  infoTx: { fontSize: 12, color: "#0284C7", lineHeight: 1.6 },
  dropZone: {
    display: "block",
    border: "2px dashed #D1D5DB",
    borderRadius: 12,
    padding: "36px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all .2s",
    background: "#fff",
  },
  dropZoneDrag: { borderColor: "#DC2626", background: "#FEF2F2" },
  dropIcon: { fontSize: 52, marginBottom: 10 },
  dropTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 5,
  },
  dropSub: { fontSize: 12, color: "#94A3B8", marginBottom: 18 },
  dropBtn: {
    display: "inline-block",
    padding: "10px 28px",
    background: "#DC2626",
    color: "#fff",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
  },
  scanNote: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    background: "#F0FDF4",
    border: "1px solid #BBF7D0",
    borderRadius: 10,
    padding: "12px 16px",
  },
  scanTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#15803D",
    marginBottom: 2,
  },
  scanSub: { fontSize: 11, color: "#16A34A" },
  progressBox: {
    background: "#fff",
    borderRadius: 12,
    padding: 32,
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  progressIcon: { fontSize: 44, marginBottom: 12 },
  progressTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 16,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    background: "#F1F5F9",
    borderRadius: 100,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#DC2626",
    borderRadius: 100,
    transition: "width .5s ease",
  },
  progressPct: { fontSize: 12, color: "#94A3B8", marginTop: 8 },
  doneBox: {
    background: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  doneHeader: {
    padding: "24px",
    textAlign: "center",
    background: "#F0FDF4",
    borderBottom: "1px solid #BBF7D0",
  },
  doneTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#15803D",
    marginBottom: 4,
  },
  doneSub: { fontSize: 12, color: "#16A34A" },
  donePreview: {
    margin: 14,
    borderRadius: 9,
    padding: "12px 14px",
    borderLeft: "4px solid",
  },
  doneCode: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  doneName: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  doneMeta: { fontSize: 11 },
  doneActions: { display: "flex", gap: 8, padding: 14 },
  btnCancel: {
    flex: 1,
    padding: "10px",
    background: "#F8FAFC",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#64748B",
    cursor: "pointer",
  },
  btnApply: {
    flex: 2,
    padding: "10px",
    background: "#DC2626",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
  },
  legendCard: {
    background: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid",
    marginBottom: 5,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
};
