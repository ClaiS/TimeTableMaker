import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import UploadScreen from "./UploadScreen";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const API_BASE = "http://127.0.0.1:8000"; // Đổi thành IP LAN của bạn nếu chạy trên điện thoại thật (VD: http://192.168.1.5:8000)

// Hàm chuyển đổi data từ Backend -> Frontend
const mapBEtoFE = (item) => ({
  id: item.id,
  ma: item.ma_mon,
  ten: item.ten_mon,
  lop: item.ten_lop || item.nhom || "01",
  ss: item.si_so || 0,
  thu: item.thu,
  tb: item.tiet_bat_dau,
  tk: item.tiet_ket_thuc,
  phong: item.phong || "Chưa rõ",
  truong: item.truong || "OTHER",
  hk: item.hoc_ky || "HK2",
  status: item.status || "normal",
  date_ranges: item.date_ranges || [],
});

// Hàm chuyển đổi data từ Frontend -> Backend
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

function isDateInRanges(targetDate, dateRanges) {
  if (!dateRanges || dateRanges.length === 0) return true;

  // Chuẩn hóa targetDate về 00:00:00
  const tTime = new Date(targetDate).setHours(0, 0, 0, 0);

  return dateRanges.some((rangeStr) => {
    const parts = rangeStr.split("-").map((s) => s.trim());

    // Helper parse "DD/MM/YYYY" -> timestamp
    const parseD = (str) => {
      const [d, m, y] = str.split("/");
      return new Date(y, m - 1, d).setHours(0, 0, 0, 0);
    };

    if (parts.length === 2) {
      return tTime >= parseD(parts[0]) && tTime <= parseD(parts[1]);
    } else if (parts.length === 1) {
      return tTime === parseD(parts[0]);
    }
    return false;
  });
}

const { width: SW } = Dimensions.get("window");

// ─── DESIGN TOKENS (mirror web) ───
const C = {
  // Neutral — white header like web
  white: "#FFFFFF",
  bg: "#F4F6F9",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  border2: "#F3F4F6",
  text: "#0F172A",
  text2: "#475569",
  text3: "#94A3B8",
  // Red accent
  red: "#DC2626",
  red2: "#B91C1C",
  redL: "#FEF2F2",
  redBd: "#FCA5A5",
  // Amber banner (same as web)
  amber: "#FFFBEB",
  amberBd: "#FDE68A",
  amberTx: "#92400E",
  // Status
  green: "#059669",
  greenL: "#D1FAE5",
};

// ─── SCHOOL COLORS (same as web) ───
const SCHOOL_LIST = [
  {
    key: "HUTECH",
    full: "HUTECH – ĐH Công nghệ TP.HCM",
    bg: "#DBEAFE",
    br: "#2563EB",
    tx: "#1E3A8A",
  },
  {
    key: "BKU",
    full: "BKU – ĐH Bách Khoa TP.HCM",
    bg: "#FEF3C7",
    br: "#D97706",
    tx: "#78350F",
  },
  {
    key: "UIT",
    full: "UIT – ĐH Công nghệ Thông tin",
    bg: "#D1FAE5",
    br: "#059669",
    tx: "#064E3B",
  },
  {
    key: "UEL",
    full: "UEL – ĐH Kinh tế - Luật",
    bg: "#EDE9FE",
    br: "#7C3AED",
    tx: "#2E1065",
  },
  {
    key: "HCMUTE",
    full: "HCMUTE – ĐH Sư phạm Kỹ thuật TP.HCM",
    bg: "#FCE7F3",
    br: "#DB2777",
    tx: "#831843",
  },
  {
    key: "TDTU",
    full: "TDTU – ĐH Tôn Đức Thắng",
    bg: "#CCFBF1",
    br: "#0D9488",
    tx: "#042F2E",
  },
  {
    key: "HCMUAF",
    full: "HCMUAF – ĐH Nông Lâm TP.HCM",
    bg: "#FEF9C3",
    br: "#CA8A04",
    tx: "#713F12",
  },
  {
    key: "UEF",
    full: "UEF – ĐH Kinh tế - Tài chính",
    bg: "#FFF7ED",
    br: "#EA580C",
    tx: "#7C2D12",
  },
  {
    key: "VLU",
    full: "VLU – ĐH Văn Lang",
    bg: "#ECFDF5",
    br: "#16A34A",
    tx: "#14532D",
  },
  {
    key: "HUI",
    full: "HUI – ĐH Công nghiệp TP.HCM",
    bg: "#FDF4FF",
    br: "#A21CAF",
    tx: "#4A044E",
  },
  {
    key: "HCMUS",
    full: "HCMUS – ĐH Khoa học Tự nhiên",
    bg: "#ECFEFF",
    br: "#0891B2",
    tx: "#164E63",
  },
  {
    key: "OTHER",
    full: "Trường khác / Nhập tay",
    bg: "#F1F5F9",
    br: "#64748B",
    tx: "#1E293B",
  },
];
const SCHOOL_MAP = Object.fromEntries(SCHOOL_LIST.map((s) => [s.key, s]));

function hashColor(str) {
  const P = [
    { bg: "#FEF9C3", br: "#CA8A04", tx: "#713F12" },
    { bg: "#FCE7F3", br: "#9D174D", tx: "#831843" },
    { bg: "#ECFDF5", br: "#047857", tx: "#022C22" },
    { bg: "#EFF6FF", br: "#1D4ED8", tx: "#1E3A8A" },
    { bg: "#FFF7ED", br: "#C2410C", tx: "#7C2D12" },
    { bg: "#F5F3FF", br: "#6D28D9", tx: "#2E1065" },
  ];
  let h = 0;
  for (let i = 0; i < str.length; i++)
    h = (h * 31 + str.charCodeAt(i)) & 0xffffff;
  return P[Math.abs(h) % P.length];
}

