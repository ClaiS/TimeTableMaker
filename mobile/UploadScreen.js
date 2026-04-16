import * as DocumentPicker from "expo-document-picker";
import { useRef, useState } from "react"; // Đã thêm useRef
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DocumentScanner from "react-native-document-scanner-plugin";
import { SafeAreaView } from "react-native-safe-area-context";

const API_BASE = __DEV__
  ? "https://your-ngrok-url.ngrok-free.app"
  : "https://your-server.com";

export default function UploadScreen({ onSuccess }) {
  const [status, setStatus] = useState("IDLE"); // IDLE | PROCESSING
  const [scannedImage, setScannedImage] = useState(null);

  // Trạm kiểm soát để Hủy tiến trình mạng
  const abortControllerRef = useRef(null);

  // 1. Quét tài liệu bằng Camera
  const handleScan = async () => {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        letUserAdjustCrop: true,
      });

      if (status === "success" && scannedImages && scannedImages.length > 0) {
        setScannedImage(scannedImages[0]);
        uploadToServer({
          uri: scannedImages[0],
          name: "scan_image.jpg",
          mimeType: "image/jpeg",
        });
      }
    } catch (error) {
      Alert.alert("Lỗi", "Không thể khởi động máy quét tài liệu.");
    }
  };

  // 2. Upload File có sẵn
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
        uploadToServer({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || "application/pdf",
        });
      }
    } catch (err) {
      console.error("Lỗi chọn file:", err);
    }
  };

  // ─── HÀM HỦY QUÁ TRÌNH ────────────────────────────────────────────────────────
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // Cắt đứt kết nối mạng ngay lập tức
    }
    setStatus("IDLE");
    setScannedImage(null); // Xóa ảnh preview
  };

  // 3. Gửi lên Server
  const uploadToServer = async (fileData) => {
    setStatus("PROCESSING");

    // Khởi tạo một bộ điều khiển mới cho lần upload này
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const formData = new FormData();
      formData.append("file", {
        uri:
          Platform.OS === "ios"
            ? fileData.uri.replace("file://", "")
            : fileData.uri,
        name: fileData.name || "upload.pdf",
        type: fileData.mimeType,
      });

      // 3.1 Upload & Phân tích (Gắn signal vào để có thể hủy ngang)
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
        signal: signal, // <-- Lắng nghe lệnh hủy
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok)
        throw new Error(uploadData.detail || "Lỗi đọc ảnh/file.");

      // 3.2 Chốt lưu vào Database (Gắn signal)
      const confirmRes = await fetch(
        `${API_BASE}/api/upload/confirm/${uploadData.file_id}`,
        {
          method: "POST",
          signal: signal,
        },
      );
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error("Lỗi khi lưu lịch");

      // 3.3 Tải lại danh sách lịch (Gắn signal)
      const getRes = await fetch(`${API_BASE}/api/sessions`, {
        signal: signal,
      });
      const allSessions = await getRes.json();

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
        date_ranges: item.date_ranges || [],
      }));

      // 3.4 Hiển thị thông báo
      if (confirmData.warnings && confirmData.warnings.length > 0) {
        Alert.alert(
          "Đã lưu lịch dạy!",
          `Hệ thống phát hiện trùng lặp:\n- ${confirmData.warnings[0]}`,
          [{ text: "Đã hiểu" }],
        );
      } else {
        Alert.alert(
          "Hoàn tất!",
          `Đã thêm thành công ${confirmData.sessions_saved} lớp học.`,
        );
      }

      if (typeof onSuccess === "function") onSuccess(mappedData);
      setStatus("IDLE"); // Hoàn tất an toàn
    } catch (error) {
      // Nếu lỗi là do người dùng bấm nút Hủy thì Im lặng lướt qua
      if (error.name === "AbortError") {
        console.log("Người dùng đã chủ động hủy tiến trình.");
      } else {
        // Lỗi thật (mất mạng, server sập...) thì mới hiện Alert
        console.error("Upload Error:", error);
        Alert.alert("Lỗi Upload", error.message);
        setStatus("IDLE");
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Thêm Lịch Dạy</Text>
        <Text style={styles.subtitle}>
          Quét bằng camera hoặc tải file PDF/Excel
        </Text>
      </View>

      <View style={styles.content}>
        {scannedImage && status === "PROCESSING" && (
          <Image source={{ uri: scannedImage }} style={styles.previewImage} />
        )}

        {status === "PROCESSING" ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF3B30" />
            <Text style={styles.loadingText}>Đang xử lý...</Text>

            {/* THÊM NÚT HỦY TẠI ĐÂY */}
            <TouchableOpacity style={styles.btnCancel} onPress={handleCancel}>
              <Text style={styles.btnTextCancel}>Hủy quá trình</Text>
            </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  header: { padding: 20, paddingTop: 10, backgroundColor: "#FFF" },
  title: { fontSize: 24, fontWeight: "bold", color: "#1C1C1E" },
  subtitle: { fontSize: 14, color: "#8E8E93", marginTop: 5 },
  content: { flex: 1, justifyContent: "center", padding: 20 },
  buttonGroup: { gap: 16 },
  button: { padding: 18, borderRadius: 12, alignItems: "center", elevation: 3 },
  btnScan: { backgroundColor: "#FF3B30" },
  btnFile: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D1D6",
  },
  btnTextScan: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  btnTextFile: { color: "#1C1C1E", fontSize: 16, fontWeight: "600" },

  loadingBox: { alignItems: "center", padding: 20 },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#8E8E93",
    marginBottom: 20,
  },
  previewImage: {
    width: "100%",
    height: 300,
    resizeMode: "contain",
    marginBottom: 20,
    borderRadius: 10,
  },

  // Style cho nút hủy
  btnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    backgroundColor: "#E5E5EA", // Màu xám nhạt trung tính
  },
  btnTextCancel: {
    color: "#FF3B30", // Chữ đỏ cảnh báo
    fontSize: 16,
    fontWeight: "600",
  },
});
