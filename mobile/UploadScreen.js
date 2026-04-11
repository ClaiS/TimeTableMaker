/**
 * UploadScreen.js — Native Document Scanner Approach
 * ─────────────────────────────────────────────────────────────────────────────
 * Flow:
 * IDLE       → Chọn Scan hoặc Upload file
 * SCANNING   → Mở Native Scanner của OS (tự động tìm viền, tự chụp, cắt gọt)
 * PROCESSING → Gửi ảnh đã cắt nét lên Server xử lý (PaddleOCR)
 * RESULT     → Hiển thị kết quả lịch dạy
 */

import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DocumentScanner from "react-native-document-scanner-plugin";

// ─── Config ────────────────────────────────────────────────────────────────────
// Đảm bảo trỏ đúng IP của máy tính tính chạy backend mạng LAN (không dùng localhost)
const API_BASE = __DEV__ ? "http://127.0.0.1:8000" : "https://your-server.com";

// ─── Component ─────────────────────────────────────────────────────────────────
export default function UploadScreen(onSuccess) {
  const [status, setStatus] = useState("IDLE"); // IDLE | PROCESSING
  const [scannedImage, setScannedImage] = useState(null);

  // 1. Hàm mở Native Scanner
  const handleScan = async () => {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        letUserAdjustCrop: true, // Cho phép user chỉnh lại 4 góc nếu OS nhận nhầm
      });

      if (status === "success" && scannedImages && scannedImages.length > 0) {
        setScannedImage(scannedImages[0]);
        uploadToServer(scannedImages[0], "image/jpeg");
      }
    } catch (error) {
      console.error("Scanner Error:", error);
      Alert.alert("Lỗi", "Không thể khởi động máy quét tài liệu.");
    }
  };

  // 2. Hàm Upload File (PDF/Excel)
  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const file = result.assets[0];
        uploadToServer(file.uri, file.mimeType || "application/pdf");
      }
    } catch (err) {
      console.error("Lỗi chọn file:", err);
    }
  };

  // 3. Hàm gửi File/Ảnh lên Backend
  const uploadToServer = async (fileUri, mimeType) => {
    setStatus("PROCESSING");
    try {
      const filename = fileUri.split("/").pop() || "upload.jpg";
      const formData = new FormData();
      formData.append("file", {
        uri: Platform.OS === "ios" ? fileUri.replace("file://", "") : fileUri,
        name: filename,
        type: mimeType,
      });

      // 1. Upload & Phân tích
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok)
        throw new Error(
          uploadData.detail ||
            "Hệ thống không đọc được ảnh/file này. Thầy chụp lại cho rõ nha!",
        );

      // 2. Chốt lưu vào Database
      const confirmRes = await fetch(
        `${API_BASE}/api/upload/confirm/${uploadData.file_id}`,
        { method: "POST" },
      );
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error("Lỗi khi lưu lịch");

      // 3. Truy vấn lại toàn bộ DB mới nhất để render ra lịch
      const getRes = await fetch(`${API_BASE}/api/sessions`);
      const allSessions = await getRes.json();

      // Chuyển format BE -> FE
      const mappedData = allSessions.map((item) => ({
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
      }));

      if (confirmData.warnings && confirmData.warnings.length > 0) {
        Alert.alert(
          "Đã lưu lịch dạy!",
          `Hệ thống phát hiện có sự trùng lặp:\n- ${confirmData.warnings[0]}\n\nVui lòng kiểm tra trên Thời khóa biểu.`,
          [{ text: "Đã hiểu" }],
        );
      } else {
        Alert.alert("Hoàn tất!", "Đã thêm lịch dạy mới thành công.");
      }

      // Đẩy mảng data mới nhất về App.js
      if (typeof onSuccess === "function") onSuccess(mappedData);
    } catch (error) {
      console.error("Upload Error:", error);
      Alert.alert("Lỗi Upload", error.message);
    } finally {
      setStatus("IDLE");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Thêm Lịch Dạy</Text>
        <Text style={styles.subtitle}>
          Quét bằng camera hoặc tải file PDF/Excel lên
        </Text>
      </View>

      <View style={styles.content}>
        {scannedImage && status === "PROCESSING" && (
          <Image source={{ uri: scannedImage }} style={styles.previewImage} />
        )}

        {status === "PROCESSING" ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF3B30" />
            <Text style={styles.loadingText}>
              Đang gửi lên server và xử lý AI...
            </Text>
          </View>
        ) : (
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.button, styles.btnScan]}
              onPress={handleScan}
            >
              <Text style={styles.btnTextScan}> Quét tài liệu (Camera)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.btnFile]}
              onPress={handleUploadFile}
            >
              <Text style={styles.btnTextFile}> Tải file PDF / Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  header: { padding: 20, paddingTop: 40, backgroundColor: "#FFF" },
  title: { fontSize: 24, fontWeight: "bold", color: "#1C1C1E" },
  subtitle: { fontSize: 14, color: "#8E8E93", marginTop: 5 },
  content: { flex: 1, justifyContent: "center", padding: 20 },
  buttonGroup: { gap: 16 },
  button: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  btnScan: { backgroundColor: "#FF3B30" }, // Red Primary
  btnFile: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  btnTextScan: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  btnTextFile: { color: "#1C1C1E", fontSize: 16, fontWeight: "600" },
  loadingBox: { alignItems: "center", padding: 20 },
  loadingText: { marginTop: 16, fontSize: 16, color: "#8E8E93" },
  previewImage: {
    width: "100%",
    height: 300,
    resizeMode: "contain",
    marginBottom: 20,
    borderRadius: 10,
  },
});