function getColor(cls) {
  if (cls.status === "makeup")
    return { bg: "#D1FAE5", br: "#059669", tx: "#064E3B" };
  if (cls.status === "cancelled")
    return { bg: "#F1F5F9", br: "#94A3B8", tx: "#64748B" };
  const key = (cls.truong || "").trim().toUpperCase();
  if (SCHOOL_MAP[key]) return SCHOOL_MAP[key];
  const found = SCHOOL_LIST.find((s) => s.full.toUpperCase().includes(key));
  return found || hashColor(key || "OTHER");
}

// ─── TIER DATA ───
const TT = [
  { n: 1, s: "06:45", e: "07:30", sess: "S" },
  { n: 2, s: "07:30", e: "08:15", sess: "S" },
  { n: 3, s: "08:15", e: "09:00", sess: "S" },
  { n: 4, s: "09:20", e: "10:05", sess: "S" },
  { n: 5, s: "10:05", e: "10:50", sess: "S" },
  { n: 6, s: "10:50", e: "11:35", sess: "S" },
  { n: 7, s: "12:30", e: "13:15", sess: "C" },
  { n: 8, s: "13:15", e: "14:00", sess: "C" },
  { n: 9, s: "14:00", e: "14:45", sess: "C" },
  { n: 10, s: "15:05", e: "15:50", sess: "C" },
  { n: 11, s: "15:50", e: "16:35", sess: "C" },
  { n: 12, s: "16:35", e: "17:20", sess: "C" },
  { n: 13, s: "18:00", e: "18:45", sess: "T" },
  { n: 14, s: "18:45", e: "19:30", sess: "T" },
  { n: 15, s: "19:30", e: "20:15", sess: "T" },
];
const DF = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const DF_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const STATUS_LABEL = {
  normal: "Chính thức",
  makeup: "Dạy bù",
  cancelled: "Đã hủy",
};

let _nid = 100;
const gid = () => ++_nid;

