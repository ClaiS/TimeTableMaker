import React, { useState, useEffect, useRef } from "react";
import { TT, DF, getColor } from "../shared/data.js";

function getNotifStatus() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function sendNotif(title, body) {
  if (Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    requireInteraction: false,
  });
}

// Parse "HH:MM" → total minutes from midnight
function toMin(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// Get today's day-of-week as thu (2=Mon ... 8=Sun)
function todayThu() {
  const d = new Date().getDay(); // 0=Sun,1=Mon...6=Sat
  return d === 0 ? 8 : d + 1;
}

export default function NotifPage({
  classes,
  settings24h,
  settings1h,
  onSettingsChange,
}) {
  const [permission, setPermission] = useState(getNotifStatus);
  const [settings, setSettings] = useState([
    {
      key: "24h",
      label: "  Nhắc trước 24 giờ",
      sub: "1 ngày trước mỗi buổi dạy",
      on: true,
    },
    {
      key: "1h",
      label: "  Nhắc trước 1 giờ",
      sub: "1 tiếng trước mỗi buổi",
      on: true,
    },
    {
      key: "sfx",
      label: "  Âm thanh",
      sub: "Phát âm khi có nhắc nhở",
      on: false,
    },
  ]);
  const firedRef = useRef(new Set()); // track already-fired notifications this session

  const toggle = (key) =>
    setSettings((p) => p.map((s) => (s.key === key ? { ...s, on: !s.on } : s)));
  const is24h = settings.find((s) => s.key === "24h")?.on;
  const is1h = settings.find((s) => s.key === "1h")?.on;

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      sendNotif(
        "TeacherSync – Thông báo đã bật! ",
        "Bạn sẽ nhận nhắc nhở trước các buổi dạy.",
      );
    }
  };

  const disableNotif = () => {
    alert(
      "Để tắt thông báo, vào cài đặt trình duyệt → Quyền riêng tư → Thông báo → Chặn trang này.",
    );
  };

  // ── Scheduler: check every 60 seconds ──
  useEffect(() => {
    if (permission !== "granted") return;

    const check = () => {
      const now = new Date();
      const nowMin = toMin(`${now.getHours()}:${now.getMinutes()}`);
      const thu = todayThu();
      const tomorrow = thu === 8 ? 2 : thu + 1;

      classes
        .filter((c) => c.status !== "cancelled")
        .forEach((c) => {
          const startMin = toMin(TT[c.tb - 1]?.s);

          // 24h ahead: notify today if class is tomorrow
          if (is24h && c.thu === tomorrow) {
            const fireKey = `24h-${c.id}-${now.toDateString()}`;
            // Fire at the same clock time today as class start time tomorrow
            const diffMin = startMin - nowMin;
            if (
              diffMin >= 0 &&
              diffMin <= 1 &&
              !firedRef.current.has(fireKey)
            ) {
              firedRef.current.add(fireKey);
              sendNotif(
                ` Ngày mai có lớp lúc ${TT[c.tb - 1]?.s}`,
                `${c.ten} · ${c.phong} · Tiết ${c.tb}–${c.tk}`,
              );
            }
          }

          // 1h ahead: notify today if class is today
          if (is1h && c.thu === thu) {
            const fireKey = `1h-${c.id}-${now.toDateString()}`;
            const diffMin = startMin - nowMin;
            if (
              diffMin >= 59 &&
              diffMin <= 61 &&
              !firedRef.current.has(fireKey)
            ) {
              firedRef.current.add(fireKey);
              sendNotif(
                ` 1 giờ nữa có lớp lúc ${TT[c.tb - 1]?.s}`,
                `${c.ten} · ${c.phong} · Tiết ${c.tb}–${c.tk}`,
              );
            }
          }
        });
    };

    check(); // run immediately on mount
    const interval = setInterval(check, 60_000); // then every 60s
    return () => clearInterval(interval);
  }, [permission, classes, is24h, is1h]);

  const bannerCfg = {
    unsupported: {
      bg: "#F1F5F9",
      border: "#CBD5E1",
      icon: "️",
      title: "Trình duyệt không hỗ trợ thông báo",
      sub: "Vui lòng dùng Chrome, Edge hoặc Firefox phiên bản mới.",
    },
    default: {
      bg: "#EFF6FF",
      border: "#93C5FD",
      icon: "",
      title: "Bật thông báo để nhận nhắc nhở",
      sub: "Nhận nhắc nhở ngay trên màn hình trước mỗi buổi dạy.",
    },
    granted: {
      bg: "#F0FDF4",
      border: "#86EFAC",
      icon: "",
      title: "Thông báo đang bật",
      sub: "Bạn sẽ nhận nhắc nhở trước mỗi buổi dạy.",
    },
    denied: {
      bg: "#FEF2F2",
      border: "#FCA5A5",
      icon: "",
      title: "Thông báo đã bị chặn",
      sub: "Vào cài đặt trình duyệt để cấp lại quyền thông báo cho trang này.",
    },
  };
  const cfg = bannerCfg[permission] || bannerCfg.default;

  return (
    <div style={s.page}>
      <div style={s.cols}>
        {/* LEFT */}
        <div style={s.col}>
          {/* Permission banner */}
          <div
            style={{ ...s.banner, background: cfg.bg, borderColor: cfg.border }}
          >
            <span style={s.bannerIcon}>{cfg.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={s.bannerTitle}>{cfg.title}</div>
              <div style={s.bannerSub}>{cfg.sub}</div>
            </div>
            {permission === "default" && (
              <button style={s.bannerBtnAllow} onClick={requestPermission}>
                Cho phép thông báo
              </button>
            )}
            {permission === "granted" && (
              <button style={s.bannerBtnDeny} onClick={disableNotif}>
                Tắt thông báo
              </button>
            )}
          </div>

          {/* How it works */}
          <div style={s.infoBox}>
            <div style={s.infoTitle}>ℹ️ Thông báo hoạt động như thế nào?</div>
            {[
              [
                "1",
                <>
                  Nhấn <strong>"Cho phép thông báo"</strong> — trình duyệt sẽ
                  hỏi xác nhận.
                </>,
              ],
              [
                "2",
                <>
                  Popup thông báo hiện ở <strong>góc màn hình</strong>, kể cả
                  khi đang dùng tab khác.
                </>,
              ],
              [
                "3",
                <>
                  Cần giữ trình duyệt mở. Trang được check{" "}
                  <strong>mỗi phút</strong> để gửi đúng giờ.
                </>,
              ],
            ].map(([n, tx]) => (
              <div key={n} style={s.infoRow}>
                <span style={s.infoNum}>{n}</span>
                <span style={s.infoTx}>{tx}</span>
              </div>
            ))}
          </div>

          {/* Sample */}
          <div style={s.sampleCard}>
            <div style={s.sampleIcon}></div>
            <div>
              <div style={s.sampleLabel}>VÍ DỤ THÔNG BÁO</div>
              <div style={s.sampleTitle}> Ngày mai có lớp lúc 07:30</div>
              <div style={s.sampleSub}>
                Phân tích Thiết kế Hệ thống · E1-07.08 · Tiết 2–6
              </div>
            </div>
          </div>

          {/* Settings */}
          <div style={s.card}>
            <div style={s.cardHead}>Cài đặt thông báo</div>
            {settings.map((setting) => (
              <div key={setting.key} style={s.settingRow}>
                <div style={{ flex: 1 }}>
                  <div style={s.settingLabel}>{setting.label}</div>
                  <div style={s.settingSub}>{setting.sub}</div>
                </div>
                <div
                  style={{
                    ...s.toggle,
                    background: setting.on ? "#DC2626" : "#D1D5DB",
                    opacity: permission !== "granted" ? 0.4 : 1,
                    cursor:
                      permission !== "granted" ? "not-allowed" : "pointer",
                  }}
                  onClick={() =>
                    permission === "granted" && toggle(setting.key)
                  }
                >
                  <div
                    style={{ ...s.toggleThumb, left: setting.on ? 22 : 3 }}
                  />
                </div>
              </div>
            ))}
            {permission !== "granted" && (
              <div style={s.disabledHint}>
                Bật thông báo ở trên để sử dụng các cài đặt này
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — upcoming classes */}
        <div style={s.col}>
          <div style={s.card}>
            <div style={s.cardHead}>Lịch dạy sắp tới</div>
            {classes
              .filter((c) => c.status !== "cancelled")
              .map((c) => {
                const cl = getColor(c);
                const ts = TT[c.tb - 1];
                return (
                  <div key={c.id} style={s.notifRow}>
                    <div style={{ ...s.notifBar, background: cl.br }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ ...s.notifDay, color: cl.br }}>
                        {DF[c.thu - 2]} · Tiết {c.tb}–{c.tk} · {ts?.s}
                      </div>
                      <div style={s.notifName}>{c.ten}</div>
                      <div style={s.notifMeta}>
                        {c.phong} · {c.ma} · {c.truong}
                      </div>
                    </div>
                    <div
                      style={{
                        ...s.notifBadge,
                        background:
                          c.status === "makeup" ? "#D1FAE5" : "#DCFCE7",
                        color: c.status === "makeup" ? "#059669" : "#15803D",
                      }}
                    >
                      {c.status === "makeup" ? "Dạy bù" : "Sắp tới"}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { animation: "fadeIn .25s ease" },
  cols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    alignItems: "start",
  },
  col: { display: "flex", flexDirection: "column", gap: 14 },
  banner: {
    borderRadius: 12,
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    border: "1.5px solid",
  },
  bannerIcon: { fontSize: 26, flexShrink: 0 },
  bannerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 3,
  },
  bannerSub: { fontSize: 13, color: "#475569", lineHeight: 1.5 },
  bannerBtnAllow: {
    padding: "9px 18px",
    background: "#DC2626",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  bannerBtnDeny: {
    padding: "9px 18px",
    background: "#F1F5F9",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    color: "#64748B",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  infoBox: {
    background: "#F8FAFC",
    borderRadius: 10,
    padding: "13px 16px",
    border: "1px solid #E2E8F0",
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 10,
  },
  infoRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  infoNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    background: "#E2E8F0",
    color: "#475569",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  infoTx: { fontSize: 13, color: "#475569", lineHeight: 1.55 },
  sampleCard: {
    background: "#fff",
    borderRadius: 10,
    padding: "13px 14px",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    borderLeft: "4px solid #DC2626",
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
  },
  sampleIcon: {
    width: 40,
    height: 40,
    background: "#FEF2F2",
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    flexShrink: 0,
  },
  sampleLabel: {
    fontSize: 10,
    color: "#DC2626",
    fontWeight: 700,
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  sampleTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 3,
  },
  sampleSub: { fontSize: 12, color: "#94A3B8" },
  card: {
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
    overflow: "hidden",
  },
  cardHead: {
    padding: "12px 16px",
    background: "#FAFAFA",
    borderBottom: "1px solid #F3F4F6",
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
  },
  settingRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 16px",
    borderBottom: "1px solid #F9FAFB",
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0F172A",
    marginBottom: 3,
  },
  settingSub: { fontSize: 12, color: "#94A3B8" },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    position: "relative",
    transition: "background .2s",
    flexShrink: 0,
  },
  toggleThumb: {
    position: "absolute",
    top: 4,
    width: 18,
    height: 18,
    background: "#fff",
    borderRadius: 9,
    transition: "left .2s",
  },
  disabledHint: {
    padding: "10px 16px",
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    borderTop: "1px solid #F3F4F6",
    fontStyle: "italic",
  },
  notifRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid #F9FAFB",
  },
  notifBar: { width: 4, height: 44, borderRadius: 2, flexShrink: 0 },
  notifDay: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  notifName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0F172A",
    marginBottom: 2,
  },
  notifMeta: { fontSize: 11, color: "#94A3B8" },
  notifBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 6,
    flexShrink: 0,
  },
};
