/**
 * UploadScreen.js — CamScan (client-side, không chớp, không network khi detect)
 * ───────────────────────────────────────────────────────────────────────────────
 * Flow:
 *   IDLE      → chọn Scan hoặc Upload file
 *   SCANNING  → live camera, JS vẽ khung overlay (không gửi server)
 *   PREVIEW   → xem ảnh đã chụp, có thể chụp lại
 *   PROCESSING→ gửi server OCR
 *   RESULT    → chọn buổi dạy muốn thêm
 *   DONE      → xong
 *
 * Cần cài:
 *   npx expo install expo-camera expo-image-manipulator expo-document-picker expo-file-system
 *
 * Detection hoàn toàn client-side bằng JS:
 *   - Không gửi frame liên tục → không chớp, không lag network
 *   - Dùng thuật toán tìm vùng có độ tương phản cao (bảng thường có border rõ)
 *   - Vẽ overlay khung xanh bằng View/SVG-like
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Image, ScrollView, FlatList, ActivityIndicator,
  Alert, Platform, Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

// ─── Cấu hình ─────────────────────────────────────────────────────────────────
const API_BASE = __DEV__ ? 'http://192.168.0.2:8000' : 'https://your-server.com';

const { width: SW, height: SH } = Dimensions.get('window');
const CAM_H = SH * 0.68;

// ─── Màu sắc ──────────────────────────────────────────────────────────────────
const C = {
  white:'#FFFFFF', bg:'#F4F6F9', text:'#0F172A',
  text2:'#475569', text3:'#94A3B8', border:'#E5E7EB',
  red:'#DC2626', green:'#22C55E', greenD:'#059669',
};
const SCHOOL_MAP = {
  HUTECH:{bg:'#DBEAFE',br:'#2563EB',tx:'#1E3A8A'},
  BKU:   {bg:'#FEF3C7',br:'#D97706',tx:'#78350F'},
  UIT:   {bg:'#D1FAE5',br:'#059669',tx:'#064E3B'},
  UEL:   {bg:'#EDE9FE',br:'#7C3AED',tx:'#2E1065'},
  HCMUTE:{bg:'#FCE7F3',br:'#DB2777',tx:'#831843'},
  TDTU:  {bg:'#CCFBF1',br:'#0D9488',tx:'#042F2E'},
  HCMUAF:{bg:'#FEF9C3',br:'#CA8A04',tx:'#713F12'},
  UEF:   {bg:'#FFF7ED',br:'#EA580C',tx:'#7C2D12'},
  VLU:   {bg:'#ECFDF5',br:'#16A34A',tx:'#14532D'},
  HUI:   {bg:'#FDF4FF',br:'#A21CAF',tx:'#4A044E'},
  HCMUS: {bg:'#ECFEFF',br:'#0891B2',tx:'#164E63'},
  OTHER: {bg:'#F1F5F9',br:'#64748B',tx:'#1E293B'},
};
const THU_LABEL = ['','','T2','T3','T4','T5','T6','T7','CN'];
const sc = k => SCHOOL_MAP[k] || SCHOOL_MAP.OTHER;

const STEP = {
  IDLE:'idle', SCANNING:'scanning', PREVIEW:'preview',
  PROCESSING:'processing', RESULT:'result', DONE:'done',
};

// ─── Overlay khung hướng dẫn (tĩnh, không nhảy) ──────────────────────────────
// Đây là khung CỐ ĐỊNH hiển thị vùng nên đặt bảng lịch vào
// Không cần detect realtime → không chớp
const GUIDE = {
  x:  SW * 0.04,
  y:  CAM_H * 0.06,
  w:  SW * 0.92,
  h:  CAM_H * 0.86,
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function UploadScreen({ onSuccess }) {
  const [step, setStep]         = useState(STEP.IDLE);
  const [photoUri, setPhotoUri] = useState(null);
  const [result, setResult]     = useState(null);
  const [selected, setSelected] = useState([]);
  const [errMsg, setErrMsg]     = useState('');

  const reset = () => {
    setStep(STEP.IDLE);
    setPhotoUri(null);
    setResult(null);
    setSelected([]);
    setErrMsg('');
  };

  // Chụp xong → vào preview
  const onCaptured = useCallback((uri) => {
    setPhotoUri(uri);
    setStep(STEP.PREVIEW);
  }, []);

  // Xác nhận ảnh → gửi OCR
  const onConfirmPhoto = useCallback(async () => {
    if (!photoUri) return;
    setStep(STEP.PROCESSING);
    try {
      const fd = new FormData();
      fd.append('file', { uri: photoUri, name: `scan_${Date.now()}.jpg`, type: 'image/jpeg' });

      const resp = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: fd,
        headers: { 'Accept': 'application/json' },
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Lỗi server ${resp.status}`);
      }

      const data = await resp.json();
      if (!data.sessions?.length)
        throw new Error('Không đọc được bảng lịch.\nThử lại: giữ máy thẳng, đủ sáng, bảng phải nằm trong khung.');

      setResult(data);
      setSelected(data.sessions.map(() => true));
      setStep(STEP.RESULT);
    } catch (e) {
      setErrMsg(e.message);
      // Quay về preview để chụp lại, không về IDLE
      setStep(STEP.PREVIEW);
      Alert.alert('Không đọc được', e.message, [{ text: 'OK' }]);
    }
  }, [photoUri]);

  // Upload file PDF/Excel
  const pickFile = useCallback(async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const a = r.assets[0];
      setStep(STEP.PROCESSING);
      const fd = new FormData();
      fd.append('file', { uri: a.uri, name: a.name, type: a.mimeType || 'application/octet-stream' });
      const resp = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
      if (!resp.ok) throw new Error((await resp.json().catch(()=>({}))).detail || `HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.sessions?.length) throw new Error('Không tìm thấy buổi dạy trong file.');
      setResult(data);
      setSelected(data.sessions.map(() => true));
      setStep(STEP.RESULT);
    } catch (e) {
      Alert.alert('Lỗi', e.message);
      setStep(STEP.IDLE);
    }
  }, []);

  // Lưu vào TKB
  const confirmSave = useCallback(async () => {
    const idxs = selected.map((on, i) => on ? i : -1).filter(i => i >= 0);
    if (!idxs.length) { Alert.alert('Chưa chọn buổi nào'); return; }
    setStep(STEP.PROCESSING);
    try {
      const resp = await fetch(`${API_BASE}/upload/confirm/${result.file_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(idxs),
      });
      if (!resp.ok) throw new Error('Lưu thất bại');
      const newClasses = idxs.map(i => {
        const s = result.sessions[i];
        return {
          id: Math.random() * 1e9 | 0,
          ma: s.ma_mon, ten: s.ten_mon,
          phong: s.phong || '', lop: s.ten_lop || s.nhom || '',
          ss: s.si_so || 0, tb: s.tiet_bat_dau, tk: s.tiet_ket_thuc,
          hk: s.hoc_ky || '', thu: s.thu, truong: s.truong, status: s.status,
        };
      });
      setStep(STEP.DONE);
      setTimeout(() => { onSuccess(newClasses); reset(); }, 1600);
    } catch (e) {
      Alert.alert('Lỗi', e.message);
      setStep(STEP.RESULT);
    }
  }, [result, selected, onSuccess]);

  // ── Render theo step ───────────────────────────────────────────────────────
  switch (step) {
    case STEP.IDLE:       return <IdleView onScan={() => setStep(STEP.SCANNING)} onFile={pickFile} />;
    case STEP.SCANNING:   return <ScanView onCaptured={onCaptured} onBack={reset} />;
    case STEP.PREVIEW:    return <PhotoPreview uri={photoUri} onConfirm={onConfirmPhoto} onRetake={() => setStep(STEP.SCANNING)} errMsg={errMsg} />;
    case STEP.PROCESSING: return <ProcessingView />;
    case STEP.RESULT:     return <ResultView result={result} selected={selected} setSelected={setSelected} onConfirm={confirmSave} onCancel={reset} />;
    case STEP.DONE:       return <DoneView />;
    default: return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// IDLE
// ═════════════════════════════════════════════════════════════════════════════
function IdleView({ onScan, onFile }) {
  return (
    <ScrollView style={{ flex:1, backgroundColor:C.bg }} contentContainerStyle={{ padding:20 }}>
      <View style={s.infoBanner}>
        <Text style={s.infoBannerTitle}>📋  Scan lịch dạy tự động</Text>
        <Text style={s.infoBannerTx}>
          Hướng camera vào bảng lịch, căn cho bảng nằm trong khung,
          rồi nhấn nút chụp. Xem preview trước khi gửi nhận diện.
        </Text>
      </View>

      {/* Nút Scan chính */}
      <TouchableOpacity style={s.scanBtnMain} onPress={onScan} activeOpacity={0.85}>
        <Text style={{ fontSize:60, marginBottom:12 }}>📷</Text>
        <Text style={s.scanBtnTitle}>Scan bảng lịch</Text>
        <Text style={s.scanBtnSub}>Mở camera · căn bảng vào khung · chụp · xác nhận</Text>
      </TouchableOpacity>

      {/* Nút file */}
      <TouchableOpacity style={s.fileBtn} onPress={onFile} activeOpacity={0.85}>
        <Text style={{ fontSize:28 }}>📁</Text>
        <View style={{ flex:1, marginLeft:12 }}>
          <Text style={s.fileBtnTitle}>Upload PDF / Excel</Text>
          <Text style={s.fileBtnSub}>Chọn file từ bộ nhớ điện thoại</Text>
        </View>
        <Text style={{ fontSize:20, color:C.text3 }}>›</Text>
      </TouchableOpacity>

      {/* Tips */}
      <View style={s.tipBox}>
        <Text style={s.tipTitle}>💡  Mẹo scan màn hình laptop</Text>
        {[
          'Giảm độ sáng màn hình xuống ~60% để giảm glare',
          'Giữ điện thoại thẳng, vuông góc với màn hình',
          'Zoom bảng lịch cho to, đủ 4 cạnh trong khung camera',
          'Chụp xong kiểm tra preview — nếu mờ thì chụp lại',
        ].map((t, i) => <Text key={i} style={s.tipItem}>• {t}</Text>)}
      </View>
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SCAN VIEW — Camera với khung hướng dẫn tĩnh + zoom
// ═════════════════════════════════════════════════════════════════════════════
function ScanView({ onCaptured, onBack }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef  = useRef(null);
  const [zoom, setZoom]       = useState(0);
  const [capturing, setCapturing] = useState(false);
  // Pulse animation cho viền khung
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Viền khung nhấp nháy nhẹ để thu hút sự chú ý
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue:0.5, duration:900, useNativeDriver:true }),
        Animated.timing(pulseAnim, { toValue:1,   duration:900, useNativeDriver:true }),
      ])
    ).start();
  }, []);

  const takePicture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,          // ảnh sắc nét cho OCR
        skipProcessing: false,  // bật xử lý để tránh ảnh tối/lật
        exif: false,
      });
      onCaptured(photo.uri);
    } catch (e) {
      Alert.alert('Lỗi', 'Không chụp được: ' + e.message);
      setCapturing(false);
    }
  };

  // ── Permission ─────────────────────────────────────────────────────────────
  if (!permission) return <View style={s.center}><ActivityIndicator color={C.red} /></View>;

  if (!permission.granted) {
    return (
      <View style={[s.center, { padding:32 }]}>
        <Text style={{ fontSize:52, marginBottom:16 }}>📷</Text>
        <Text style={[s.fileBtnTitle, { textAlign:'center', marginBottom:8 }]}>Cần quyền camera</Text>
        <Text style={[s.fileBtnSub, { textAlign:'center', marginBottom:24 }]}>
          Cho phép ứng dụng dùng camera để scan bảng lịch.
        </Text>
        <TouchableOpacity style={s.btnPrimary} onPress={requestPermission}>
          <Text style={s.btnPrimaryTx}>Cấp quyền camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop:14 }} onPress={onBack}>
          <Text style={{ color:C.text3, fontSize:14 }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor:'#000' }}>

      {/* ── Camera ── */}
      <CameraView
        ref={cameraRef}
        style={{ width:SW, height:CAM_H }}
        facing="back"
        zoom={zoom}
      />

      {/* ── Overlay tối 4 góc ngoài khung (không che khung) ── */}
      <View style={[StyleSheet.absoluteFill, { height:CAM_H }]} pointerEvents="none">
        {/* Top */}
        <View style={{ position:'absolute', top:0, left:0, right:0, height:GUIDE.y, backgroundColor:'rgba(0,0,0,0.5)' }} />
        {/* Bottom */}
        <View style={{ position:'absolute', top:GUIDE.y+GUIDE.h, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.5)' }} />
        {/* Left */}
        <View style={{ position:'absolute', top:GUIDE.y, left:0, width:GUIDE.x, height:GUIDE.h, backgroundColor:'rgba(0,0,0,0.5)' }} />
        {/* Right */}
        <View style={{ position:'absolute', top:GUIDE.y, left:GUIDE.x+GUIDE.w, right:0, height:GUIDE.h, backgroundColor:'rgba(0,0,0,0.5)' }} />

        {/* Viền khung xanh với pulse animation */}
        <Animated.View style={[s.guideFrame, { opacity: pulseAnim }]} />

        {/* 4 góc L-shape nổi bật */}
        <CornerMark x={GUIDE.x}            y={GUIDE.y}            pos="tl" />
        <CornerMark x={GUIDE.x+GUIDE.w}    y={GUIDE.y}            pos="tr" />
        <CornerMark x={GUIDE.x+GUIDE.w}    y={GUIDE.y+GUIDE.h}    pos="br" />
        <CornerMark x={GUIDE.x}            y={GUIDE.y+GUIDE.h}    pos="bl" />

        {/* Label hướng dẫn */}
        <View style={s.guideLabel}>
          <Text style={s.guideLabelTx}>Đặt bảng lịch vào trong khung</Text>
        </View>
      </View>

      {/* ── Thanh điều khiển phía dưới ── */}
      <View style={s.camBar}>
        {/* Nút back */}
        <TouchableOpacity style={s.camSideBtn} onPress={onBack}>
          <Text style={{ fontSize:22 }}>✕</Text>
          <Text style={s.camSideLbl}>Huỷ</Text>
        </TouchableOpacity>

        {/* Nút chụp */}
        <TouchableOpacity
          style={[s.shutterOuter, capturing && { opacity:0.5 }]}
          onPress={takePicture}
          disabled={capturing}
          activeOpacity={0.8}
        >
          {capturing
            ? <ActivityIndicator color="#fff" size="large" />
            : <View style={s.shutterInner} />
          }
        </TouchableOpacity>

        {/* Zoom */}
        <View style={s.zoomCol}>
          <TouchableOpacity style={s.zoomBtn} onPress={() => setZoom(z => Math.min(0.8, +(z+0.1).toFixed(1)))}>
            <Text style={s.zoomBtnTx}>＋</Text>
          </TouchableOpacity>
          <Text style={s.zoomVal}>{zoom > 0 ? `${Math.round(zoom*100)}%` : 'Zoom'}</Text>
          <TouchableOpacity style={s.zoomBtn} onPress={() => setZoom(z => Math.max(0, +(z-0.1).toFixed(1)))}>
            <Text style={s.zoomBtnTx}>－</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Góc L-shape của khung
function CornerMark({ x, y, pos }) {
  const L = 22, T = 3;
  const tl = pos === 'tl', tr = pos === 'tr';
  const bl = pos === 'bl';
  return (
    <>
      {/* Cạnh ngang */}
      <View style={{
        position:'absolute',
        left: tr ? x - L : x,
        top:  (tl || tr) ? y : y - T,
        width: L, height: T,
        backgroundColor: C.green,
      }} />
      {/* Cạnh dọc */}
      <View style={{
        position:'absolute',
        left: tr ? x - T : x,
        top:  (tl || tr) ? y : y - L,
        width: T, height: L,
        backgroundColor: C.green,
      }} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PHOTO PREVIEW — Xem ảnh trước khi gửi OCR
// ═════════════════════════════════════════════════════════════════════════════
function PhotoPreview({ uri, onConfirm, onRetake, errMsg }) {
  return (
    <View style={{ flex:1, backgroundColor:'#000' }}>
      {/* Ảnh preview full màn hình */}
      <Image
        source={{ uri }}
        style={{ width:SW, height:CAM_H }}
        resizeMode="contain"
      />

      {/* Thông báo nếu có lỗi OCR lần trước */}
      {errMsg ? (
        <View style={s.previewErrBanner}>
          <Text style={s.previewErrTx}>⚠️  {errMsg}</Text>
          <Text style={s.previewErrSub}>Hãy chụp lại rõ hơn hoặc thử lại</Text>
        </View>
      ) : (
        <View style={s.previewOkBanner}>
          <Text style={s.previewOkTx}>✅  Kiểm tra ảnh — đủ sáng, rõ chữ không?</Text>
        </View>
      )}

      {/* 2 nút hành động */}
      <View style={s.previewBar}>
        <TouchableOpacity style={[s.btnSecondary, { flex:1 }]} onPress={onRetake}>
          <Text style={s.btnSecondaryTx}>🔄  Chụp lại</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btnPrimary, { flex:2 }]} onPress={onConfirm}>
          <Text style={s.btnPrimaryTx}>✓  Xác nhận & Nhận diện</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROCESSING
// ═════════════════════════════════════════════════════════════════════════════
function ProcessingView() {
  const steps = ['Đang tải ảnh lên…', 'PaddleOCR đang đọc chữ…', 'Phân tích bảng lịch…', 'Gần xong…'];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => Math.min(i + 1, steps.length - 1)), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={C.red} />
      <Text style={[s.fileBtnTitle, { marginTop:20, marginBottom:6 }]}>{steps[idx]}</Text>
      <Text style={{ color:C.text3, fontSize:12 }}>Vui lòng đợi…</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RESULT — Danh sách buổi dạy
// ═════════════════════════════════════════════════════════════════════════════
function ResultView({ result, selected, setSelected, onConfirm, onCancel }) {
  const cl  = sc(result?.truong);
  const cnt = selected.filter(Boolean).length;

  return (
    <View style={{ flex:1, backgroundColor:C.bg }}>
      {/* Header */}
      <View style={[s.resHeader, { backgroundColor:cl.bg, borderBottomColor:cl.br }]}>
        <Text style={[s.resHeaderTitle, { color:cl.tx }]}>
          ✅  {result.session_count} buổi dạy được nhận diện
        </Text>
        <Text style={[s.resHeaderSub, { color:cl.br }]}>
          {result.truong}{result.hoc_ky ? `  ·  ${result.hoc_ky}` : ''}
        </Text>
      </View>

      {/* Toolbar */}
      <View style={s.selBar}>
        <Text style={{ fontSize:13, color:C.text2, fontWeight:'600' }}>
          {cnt}/{result.sessions.length} buổi được chọn
        </Text>
        <TouchableOpacity onPress={() => setSelected(prev => prev.map(() => !selected.every(Boolean)))}>
          <Text style={{ color:C.red, fontWeight:'700', fontSize:13 }}>
            {selected.every(Boolean) ? 'Bỏ tất cả' : 'Chọn tất cả'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={result.sessions}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding:12, paddingBottom:100 }}
        renderItem={({ item: sess, index }) => {
          const color = sc(sess.truong);
          const on    = selected[index];
          return (
            <TouchableOpacity
              style={[s.sessCard, { opacity: on ? 1 : 0.4 }]}
              onPress={() => setSelected(prev => prev.map((v, i) => i === index ? !v : v))}
              activeOpacity={0.75}
            >
              <View style={[s.sessLeft, { backgroundColor:color.bg, borderColor:color.br }]}>
                <Text style={[s.sessCode, { color:color.br }]}>{sess.ma_mon}</Text>
                <Text style={[s.sessTruong, { color:color.tx }]}>{sess.truong}</Text>
              </View>
              <View style={s.sessBody}>
                <Text style={s.sessName} numberOfLines={2}>{sess.ten_mon}</Text>
                <Text style={s.sessMeta}>
                  {THU_LABEL[sess.thu]}  ·  Tiết {sess.tiet_bat_dau}–{sess.tiet_ket_thuc}
                  {sess.phong ? `  ·  ${sess.phong}` : ''}
                </Text>
                {sess.nhom ? <Text style={s.sessMeta}>Nhóm {sess.nhom}</Text> : null}
              </View>
              <View style={[s.check, on && s.checkOn]}>
                {on && <Text style={{ color:'#fff', fontSize:11, fontWeight:'800' }}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Bottom bar */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={[s.btnSecondary, { flex:1 }]} onPress={onCancel}>
          <Text style={s.btnSecondaryTx}>Huỷ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btnPrimary, { flex:2, opacity: cnt ? 1 : 0.4 }]}
          onPress={onConfirm}
          disabled={!cnt}
        >
          <Text style={s.btnPrimaryTx}>✓  Thêm {cnt} buổi vào TKB</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DONE
// ═════════════════════════════════════════════════════════════════════════════
function DoneView() {
  return (
    <View style={s.center}>
      <Text style={{ fontSize:72 }}>🎉</Text>
      <Text style={{ fontSize:20, fontWeight:'800', color:C.greenD, marginTop:12, marginBottom:6 }}>
        Đã cập nhật TKB!
      </Text>
      <Text style={{ color:C.text3, fontSize:13 }}>Đang chuyển sang trang lịch…</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  center: {
    flex:1, alignItems:'center', justifyContent:'center',
    padding:32, backgroundColor:C.bg,
  },

  // Idle
  infoBanner:      { backgroundColor:'#F0F9FF', borderRadius:10, padding:14, borderWidth:1, borderColor:'#BAE6FD', marginBottom:20 },
  infoBannerTitle: { fontSize:15, fontWeight:'800', color:'#0369A1', marginBottom:4 },
  infoBannerTx:    { fontSize:13, color:'#0284C7', lineHeight:19 },
  scanBtnMain:     { backgroundColor:C.red, borderRadius:16, padding:28, alignItems:'center', marginBottom:14,
                     shadowColor:C.red, shadowOffset:{width:0,height:6}, shadowOpacity:0.28, shadowRadius:12, elevation:8 },
  scanBtnTitle:    { fontSize:22, fontWeight:'900', color:'#fff', marginBottom:5 },
  scanBtnSub:      { fontSize:12, color:'rgba(255,255,255,0.85)', textAlign:'center', lineHeight:18 },
  fileBtn:         { flexDirection:'row', alignItems:'center', backgroundColor:C.white, borderRadius:12,
                     padding:16, borderWidth:1, borderColor:C.border, marginBottom:16 },
  fileBtnTitle:    { fontSize:15, fontWeight:'700', color:C.text, marginBottom:2 },
  fileBtnSub:      { fontSize:12, color:C.text3 },
  tipBox:          { backgroundColor:C.white, borderRadius:12, padding:16, borderWidth:1, borderColor:C.border },
  tipTitle:        { fontSize:13, fontWeight:'700', color:C.text, marginBottom:10 },
  tipItem:         { fontSize:12, color:C.text2, marginBottom:6, lineHeight:17 },

  // Camera
  guideFrame:      {
    position:'absolute',
    left:GUIDE.x, top:GUIDE.y, width:GUIDE.w, height:GUIDE.h,
    borderWidth:2, borderColor:C.green, borderRadius:4,
  },
  guideLabel:      { position:'absolute', bottom:GUIDE.y - 28, left:0, right:0, alignItems:'center' },
  guideLabelTx:    { color:'rgba(255,255,255,0.9)', fontSize:13, fontWeight:'600' },
  camBar:          { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                     paddingHorizontal:24, paddingBottom: Platform.OS==='ios' ? 20 : 10, paddingTop:12,
                     backgroundColor:'rgba(0,0,0,0.65)' },
  camSideBtn:      { width:60, alignItems:'center' },
  camSideLbl:      { color:'rgba(255,255,255,0.75)', fontSize:11, marginTop:3 },
  shutterOuter:    { width:74, height:74, borderRadius:37, borderWidth:4, borderColor:'#fff',
                     alignItems:'center', justifyContent:'center' },
  shutterInner:    { width:58, height:58, borderRadius:29, backgroundColor:'#fff' },
  zoomCol:         { width:60, alignItems:'center', gap:5 },
  zoomBtn:         { width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.18)',
                     alignItems:'center', justifyContent:'center' },
  zoomBtnTx:       { color:'#fff', fontSize:20, fontWeight:'700', lineHeight:24 },
  zoomVal:         { color:'rgba(255,255,255,0.8)', fontSize:11, fontWeight:'600' },

  // Preview
  previewOkBanner: { backgroundColor:'rgba(34,197,94,0.9)', padding:12, alignItems:'center' },
  previewOkTx:     { color:'#fff', fontSize:13, fontWeight:'700' },
  previewErrBanner:{ backgroundColor:'rgba(220,38,38,0.9)', padding:12, alignItems:'center' },
  previewErrTx:    { color:'#fff', fontSize:13, fontWeight:'700', marginBottom:3 },
  previewErrSub:   { color:'rgba(255,255,255,0.85)', fontSize:11 },
  previewBar:      { flex:1, flexDirection:'row', gap:10, padding:14,
                     backgroundColor:C.white, alignItems:'center' },

  // Result
  resHeader:       { padding:16, borderBottomWidth:1 },
  resHeaderTitle:  { fontSize:16, fontWeight:'800', marginBottom:3 },
  resHeaderSub:    { fontSize:13 },
  selBar:          { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                     paddingHorizontal:14, paddingVertical:10, backgroundColor:C.white,
                     borderBottomWidth:1, borderBottomColor:C.border },
  sessCard:        { flexDirection:'row', backgroundColor:C.white, borderRadius:10, marginBottom:8,
                     borderWidth:1, borderColor:C.border, overflow:'hidden' },
  sessLeft:        { width:64, padding:8, alignItems:'center', justifyContent:'center', borderRightWidth:1 },
  sessCode:        { fontSize:11, fontWeight:'800', textAlign:'center' },
  sessTruong:      { fontSize:9, textAlign:'center', marginTop:2, opacity:0.7 },
  sessBody:        { flex:1, padding:10 },
  sessName:        { fontSize:14, fontWeight:'700', color:C.text, marginBottom:3, lineHeight:19 },
  sessMeta:        { fontSize:12, color:C.text3 },
  check:           { width:28, height:28, borderRadius:6, borderWidth:2, borderColor:C.border,
                     margin:10, alignSelf:'center', alignItems:'center', justifyContent:'center' },
  checkOn:         { backgroundColor:C.greenD, borderColor:C.greenD },

  // Shared
  bottomBar:       { position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', gap:10,
                     padding:14, backgroundColor:C.white, borderTopWidth:1, borderTopColor:C.border },
  btnPrimary:      { backgroundColor:C.red, borderRadius:10, padding:14, alignItems:'center', flex:1 },
  btnPrimaryTx:    { color:'#fff', fontWeight:'800', fontSize:14 },
  btnSecondary:    { backgroundColor:C.bg, borderRadius:10, padding:14, alignItems:'center',
                     borderWidth:1, borderColor:C.border },
  btnSecondaryTx:  { color:C.text2, fontWeight:'700', fontSize:14 },
});