// ─── DATE HELPERS ───
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtShort(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function detectSemester(classes) {
  if (!classes.length) return null;
  const cnt = {};
  classes.forEach((c) => {
    cnt[c.hk] = (cnt[c.hk] || 0) + 1;
  });
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// ════════════════════════════════════════
// DETAIL BOTTOM SHEET
// ════════════════════════════════════════
function DetailSheet({ cls, onClose, onEdit, onDelete, onCancel, onRestore }) {
  if (!cls) return null;
  const cl = getColor(cls);
  const ts = TT[cls.tb - 1],
    te = TT[cls.tk - 1];
  const rows = [
    ["Mã môn", cls.ma],
    ["Phòng học", cls.phong],
    ["Trường", cls.truong],
    ["Lớp", cls.lop],
    ["Sĩ số", `${cls.ss} sinh viên`],
    ["Thứ", DF[cls.thu - 2] || ""],
    ["Giờ học", `${ts?.s} – ${te?.e}`],
    ["Tiết", `${cls.tb}–${cls.tk} (${cls.tk - cls.tb + 1} tiết)`],
    ["Học kỳ", cls.hk],
    ["Trạng thái", STATUS_LABEL[cls.status] || ""],
  ];
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={st.sheetOverlay}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={st.sheet}>
        <View style={st.sheetHandle} />
        {/* Header card — same color as web block */}
        <View
          style={[
            st.detailHeader,
            { backgroundColor: cl.bg, borderLeftColor: cl.br },
          ]}
        >
          <Text style={[st.detailCode, { color: cl.br }]}>{cls.ma}</Text>
          <Text style={[st.detailName, { color: cl.tx }]}>{cls.ten}</Text>
          <View style={[st.statusPill, { backgroundColor: cl.br + "22" }]}>
            <Text style={[st.statusPillTx, { color: cl.br }]}>
              {STATUS_LABEL[cls.status]}
            </Text>
          </View>
        </View>
        {/* Info rows */}
        <ScrollView style={{ maxHeight: 300 }}>
          {rows.map(([l, v]) => (
            <View key={l} style={st.detailRow}>
              <Text style={st.detailLbl}>{l}</Text>
              <Text style={st.detailVal}>{v}</Text>
            </View>
          ))}
        </ScrollView>
        {/* Actions */}
        <View style={st.sheetActions}>
          <TouchableOpacity style={[st.sheetBtn, st.btnEdit]} onPress={onEdit}>
            <Text style={st.btnEditTx}>️ Sửa</Text>
          </TouchableOpacity>
          {cls.status !== "cancelled" ? (
            <TouchableOpacity
              style={[st.sheetBtn, st.btnCancel]}
              onPress={onCancel}
            >
              <Text style={st.btnCancelTx}> Hủy buổi</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[st.sheetBtn, st.btnRestore]}
              onPress={onRestore}
            >
              <Text style={st.btnRestoreTx}>↩️ Khôi phục</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[st.sheetBtn, st.btnDel]} onPress={onDelete}>
            <Text style={st.btnDelTx}>️ Xóa</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={st.sheetClose} onPress={onClose}>
          <Text style={st.sheetCloseTx}>Đóng</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════
// ADD / EDIT MODAL
// ════════════════════════════════════════
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

function AEModal({ init, onSave, onClose }) {
  const [f, setF] = useState(init ? { ...init } : { ...BLANK });
  const [schoolQ, setSchoolQ] = useState(init?.truong || "HUTECH");
  const [showDrop, setShowDrop] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const cl = getColor({ ...f, truong: schoolQ, status: "normal" });
  const filtered = SCHOOL_LIST.filter(
    (s) =>
      s.key.toLowerCase().includes(schoolQ.toLowerCase()) ||
      s.full.toLowerCase().includes(schoolQ.toLowerCase()),
  );
  const save = () => {
    if (!f.ma.trim() || !f.ten.trim()) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập Mã môn và Tên môn!");
      return;
    }
    const tb = parseInt(f.tb) || 1,
      tk = parseInt(f.tk) || tb;
    onSave({
      ...f,
      truong: schoolQ,
      tb,
      tk,
      st: tk - tb + 1,
      id: f.id || gid(),
    });
  };
  const IS = st.formInput;
  const LS = st.formLabel;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.aeOverlay}>
        <View style={st.aeModal}>
          <View style={st.aeHeader}>
            <Text style={st.aeTitle}>
              {init ? "️  Sửa buổi dạy" : "  Thêm buổi dạy"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 22, color: C.text3 }}></Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16 }}
          >
            <Text style={LS}>Mã môn học *</Text>
            <TextInput
              style={IS}
              value={f.ma}
              onChangeText={(v) => set("ma", v)}
              placeholder="VD: CMP3019"
              placeholderTextColor={C.text3}
            />
            <Text style={LS}>Tên môn học *</Text>
            <TextInput
              style={[IS, { height: 72, textAlignVertical: "top" }]}
              value={f.ten}
              onChangeText={(v) => set("ten", v)}
              placeholder="Tên học phần"
              multiline
              placeholderTextColor={C.text3}
            />
            {/* Thứ chips */}
            <Text style={LS}>Thứ</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
            >
              {DF.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => set("thu", i + 2)}
                  style={[st.chip, f.thu === i + 2 && st.chipActive]}
                >
                  <Text style={[st.chipTx, f.thu === i + 2 && st.chipTxActive]}>
                    {DF_SHORT[i]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Status */}
            <Text style={LS}>Trạng thái</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => set("status", k)}
                  style={[
                    st.statusBtn,
                    f.status === k && k === "normal" && st.statusBtnNormal,
                    f.status === k && k === "makeup" && st.statusBtnMakeup,
                    f.status === k &&
                      k === "cancelled" &&
                      st.statusBtnCancelled,
                  ]}
                >
                  <Text
                    style={[
                      st.statusBtnTx,
                      f.status === k && k === "normal" && { color: "#1D4ED8" },
                      f.status === k && k === "makeup" && { color: C.green },
                      f.status === k &&
                        k === "cancelled" && { color: "#64748B" },
                    ]}
                  >
                    {v}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* 2-col grid */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={LS}>Phòng học</Text>
                <TextInput
                  style={IS}
                  value={f.phong}
                  onChangeText={(v) => set("phong", v)}
                  placeholder="E1-07.08"
                  placeholderTextColor={C.text3}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={LS}>Lớp</Text>
                <TextInput
                  style={IS}
                  value={f.lop}
                  onChangeText={(v) => set("lop", v)}
                  placeholder="01"
                  placeholderTextColor={C.text3}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={LS}>Tiết bắt đầu</Text>
                <TextInput
                  style={IS}
                  keyboardType="number-pad"
                  value={String(f.tb)}
                  onChangeText={(v) => set("tb", v)}
                  placeholderTextColor={C.text3}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={LS}>Tiết kết thúc</Text>
                <TextInput
                  style={IS}
                  keyboardType="number-pad"
                  value={String(f.tk)}
                  onChangeText={(v) => set("tk", v)}
                  placeholderTextColor={C.text3}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={LS}>Sĩ số</Text>
                <TextInput
                  style={IS}
                  keyboardType="number-pad"
                  value={String(f.ss)}
                  onChangeText={(v) => set("ss", v)}
                  placeholderTextColor={C.text3}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={LS}>Học kỳ</Text>
                <TextInput
                  style={IS}
                  value={f.hk}
                  onChangeText={(v) => set("hk", v)}
                  placeholderTextColor={C.text3}
                />
              </View>
            </View>
            {/* School */}
            <Text style={LS}>Trường</Text>
            <TextInput
              style={[IS, { borderColor: cl.br, borderWidth: 1.5 }]}
              value={schoolQ}
              onChangeText={(v) => {
                setSchoolQ(v);
                setShowDrop(true);
              }}
              onFocus={() => setShowDrop(true)}
              placeholder="HUTECH, BKU..."
              placeholderTextColor={C.text3}
            />
            <View
              style={[
                st.schoolPreview,
                { backgroundColor: cl.bg, borderColor: cl.br },
              ]}
            >
              <View style={[st.schoolDot, { backgroundColor: cl.br }]} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: cl.tx }}>
                {schoolQ || "Nhập tên trường"}
              </Text>
            </View>
            {showDrop && filtered.length > 0 && (
              <View style={st.dropdown}>
                {filtered.slice(0, 8).map((sch) => (
                  <TouchableOpacity
                    key={sch.key}
                    style={st.dropItem}
                    onPress={() => {
                      setSchoolQ(sch.key);
                      set("truong", sch.key);
                      setShowDrop(false);
                    }}
                  >
                    <View style={[st.dropDot, { backgroundColor: sch.br }]} />
                    <View>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: C.text,
                        }}
                      >
                        {sch.key}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.text3 }}>
                        {sch.full}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={st.aeFooter}>
            <TouchableOpacity style={st.btnSecondary} onPress={onClose}>
              <Text style={st.btnSecondaryTx}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.btnPrimary} onPress={save}>
              <Text style={st.btnPrimaryTx}> Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════
