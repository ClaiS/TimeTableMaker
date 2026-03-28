/**
 * UploadScreen.js — Native Document Scanner Approach
 * ─────────────────────────────────────────────────────────────────────────────
 * Flow:
 * IDLE       → Chọn Scan hoặc Upload file
 * SCANNING   → Mở Native Scanner của OS (tự động tìm viền, tự chụp, cắt gọt)
 * PROCESSING → Gửi ảnh đã cắt nét lên Server xử lý (PaddleOCR)
 * RESULT     → Hiển thị kết quả lịch dạy
 */

import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import {
  ActivityIndicator, Alert,
  Image,
  Platform, SafeAreaView,
  StyleSheet,
  Text, TouchableOpacity,
  View
} from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';

// ─── Config ────────────────────────────────────────────────────────────────────
// Đảm bảo trỏ đúng IP của máy tính tính chạy backend mạng LAN (không dùng localhost)
const API_BASE = __DEV__ ? 'http://127.0.0.1:8000' : 'https://your-server.com'; 

// ─── Component ─────────────────────────────────────────────────────────────────
export default function UploadScreen() {
  const [status, setStatus] = useState('IDLE'); // IDLE | PROCESSING
  const [scannedImage, setScannedImage] = useState(null);

  // 1. Hàm mở Native Scanner
  const handleScan = async () => {
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        letUserAdjustCrop: true, // Cho phép user chỉnh lại 4 góc nếu OS nhận nhầm
      });

      if (status === 'success' && scannedImages && scannedImages.length > 0) {
        setScannedImage(scannedImages[0]);
        uploadToServer(scannedImages[0], 'image/jpeg');
      }
    } catch (error) {
      console.error("Scanner Error:", error);
      Alert.alert('Lỗi', 'Không thể khởi động máy quét tài liệu.');
    }
  };

  // 2. Hàm Upload File (PDF/Excel)
  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const file = result.assets[0];
        uploadToServer(file.uri, file.mimeType || 'application/pdf');
      }
    } catch (err) {
      console.error('Lỗi chọn file:', err);
    }
  };

  // 3. Hàm gửi File/Ảnh lên Backend
  const uploadToServer = async (fileUri, mimeType) => {
    setStatus('PROCESSING');
    try {
      // Đọc file để lấy filename (tách từ path)
      const filename = fileUri.split('/').pop() || 'upload.jpg';

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? fileUri.replace('file://', '') : fileUri,
        name: filename,
        type: mimeType,
      });

      // TODO: Đổi endpoint '/api/upload' thành endpoint thực tế của Backend
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Lỗi từ server');
      }

      Alert.alert('Thành công', 'Đã phân tích lịch dạy xong!');
      console.log("Parsed Data:", data);
      // TODO: Navigate sang màn hình xem kết quả / lưu DB
      
    } catch (error) {
      console.error('Upload Error:', error);
      Alert.alert('Lỗi Upload', error.message);
    } finally {
      setStatus('IDLE');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Thêm Lịch Dạy</Text>
        <Text style={styles.subtitle}>Quét bằng camera hoặc tải file PDF/Excel lên</Text>
      </View>

      <View style={styles.content}>
        {scannedImage && status === 'PROCESSING' && (
          <Image source={{ uri: scannedImage }} style={styles.previewImage} />
        )}

        {status === 'PROCESSING' ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF3B30" />
            <Text style={styles.loadingText}>Đang gửi lên server và xử lý AI...</Text>
          </View>
        ) : (
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={[styles.button, styles.btnScan]} onPress={handleScan}>
              <Text style={styles.btnTextScan}>📸 Quét tài liệu (Camera)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.btnFile]} onPress={handleUploadFile}>
              <Text style={styles.btnTextFile}>📄 Tải file PDF / Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { padding: 20, paddingTop: 40, backgroundColor: '#FFF' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1C1C1E' },
  subtitle: { fontSize: 14, color: '#8E8E93', marginTop: 5 },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  buttonGroup: { gap: 16 },
  button: { padding: 18, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  btnScan: { backgroundColor: '#FF3B30' }, // Red Primary
  btnFile: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D1D6' },
  btnTextScan: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  btnTextFile: { color: '#1C1C1E', fontSize: 16, fontWeight: '600' },
  loadingBox: { alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#8E8E93' },
  previewImage: { width: '100%', height: 300, resizeMode: 'contain', marginBottom: 20, borderRadius: 10 },
});