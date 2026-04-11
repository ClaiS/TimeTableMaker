import { useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import FreePage from "./pages/FreePage.jsx";
import NotifPage from "./pages/NotifPage.jsx";
import TKBPage from "./pages/TKBPage.jsx";
import UploadPage from "./pages/UploadPage.jsx";

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

const PAGE_TITLES = {
  tkb: "Thời Khóa Biểu",
  free: "Lịch Trống",
  upload: "Cập Nhật TKB",
  notif: "Thông Báo",
};

const PAGE_ICONS = {
  tkb: "",
  free: "",
  upload: "",
  notif: "",
};

// Detect current semester from class data
// Returns the hk value of the class whose date range is closest to today
function detectSemester(classes) {
  if (!classes.length) return null;
  const today = new Date();
  // Group by hk, count classes
  const hkCount = {};
  classes.forEach((c) => {
    hkCount[c.hk] = (hkCount[c.hk] || 0) + 1;
  });
  // Return hk with most classes (most likely current semester)
  return Object.entries(hkCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// Get next upcoming class for banner
function getNextClass(classes) {
  const now = new Date();
  const todayDow = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon..7=Sun
  const todayThu = todayDow + 1; // our thu: 2=Mon..8=Sun
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Find classes today that haven't started yet, or soonest this week
  const active = classes.filter((c) => c.status !== "cancelled");
  if (!active.length) return null;

  // Sort by (days from today, then start tier)
  const ranked = active
    .map((c) => {
      let daysAhead = c.thu - todayThu;
      if (daysAhead < 0) daysAhead += 7;
      // If same day, check if already passed
      const startParts = (c.startTime || "07:30").split(":");
      const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      if (daysAhead === 0 && startMin < nowMin) daysAhead = 7;
      return { ...c, daysAhead };
    })
    .sort((a, b) => a.daysAhead - b.daysAhead || a.tb - b.tb);

  return ranked[0] || null;
}

export default function App() {
  const [tab, setTab] = useState("tkb");
  const [classes, setClasses] = useState([]);
  const [notifBanner, setNotifBanner] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/sessions`)
      .then((res) => res.json())
      .then((data) => setClasses(data.map(mapBEtoFE)))
      .catch((err) => console.error("Lỗi tải lịch dạy:", err));
  }, []);

  const semester = useMemo(() => detectSemester(classes), [classes]);
  const nextClass = useMemo(() => getNextClass(classes), [classes]);

  const bannerText = nextClass
    ? `Sắp tới: ${nextClass.ten} · Tiết ${nextClass.tb}–${nextClass.tk} · ${nextClass.phong}`
    : "Không có lịch dạy sắp tới";

  return (
    <div style={s.root}>
      <Sidebar active={tab} onChange={setTab} />

      <div style={s.main}>
        {/* Topbar — white background, subtle border */}
        <div style={s.topbar}>
          <div style={s.topbarLeft}>
            <span style={s.pageIcon}>{PAGE_ICONS[tab]}</span>
            <span style={s.topbarTitle}>{PAGE_TITLES[tab]}</span>
          </div>
          <div style={s.topbarRight}>
            {semester && <span style={s.semBadge}>{semester}</span>}
            <button
              style={s.notifBtn}
              onClick={() => setTab("notif")}
              title="Thông báo"
            ></button>
          </div>
        </div>

        {/* Notification banner — soft amber, not jarring */}
        {notifBanner && nextClass && (
          <div style={s.notifBanner}>
            <span style={s.bannerIcon}></span>
            <span style={s.bannerText}>{bannerText}</span>
            <button
              style={s.bannerClose}
              onClick={() => setNotifBanner(false)}
            ></button>
          </div>
        )}

        {/* Content */}
        <div style={s.content}>
          {tab === "tkb" && (
            <TKBPage classes={classes} setClasses={setClasses} />
          )}
          {tab === "free" && <FreePage classes={classes} />}
          {tab === "upload" && (
            <UploadPage
              onSuccess={(newData) => {
                setClasses(newData);
                setTab("tkb");
              }}
            />
          )}
          {tab === "notif" && <NotifPage classes={classes} />}
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { display: "flex", minHeight: "100vh" },
  main: {
    marginLeft: 240,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    minWidth: 0,
  },

  // Topbar: white with subtle bottom border — không chói
  topbar: {
    background: "#fff",
    borderBottom: "1.5px solid #E5E7EB",
    padding: "0 28px",
    height: 62,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  topbarLeft: { display: "flex", alignItems: "center", gap: 10 },
  pageIcon: { fontSize: 22 },
  topbarTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  topbarRight: { display: "flex", alignItems: "center", gap: 12 },
  semBadge: {
    background: "#F1F5F9",
    color: "#475569",
    padding: "5px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    border: "1px solid #E2E8F0",
  },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#F8FAFC",
    border: "1px solid #E5E7EB",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // Banner: soft amber — nhẹ nhàng, không chói
  notifBanner: {
    background: "#FFFBEB",
    borderBottom: "1px solid #FDE68A",
    padding: "11px 28px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  bannerIcon: { fontSize: 16, flexShrink: 0 },
  bannerText: { flex: 1, fontSize: 14, color: "#92400E", fontWeight: 500 },
  bannerClose: {
    background: "none",
    border: "none",
    color: "#B45309",
    fontSize: 18,
    cursor: "pointer",
    opacity: 0.7,
    padding: "2px 4px",
    lineHeight: 1,
  },

  content: { padding: "22px 28px", flex: 1, overflowY: "auto" },
};