// TKB SCREEN — list by day
// ════════════════════════════════════════
function TKBScreen({
  classes,
  onPick,
  onAdd,
  weekOffset,
  onWeekChange,
  getConflictingClass,
  handleResolveConflict,
}) {
  const base = getMonday(new Date());
  const ws = addDays(base, weekOffset * 7);
  const we = addDays(ws, 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = {};
  for (let i = 0; i < 7; i++) grouped[i + 2] = [];
  classes.forEach((c) => {
    if (grouped[c.thu]) grouped[c.thu].push(c);
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Week bar — white, like web */}
      <View style={st.weekBar}>
        <TouchableOpacity
          style={st.weekNavBtn}
          onPress={() => onWeekChange(-1)}
        >
          <Text style={st.weekNavTx}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={st.weekRange}>
            {fmtShort(ws)} – {fmtShort(we)}
          </Text>
        </View>
        <TouchableOpacity style={st.weekNavBtn} onPress={() => onWeekChange(1)}>
          <Text style={st.weekNavTx}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.todayBtn}
          onPress={() => onWeekChange(-weekOffset)}
        >
          <Text style={st.todayBtnTx}>Hôm nay</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>
        {[2, 3, 4, 5, 6, 7, 8].map((thu, idx) => {
          const dayClasses = grouped[thu] || [];
          const dayDate = addDays(ws, idx);
          const validDayClasses = dayClasses.filter((c) =>
            isDateInRanges(dayDate, c.date_ranges),
          );
          const isToday = dayDate.getTime() === today.getTime();
          return (
            <View key={thu} style={{ marginBottom: 12 }}>
              {/* Day header — red text for today */}
              <View style={st.dayHeader}>
                <Text style={[st.dayHeaderTx, isToday && { color: C.red }]}>
                  {DF[idx]}, {fmtShort(dayDate)}
                </Text>
                {isToday && <View style={st.todayDot} />}
              </View>
              {validDayClasses.length === 0 ? (
                <View style={st.emptyDay}>
                  <Text style={st.emptyDayTx}>Không có lịch dạy</Text>
                </View>
              ) : (
                validDayClasses.map((c) => {
                  const cl = getColor(c);
                  const ts = TT[c.tb - 1],
                    te = TT[c.tk - 1];
                  const cancelled = c.status === "cancelled";
                  const makeup = c.status === "makeup";
                  return (
                    <TouchableOpacity
                      key={c.id}
                      activeOpacity={0.82}
                      style={[
                        st.classCard,
                        {
                          borderLeftColor: cl.br,
                          backgroundColor: cl.bg,
                          opacity: cancelled ? 0.65 : 1,
                        },
                      ]}
                      onPress={() => onPick(c)}
                    >
                      <View style={{ flex: 1 }}>
                        {makeup && <Text style={st.tagMakeup}>DẠY BÙ</Text>}
                        {cancelled && (
                          <Text style={st.tagCancelled}>ĐÃ HỦY</Text>
                        )}
                        <Text style={[st.classCode, { color: cl.br }]}>
                          {c.ma}
                        </Text>
                        <Text
                          style={[
                            st.className,
                            { color: cancelled ? C.text3 : cl.tx },
                          ]}
                        >
                          {c.ten}
                        </Text>
                        <Text
                          style={[
                            st.classRoom,
                            { color: cancelled ? C.text3 : cl.br },
                          ]}
                        >
                          {c.phong} · Lớp {c.lop}
                        </Text>

                        {/* NÚT BÁO TRÙNG LỊCH */}
                        {(() => {
                          // Bắt buộc phải truyền prop getConflictingClass và handleResolveConflict xuống TKBScreen nhé
                          const conflict = getConflictingClass(c);
                          if (conflict) {
                            return (
                              <TouchableOpacity
                                activeOpacity={0.7}
                                style={{
                                  backgroundColor: "#FEF2F2",
                                  paddingVertical: 4,
                                  paddingHorizontal: 8,
                                  borderRadius: 6,
                                  marginTop: 8,
                                  alignSelf: "flex-start",
                                  borderWidth: 1,
                                  borderColor: "#FCA5A5",
                                }}
                                onPress={() =>
                                  handleResolveConflict(c, conflict)
                                }
                              >
                                <Text
                                  style={{
                                    color: "#DC2626",
                                    fontSize: 11,
                                    fontWeight: "700",
                                  }}
                                >
                                  {" "}
                                  Trùng lịch
                                </Text>
                              </TouchableOpacity>
                            );
                          }
                          return null;
                        })()}
                      </View>
                      <View
                        style={[
                          st.tierBadge,
                          { borderColor: cl.br, backgroundColor: cl.br + "18" },
                        ]}
                      >
                        <Text style={[st.tierBadgeTx, { color: cl.br }]}>
                          T{c.tb}–{c.tk}
                        </Text>
                        <Text style={[st.tierTime, { color: cl.br }]}>
                          {ts?.s}
                        </Text>
                        <Text style={[st.tierTime, { color: cl.br }]}>
                          {te?.e}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          );
        })}
      </ScrollView>
      {/* FAB */}
      <TouchableOpacity style={st.fab} onPress={onAdd}>
        <Text style={st.fabTx}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ════════════════════════════════════════
// FREE SLOTS SCREEN
// ════════════════════════════════════════
const SESSIONS = [
  {
    key: "S",
    label: "Sáng",
    from: 1,
    to: 6,
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FCD34D",
  },
  {
    key: "C",
    label: "Chiều",
    from: 7,
    to: 12,
    color: "#4C1D95",
    bg: "#F5F3FF",
    border: "#A78BFA",
  },
  {
    key: "T",
    label: "Tối",
    from: 13,
    to: 15,
    color: "#064E3B",
    bg: "#F0FDF4",
    border: "#6EE7B7",
  },
];

function freeRanges(occ, from, to) {
  const res = [];
  let st = null;
  for (let t = from; t <= to; t++) {
    if (!occ.has(t)) {
      if (st === null) st = t;
    } else {
      if (st !== null) {
        res.push({ f: st, t: t - 1 });
        st = null;
      }
    }
  }
  if (st !== null) res.push({ f: st, t: to });
  return res;
}

// ════════════════════════════════════════
// FREE SLOTS SCREEN (Đã fix lỗi Text strings)
// ════════════════════════════════════════
function FreeScreen({ classes, weekOffset, onWeekChange }) {
  const [filter, setFilter] = useState(null);

  const base = getMonday(new Date());
  const ws = addDays(base, weekOffset * 7);
  const we = addDays(ws, 6);

  const days = DF.map((dn, idx) => {
    const thu = idx + 2;
    const dayDate = addDays(ws, idx);

    const dcs = classes.filter(
      (c) =>
        c.thu === thu &&
        c.status !== "cancelled" &&
        isDateInRanges(dayDate, c.date_ranges),
    );

    const occ = new Set();
    dcs.forEach((c) => {
      for (let t = c.tb; t <= c.tk; t++) occ.add(t);
    });

    const sessions = SESSIONS.map((sess) => ({
      ...sess,
      ranges: freeRanges(occ, sess.from, sess.to),
    })).filter((s) => s.ranges.length > 0);

    return { dn, idx, thu, dcs, sessions, dayDate };
  });

  const shown = filter !== null ? [days[filter]] : days;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={st.weekBar}>
        <TouchableOpacity
          style={st.weekNavBtn}
          onPress={() => onWeekChange(-1)}
        >
          <Text style={st.weekNavTx}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={st.weekRange}>
            {fmtShort(ws)} – {fmtShort(we)}
          </Text>
        </View>
        <TouchableOpacity style={st.weekNavBtn} onPress={() => onWeekChange(1)}>
          <Text style={st.weekNavTx}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.todayBtn}
          onPress={() => onWeekChange(-weekOffset)}
        >
          <Text style={st.todayBtnTx}>Hôm nay</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row" }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            backgroundColor: C.white,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
            maxHeight: 52,
            flex: 1,
          }}
          contentContainerStyle={{ padding: 10, gap: 6, flexDirection: "row" }}
        >
          {["Tất cả", ...DF_SHORT].map((d, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setFilter(i === 0 ? null : i - 1)}
              style={[
                st.filterChip,
                (i === 0 ? filter === null : filter === i - 1) &&
                  st.filterChipActive,
              ]}
            >
              <Text
                style={[
                  st.filterChipTx,
                  (i === 0 ? filter === null : filter === i - 1) &&
                    st.filterChipTxActive,
                ]}
              >
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
        {shown.map((day) => (
          <View key={day.thu} style={st.freeCard}>
            <View style={st.freeCardHead}>
              <Text style={st.freeCardDay}>
                {day.dn}, {fmtShort(day.dayDate)}
              </Text>
            </View>

            {day.sessions.length === 0 ? (
              <Text style={st.freeEmptyTx}>Không có tiết trống</Text>
            ) : (
              day.sessions.map((sess) => (
                <View key={sess.key}>
                  <View
                    style={[
                      st.sessLabel,
                      {
                        backgroundColor: sess.bg,
                        borderLeftColor: sess.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: sess.color,
                      }}
                    >
                      {sess.label} (T{sess.from}–{sess.to})
                    </Text>
                  </View>
                  {sess.ranges.map((sl, si) => (
                    <View key={si} style={st.freeSlot}>
                      <View style={st.freeDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.freeSlotTier}>
                          {sl.f === sl.t
                            ? `Tiết ${sl.f}`
                            : `Tiết ${sl.f}–${sl.t}`}
                        </Text>
                        <Text style={st.freeSlotTime}>
                          {TT[sl.f - 1]?.s} → {TT[sl.t - 1]?.e}
                          {sl.f !== sl.t ? ` · ${sl.t - sl.f + 1} tiết` : ""}
                        </Text>
                      </View>
                      <View style={st.freeTag}>
                        <Text style={st.freeTagTx}>Trống</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}

            {day.dcs.length > 0 && (
              <View style={st.occWrap}>
                <Text style={st.occLabel}>Đã có lịch:</Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  {day.dcs.map((c) => {
                    const cl = getColor(c);
                    return (
                      <View
                        key={c.id}
                        style={[
                          st.occChip,
                          { backgroundColor: cl.bg, borderColor: cl.br },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "600",
                            color: cl.tx,
                          }}
                        >
                          T{c.tb}–{c.tk}: {c.ma}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ════════════════════════════════════════
// NOTIFICATIONS SCREEN
// ════════════════════════════════════════
// ════════════════════════════════════════
// NOTIFICATIONS SCREEN (Chỉ Cài đặt - Tối giản)
// ════════════════════════════════════════
function NotifScreen() {
  // Đã xóa prop { classes } vì không dùng nữa
  const [settings, setSettings] = useState([
    {
      key: "24h",
      label: "Nhắc trước 24 giờ",
      sub: "1 ngày trước mỗi buổi dạy",
      on: true,
    },
    {
      key: "1h",
      label: "Nhắc trước 1 giờ",
      sub: "1 tiếng trước mỗi buổi",
      on: true,
    },
    { key: "sfx", label: "Âm thanh", sub: "Phát âm khi có nhắc", on: false },
  ]);

  const toggle = async (key) => {
    const newSettings = settings.map((s) =>
      s.key === key ? { ...s, on: !s.on } : s,
    );
    setSettings(newSettings);

    const toggledItem = newSettings.find((s) => s.key === key);

    // Nếu gạt BẬT -> Xin quyền luôn
    if (toggledItem.on && (key === "24h" || key === "1h")) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Yêu cầu bật quyền thông báo ứng dụng",
          "Vào Cài đặt > Ứng dụng > Scan lịch dạy > Thông báo và chọn cho phép quyền theo yêu cầu.",
        );
      }
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
    >
      <View style={st.card}>
        <Text style={st.cardHead}>Cài đặt thông báo</Text>
        {settings.map((s) => (
          <View key={s.key} style={st.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.settingLabel}>{s.label}</Text>
              <Text style={st.settingSub}>{s.sub}</Text>
            </View>
            <Switch
              value={s.on}
              onValueChange={() => toggle(s.key)}
              trackColor={{ false: "#D1D5DB", true: C.red }}
              thumbColor={C.white}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ════════════════════════════════════════
// BOTTOM NAV
// ════════════════════════════════════════
const TABS = [
  { id: "tkb", ic: "", label: "Lịch dạy" },
  { id: "free", ic: "", label: "Lịch trống" },
  { id: "upload", ic: "", label: "Upload" },
  { id: "notif", ic: "", label: "Nhắc nhở" },
];
function BottomNav({ active, onChange }) {
  return (
    <View style={st.bottomNav}>
      {TABS.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={[st.navItem, active === t.id && st.navItemActive]}
          onPress={() => onChange(t.id)}
        >
          <Text style={[st.navLabel, active === t.id && st.navLabelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════
const PAGE_TITLES = {
  tkb: "Thời Khóa Biểu",
  free: "Lịch Trống",
  upload: "Cập Nhật TKB",
  notif: "Thông Báo",
};
const PAGE_ICONS = { tkb: "", free: "", upload: "", notif: "" };

export default function App() {
  const [notifOn, setNotifOn] = useState(false); // Công tắc tổng
  const [is24h, setIs24h] = useState(true);
  const [is1h, setIs1h] = useState(true);
  const [tab, setTab] = useState("tkb");
  const [classes, setClasses] = useState([]);
  const [sel, setSel] = useState(null);
  const [editCls, setEditCls] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const semester = useMemo(() => detectSemester(classes), [classes]);

  const syncNotifications = async (
    currentClasses,
    config = { notifOn, is24h, is1h },
  ) => {
    try {
      // 1. Luôn luôn xóa sạch báo thức cũ trước khi làm bất cứ việc gì
      await Notifications.cancelAllScheduledNotificationsAsync();

      // 2. NẾU GIẢNG VIÊN TẮT CÔNG TẮC TỔNG -> DỪNG LẠI LUÔN, KHÔNG ĐẶT LỊCH NỮA
      if (!config.notifOn) {
        console.log("⏸ Đã tắt thông báo theo yêu cầu Giảng viên.");
        return;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;

      const activeClasses = currentClasses.filter(
        (c) => c.status !== "cancelled",
      );
      const today = new Date();

      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + dayOffset);
        const thuOfTarget =
          targetDate.getDay() === 0 ? 8 : targetDate.getDay() + 1;
        const classesOnDay = activeClasses.filter((c) => c.thu === thuOfTarget);

        for (const cls of classesOnDay) {
          const startTier = TT[cls.tb - 1];
          if (!startTier) continue;

          const [hr, min] = startTier.s.split(":").map(Number);
          const classTime = new Date(targetDate);
          classTime.setHours(hr, min, 0, 0);

          // 🕒 NẾU CÔNG TẮC 24H BẬT
          if (config.is24h) {
            const notifyTime24h = new Date(
              classTime.getTime() - 24 * 60 * 60 * 1000,
            );
            if (notifyTime24h > new Date()) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `Ngày mai có lớp lúc ${startTier.s}`,
                  body: `${cls.ten} · Tiết ${cls.tb}-${cls.tk} · Phòng ${cls.phong}`,
                  sound: true,
                },
                trigger: notifyTime24h,
              });
            }
          }

          // 🕒 NẾU CÔNG TẮC 1H BẬT
          if (config.is1h) {
            const notifyTime1h = new Date(classTime.getTime() - 60 * 60 * 1000);
            if (notifyTime1h > new Date()) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `1 giờ nữa có lớp lúc ${startTier.s}`,
                  body: `${cls.ten} · Tiết ${cls.tb}-${cls.tk} · Phòng ${cls.phong}`,
                  sound: true,
                },
                trigger: notifyTime1h,
              });
            }
          }
        }
      }
      console.log("Đã đồng bộ lịch theo cài đặt mới!");
    } catch (error) {
      console.error("Lỗi đồng bộ:", error);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedNotif = await AsyncStorage.getItem("notifOn");
        const saved24h = await AsyncStorage.getItem("is24h");
        const saved1h = await AsyncStorage.getItem("is1h");

        if (savedNotif !== null) setNotifOn(JSON.parse(savedNotif));
        if (saved24h !== null) setIs24h(JSON.parse(saved24h));
        if (saved1h !== null) setIs1h(JSON.parse(saved1h));
      } catch (e) {
        console.error("Lỗi đọc cài đặt", e);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (tab === "tkb") {
      fetch(`${API_BASE}/api/sessions`)
        .then((res) => res.json())
        .then((data) => {
          const mapped = data.map(mapBEtoFE);
          setClasses(mapped);
          syncNotifications(mapped); // <--- Gọi đồng bộ báo thức ngay khi có data mới
        })
        .catch((err) => console.error("Lỗi tải lịch dạy:", err));
    }
  }, [tab]);

  const toggleSetting = async (key, value) => {
    try {
      // 1. Lưu vào state UI
      if (key === "notifOn") setNotifOn(value);
      if (key === "is24h") setIs24h(value);
      if (key === "is1h") setIs1h(value);

      // 2. Lưu xuống ổ cứng
      await AsyncStorage.setItem(key, JSON.stringify(value));

      // 3. Gọi báo thức tính toán lại ngay lập tức với cấu hình mới
      const newConfig = {
        notifOn: key === "notifOn" ? value : notifOn,
        is24h: key === "is24h" ? value : is24h,
        is1h: key === "is1h" ? value : is1h,
      };
      syncNotifications(classes, newConfig);
    } catch (e) {
      console.error("Lỗi lưu cài đặt", e);
    }
  };

  const saveClass = async (c) => {
    try {
      const payload = mapFEtoBE(c);
      let newClasses = [...classes];
      if (c.id && classes.find((x) => x.id === c.id)) {
        const res = await fetch(`${API_BASE}/api/sessions/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          newClasses = classes.map((x) =>
            x.id === updated.id ? mapBEtoFE(updated) : x,
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
          newClasses = [...classes, mapBEtoFE(added)];
        }
      }
      setClasses(newClasses);
      syncNotifications(newClasses); // <--- Đồng bộ sau khi Thêm/Sửa
      setEditCls(null);
      setShowAdd(false);
      setSel(null);
    } catch (e) {
      console.error(e);
      Alert.alert("Lỗi", "Không thể lưu");
    }
  };

  const deleteClass = (id) => {
    Alert.alert("Xóa buổi dạy?", "Buổi dạy này sẽ bị xóa", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_BASE}/api/sessions/${id}`, { method: "DELETE" });
            const newClasses = classes.filter((c) => c.id !== id);
            setClasses(newClasses);
            syncNotifications(newClasses);
            setSel(null);
          } catch (e) {
            Alert.alert("Lỗi", "Không thể xóa");
          }
        },
      },
    ]);
  };

  const cancelClass = async (id) => {
    await fetch(`${API_BASE}/api/sessions/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const newClasses = classes.map((c) =>
      c.id === id ? { ...c, status: "cancelled" } : c,
    );
    setClasses(newClasses);
    syncNotifications(newClasses); // <--- Đồng bộ sau khi Hủy buổi (để Android không réo nữa)
    setSel(null);
  };

  const getConflictingClass = (targetCls) => {
    return classes.find(
      (c) =>
        c.id !== targetCls.id && // Không tự so với chính nó
        c.thu === targetCls.thu && // Cùng thứ
        c.tb <= targetCls.tk && // Giao nhau về tiết học
        c.tk >= targetCls.tb &&
        c.status !== "cancelled" &&
        targetCls.status !== "cancelled",
    );
  };

  // Hành động khi user bấm vào nút "Trùng lịch"
  const handleResolveConflict = (currentCls, conflictCls) => {
    Alert.alert(
      "Phát hiện trùng lịch",
      `Buổi dạy này đang trùng giờ với:\n\n Môn: ${conflictCls.ten}\n Phòng: ${conflictCls.phong}\n Thứ ${conflictCls.thu}, Tiết ${conflictCls.tb} - ${conflictCls.tk}\n\nThầy muốn xử lý thế nào?`,
      [
        { text: "Giữ nguyên", style: "cancel" },
        {
          text: "Đổi lịch (Dạy bù)",
          style: "default",
          onPress: () => {
            // Mở Modal Edit, set sẵn trạng thái là makeup
            setEditCls({ ...currentCls, status: "makeup" });
            setShowAdd(true);
          },
        },
      ],
    );
  };

  const restoreClass = async (id) => {
    await fetch(`${API_BASE}/api/sessions/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "normal" }),
    });
    const newClasses = classes.map((c) =>
      c.id === id ? { ...c, status: "normal" } : c,
    );
    setClasses(newClasses);
    syncNotifications(newClasses); // <--- Đồng bộ sau khi Khôi phục buổi
    setSel(null);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: C.white }}
        edges={["top", "bottom"]}
      >
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />

        {/* Header — white like web */}
        <View style={st.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 22 }}>{PAGE_ICONS[tab]}</Text>
            <Text style={st.headerTitle}>{PAGE_TITLES[tab]}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {tab === "tkb" && (
            <TKBScreen
              classes={classes}
              onPick={setSel}
              onAdd={() => setShowAdd(true)}
              weekOffset={weekOffset}
              onWeekChange={(d) => setWeekOffset((o) => o + d)}
              getConflictingClass={getConflictingClass}
              handleResolveConflict={handleResolveConflict}
            />
          )}
          {tab === "free" && (
            <FreeScreen
              classes={classes}
              weekOffset={weekOffset}
              onWeekChange={(d) => setWeekOffset((o) => o + d)}
            />
          )}
          {tab === "upload" && (
            <UploadScreen
              onSuccess={(nc) => {
                setClasses((p) => [...p, ...nc]);
                setTab("tkb");
              }}
            />
          )}
          {tab === "notif" && (
            <NotifScreen
              classes={classes}
              notifOn={notifOn}
              is24h={is24h}
              is1h={is1h}
              toggleSetting={toggleSetting}
            />
          )}
        </View>

        <BottomNav active={tab} onChange={setTab} />

        {sel && !editCls && (
          <DetailSheet
            cls={sel}
            onClose={() => setSel(null)}
            onEdit={() => {
              setEditCls(sel);
              setSel(null);
            }}
            onDelete={() => deleteClass(sel.id)}
            onCancel={() => cancelClass(sel.id)}
            onRestore={() => restoreClass(sel.id)}
          />
        )}
        {(showAdd || editCls) && (
          <AEModal
            init={editCls}
            onSave={saveClass}
            onClose={() => {
              setShowAdd(false);
              setEditCls(null);
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ════════════════════════════════════════
// STYLES
// ════════════════════════════════════════
const st = StyleSheet.create({
  // Header — white, border bottom
  header: {
    backgroundColor: C.white,
    borderBottomWidth: 1.5,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.3,
  },
  semBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  semBadgeTx: { fontSize: 12, fontWeight: "600", color: "#475569" },
  notifIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // Amber banner
  amberBanner: {
    backgroundColor: C.amber,
    borderBottomWidth: 1,
    borderBottomColor: C.amberBd,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  amberBannerTx: { flex: 1, fontSize: 14, color: C.amberTx, fontWeight: "500" },

  // Week bar
  weekBar: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  weekNavBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  weekNavTx: { fontSize: 20, fontWeight: "700", color: "#374151" },
  weekRange: { fontSize: 15, fontWeight: "700", color: C.text },
  weekSub: { fontSize: 13, color: C.red, fontWeight: "600", marginTop: 1 },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  todayBtnTx: { fontSize: 13, fontWeight: "600", color: "#64748B" },

  // Day + class cards
  dayHeader: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dayHeaderTx: { fontSize: 15, fontWeight: "700", color: "#374151" },
  todayDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.red },
  emptyDay: {
    backgroundColor: C.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border2,
  },
  emptyDayTx: { fontSize: 14, color: C.text3 },

  classCard: {
    borderRadius: 10,
    padding: 13,
    marginBottom: 7,
    borderLeftWidth: 4,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  tagMakeup: {
    fontSize: 10,
    fontWeight: "700",
    color: C.green,
    marginBottom: 3,
  },
  tagCancelled: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 3,
  },
  classCode: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  className: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 5,
  },
  classRoom: { fontSize: 13, fontWeight: "500" },
  tierBadge: {
    alignItems: "center",
    borderRadius: 9,
    padding: 7,
    borderWidth: 1,
    minWidth: 52,
    marginLeft: 10,
  },
  tierBadgeTx: { fontSize: 12, fontWeight: "700" },
  tierTime: { fontSize: 10, marginTop: 2 },

  // FAB
  fab: {
    position: "absolute",
    right: 16,
    bottom: 72,
    width: 56,
    height: 56,
    backgroundColor: C.red,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  fabTx: { color: C.white, fontSize: 30, fontWeight: "300", lineHeight: 34 },

  // Bottom nav
  bottomNav: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderTopWidth: 2.5,
    borderTopColor: "transparent",
  },
  navItemActive: { backgroundColor: "#FEF2F2", borderTopColor: C.red },
  navLabel: {
    fontSize: 14,
    color: C.text3,
    fontWeight: "500",
    marginTop: 2,
    textAlign: "center",
  },
  navLabelActive: { color: C.red, fontWeight: "700" },

  // Detail sheet
  sheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
    maxHeight: "88%",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  detailHeader: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
  },
  detailCode: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  detailName: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 6,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillTx: { fontSize: 12, fontWeight: "700" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    alignItems: "center",
  },
  detailLbl: { fontSize: 14, color: C.text3 },
  detailVal: {
    fontSize: 14,
    fontWeight: "500",
    color: C.text,
    textAlign: "right",
    maxWidth: "60%",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  sheetBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 9,
    alignItems: "center",
  },
  btnEdit: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  btnEditTx: { color: "#B45309", fontWeight: "700", fontSize: 13 },
  btnCancel: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  btnCancelTx: { color: "#B45309", fontWeight: "700", fontSize: 13 },
  btnRestore: {
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: "#059669",
  },
  btnRestoreTx: { color: C.green, fontWeight: "700", fontSize: 13 },
  btnDel: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  btnDelTx: { color: C.red, fontWeight: "700", fontSize: 13 },
  sheetClose: {
    marginHorizontal: 14,
    marginTop: 10,
    paddingVertical: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  sheetCloseTx: { fontSize: 14, fontWeight: "600", color: "#64748B" },

  // AE Modal
  aeOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.45)",
    justifyContent: "flex-end",
  },
  aeModal: {
    backgroundColor: C.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "96%",
    flex: 1,
  },
  aeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  aeTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  aeFooter: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  formLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "700",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  formInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.white,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    marginRight: 7,
  },
  chipActive: { backgroundColor: C.red, borderColor: C.red },
  chipTx: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  chipTxActive: { color: C.white },
  statusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    alignItems: "center",
    marginRight: 6,
  },
  statusBtnNormal: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  statusBtnMakeup: { backgroundColor: "#D1FAE5", borderColor: C.green },
  statusBtnCancelled: { backgroundColor: "#F1F5F9", borderColor: "#94A3B8" },
  statusBtnTx: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  schoolPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  schoolDot: { width: 14, height: 14, borderRadius: 7, flexShrink: 0 },
  dropdown: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    backgroundColor: C.white,
    marginBottom: 10,
    overflow: "hidden",
  },
  dropItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropDot: { width: 10, height: 10, borderRadius: 5 },
  btnPrimary: {
    flex: 2,
    padding: 12,
    backgroundColor: C.red,
    borderRadius: 9,
    alignItems: "center",
  },
  btnPrimaryTx: { color: C.white, fontWeight: "700", fontSize: 14 },
  btnSecondary: {
    flex: 1,
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  btnSecondaryTx: { color: "#64748B", fontWeight: "600", fontSize: 13 },

  // Free screen
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
  },
  filterChipActive: { backgroundColor: C.red, borderColor: C.red },
  filterChipTx: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  filterChipTxActive: { color: C.white },
  freeCard: {
    backgroundColor: C.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  freeCardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FAFAFA",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  freeCardDay: { fontSize: 15, fontWeight: "700", color: C.text },
  freeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  freeBadgeTx: { fontSize: 12, fontWeight: "700" },
  freeEmptyTx: {
    textAlign: "center",
    fontSize: 13,
    color: C.text3,
    padding: 14,
  },
  sessLabel: {
    padding: 6,
    paddingHorizontal: 14,
    marginTop: 2,
    borderLeftWidth: 3,
  },
  freeSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  freeDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#22C55E",
  },
  freeSlotTier: { fontSize: 14, fontWeight: "700", color: C.text },
  freeSlotTime: { fontSize: 12, color: C.text3, marginTop: 1 },
  freeTag: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 5,
  },
  freeTagTx: { fontSize: 11, fontWeight: "700", color: "#15803D" },
  occWrap: {
    padding: 10,
    paddingHorizontal: 14,
    backgroundColor: "#FAFAFA",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  occLabel: { fontSize: 11, color: C.text3, marginBottom: 3 },
  occChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },

  // Upload
  infoBanner: {
    backgroundColor: "#F0F9FF",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    marginBottom: 14,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0369A1",
    marginBottom: 4,
  },
  infoBannerTx: { fontSize: 13, color: "#0284C7", lineHeight: 18 },
  uploadBtn: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.border,
    borderStyle: "dashed",
    padding: 24,
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: C.white,
  },
  uploadBtnTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
    marginBottom: 4,
  },
  uploadBtnSub: { fontSize: 13, color: C.text3 },
  progressBox: {
    backgroundColor: C.white,
    borderRadius: 12,
    padding: 28,
    alignItems: "center",
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
    marginBottom: 14,
  },
  progressTrack: {
    width: "100%",
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 100,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: C.red, borderRadius: 100 },
  doneBox: { backgroundColor: C.white, borderRadius: 12, overflow: "hidden" },

  // Notif
  notifBanner: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
  },
  notifBannerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  notifBannerSub: { fontSize: 13 },
  sampleCard: {
    backgroundColor: C.white,
    borderRadius: 10,
    padding: 13,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderLeftWidth: 4,
    borderLeftColor: C.red,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sampleIcon: {
    width: 40,
    height: 40,
    backgroundColor: "#FEF2F2",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sampleLabel: {
    fontSize: 10,
    color: C.red,
    fontWeight: "700",
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  sampleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
    marginBottom: 2,
  },
  sampleSub: { fontSize: 12, color: C.text3 },
  card: {
    backgroundColor: C.white,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHead: {
    padding: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FAFAFA",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: C.text,
    marginBottom: 2,
  },
  settingSub: { fontSize: 12, color: C.text3 },
  disabledHint: {
    padding: 10,
    fontSize: 12,
    color: C.text3,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    fontStyle: "italic",
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  notifBar: { width: 4, height: 44, borderRadius: 2 },
  notifDay: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  notifName: {
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
    marginBottom: 2,
  },
  notifMeta: { fontSize: 11, color: C.text3 },
  notifBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
