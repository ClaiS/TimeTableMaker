"""
schedule_parser.py
------------------
Parse lịch dạy từ 3 nguồn:
  - PDF  → pdfplumber (Chính xác 100% với form HUTECH)
  - Excel (.xlsx / .xls) → openpyxl / pandas
  - Image (.jpg/.png)   → PaddleOCR
"""

import re
import io
import cv2
import numpy as np
import pdfplumber
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
@dataclass
class ParsedSession:
    ma_mon: str
    ten_mon: str
    thu: int
    tiet_bat_dau: int
    so_tiet: int
    truong: str
    hoc_ky: Optional[str] = None
    phong: Optional[str] = None
    nhom: Optional[str] = None
    ten_lop: Optional[str] = None
    si_so: Optional[int] = None
    status: str = "normal"

@dataclass
class ParseResult:
    sessions: List[ParsedSession] = field(default_factory=list)
    truong: str = "OTHER"
    hoc_ky: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    raw_text: str = ""

# ── Map ngày trong tuần ───────────────────────────────────────────────────────
THU_MAP = {
    "2": 2, "hai": 2, "thứ 2": 2,
    "3": 3, "ba": 3, "thứ 3": 3,
    "4": 4, "tư": 4, "thứ 4": 4,
    "5": 5, "năm": 5, "thứ 5": 5,
    "6": 6, "sáu": 6, "thứ 6": 6,
    "7": 7, "bảy": 7, "thứ 7": 7,
    "8": 8, "cn": 8, "chủ nhật": 8, "chủnhật": 8
}

# ── 1. LUỒNG XỬ LÝ PDF (Dùng pdfplumber) ──────────────────────────────────────

def _parse_pdf(data: bytes) -> ParseResult:
    sessions = []
    
    # Mở file PDF từ byte data
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            # Lấy tất cả các bảng (tables) trên trang
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                
                # Tìm dòng tiêu đề (Header) của bảng để xác định đúng bảng Lịch dạy
                header_idx = -1
                for i, row in enumerate(table):
                    row_text = " ".join([str(cell).strip() for cell in row if cell])
                    # Nếu dòng có chứa chữ Mã MH và Môn -> Nó là header Lịch HUTECH
                    if "Mã MH" in row_text and "Môn" in row_text:
                        header_idx = i
                        break
                
                if header_idx == -1:
                    continue # Bảng này không phải bảng lịch dạy, bỏ qua
                
                # Bắt đầu đọc từ dòng bên dưới Header
                for row in table[header_idx + 1:]:
                    # Lọc dòng trống hoặc không đủ cột (Form HUTECH có 13 cột)
                    if not row or len(row) < 12:
                        continue
                    
                    # Clean dữ liệu: xóa ký tự xuống dòng (\n) trong các ô (cell)
                    cleaned_row = [str(cell).replace("\n", " ").strip() if cell else "" for cell in row]
                    
                    ma_mon = cleaned_row[3]
                    if not ma_mon: 
                        continue # Bỏ qua nếu không có mã môn (thường là dòng ghi chú)
                    
                    # Trích xuất dữ liệu theo đúng thứ tự cột file PDF HUTECH
                    ten_mon = cleaned_row[4]
                    nhom = cleaned_row[1]
                    si_so_str = cleaned_row[6]
                    thu_str = cleaned_row[7].lower()
                    tbd_str = cleaned_row[8]
                    so_tiet_str = cleaned_row[9]
                    phong = cleaned_row[10]
                    ten_lop = cleaned_row[11]
                    
                    try:
                        thu = int(thu_str) if thu_str.isdigit() else THU_MAP.get(thu_str, 2)
                        tbd = int(tbd_str)
                        so_tiet = int(so_tiet_str)
                        si_so = int(si_so_str) if si_so_str.isdigit() else 0
                        
                        sessions.append(ParsedSession(
                            ma_mon=ma_mon,
                            ten_mon=ten_mon,
                            thu=thu,
                            tiet_bat_dau=tbd,
                            so_tiet=so_tiet,
                            truong="HUTECH", # Mặc định
                            phong=phong,
                            ten_lop=ten_lop,
                            nhom=nhom,
                            si_so=si_so
                        ))
                    except ValueError:
                        continue # Lỗi ép kiểu số, bỏ qua dòng rác

    return ParseResult(sessions=sessions)

# ── 2. LUỒNG XỬ LÝ ẢNH CHỤP (Dùng PaddleOCR) ──────────────────────────────────

# Khởi tạo OCR ở dạng Singleton (chỉ load model 1 lần duy nhất để tránh nghẽn RAM)
_ocr_engine = None

def _get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR
        # Cấu hình AI chuyên đọc tiếng Việt, tự động xoay ảnh nếu ngược
        _ocr_engine = PaddleOCR(use_angle_cls=True, lang='vi', show_log=False)
    return _ocr_engine

def _parse_image(data: bytes) -> ParseResult:
    engine = _get_ocr_engine()
    np_arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Lỗi: Không thể đọc được file ảnh.")

    ocr_result = engine.ocr(img, cls=True)
    if not ocr_result or not ocr_result[0]:
        return ParseResult(sessions=[])

    blocks = []
    for item in ocr_result[0]:
        box = item[0]
        text = item[1][0]
        x_min = min(p[0] for p in box)
        x_max = max(p[0] for p in box)
        y_center = sum(p[1] for p in box) / 4.0
        blocks.append({'text': text, 'x_min': x_min, 'x_max': x_max, 'y_center': y_center})

    blocks.sort(key=lambda b: b['y_center'])

    # 1. TÌM NEO (DÒNG) DỰA VÀO MÃ MÔN
    anchors = [b for b in blocks if re.search(r'^[A-Z]{3,4}\d{3}', b['text'].strip())]
    if not anchors:
        return ParseResult(sessions=[])

    y_boundaries = [0]
    for i in range(len(anchors) - 1):
        y_boundaries.append((anchors[i]['y_center'] + anchors[i+1]['y_center']) / 2.0)
    y_boundaries.append(float('inf'))

    sessions = []
    raw_texts_debug = []

    for i in range(len(anchors)):
        y_start, y_end = y_boundaries[i], y_boundaries[i+1]
        row_blocks = [b for b in blocks if y_start <= b['y_center'] < y_end]
        row_blocks.sort(key=lambda b: b['x_min'])

        # 2. CHIA CỘT (TẠO MA TRẬN X)
        cols = []
        for b in row_blocks:
            placed = False
            for col in cols:
                # Nếu giao nhau hoặc nằm sát nhau trên trục X (sai số 25px)
                if col['x_max'] > b['x_min'] - 25: 
                    col['blocks'].append(b)
                    col['x_min'] = min(col['x_min'], b['x_min'])
                    col['x_max'] = max(col['x_max'], b['x_max'])
                    placed = True
                    break
            if not placed:
                cols.append({'x_min': b['x_min'], 'x_max': b['x_max'], 'blocks': [b]})

        # 3. GỘP DATA TRONG CỘT
        col_texts = []
        for col in cols:
            col['blocks'].sort(key=lambda b: b['y_center']) # Từ trên xuống
            text = " ".join([b['text'] for b in col['blocks']])
            
            # Xử lý số bị rớt dòng: "10 3" -> "103"
            text = re.sub(r'(\d)\s+(\d)', r'\1\2', text)
            # Xử lý Tên lớp bị rớt dòng: "23DTHA1, 23DTHA2" -> "23DTHA1,23DTHA2"
            text = re.sub(r'\s*,\s*', ',', text)
            col_texts.append(text.strip())

        full_row_str = " | ".join(col_texts)
        raw_texts_debug.append(full_row_str)

        # 4. TRÍCH XUẤT THEO VỊ TRÍ CỘT (MAPPING)
        # Bắt Ngày Dạy (Session Date Ranges)
        dates = re.findall(r'\d{2}/\d{2}/\d{4}', full_row_str)
        date_ranges = []
        if len(dates) >= 2:
            for j in range(0, len(dates)-1, 2):
                date_ranges.append(f"{dates[j]} - {dates[j+1]}")
        elif len(dates) == 1:
            date_ranges.append(dates[0])

        # Tìm index các cột trụ cột
        ma_mon = next((c for c in col_texts if re.search(r'^[A-Z]{3,4}\d{3}', c)), "UNKNOWN")
        ma_mon_idx = col_texts.index(ma_mon) if ma_mon in col_texts else -1

        phong = next((c for c in col_texts if re.search(r'[A-E]\d-\d{2}\.\d{2}', c)), "UNKNOWN")
        phong_idx = col_texts.index(phong) if phong in col_texts else -1

        # Gán giá trị theo Index tương đối
        ten_mon = "UNKNOWN"
        nhom = "01"
        ten_lop = "UNKNOWN"
        
        if ma_mon_idx != -1:
            # Tên môn thường ngay sau Mã môn
            if ma_mon_idx + 1 < len(col_texts):
                ten_mon = re.sub(r'\d+$', '', col_texts[ma_mon_idx + 1]).strip()
            # Nhóm thường ngay trước Mã môn
            if ma_mon_idx > 0:
                nhom_match = re.search(r'\d{2}', col_texts[ma_mon_idx - 1])
                nhom = nhom_match.group() if nhom_match else "01"

        if phong_idx != -1 and phong_idx + 1 < len(col_texts):
            # Tên lớp thường ngay sau Phòng
            ten_lop = col_texts[phong_idx + 1]

        # Bóc tách mảng 5 con số: [Tín chỉ, Sĩ số, Thứ, Tiết BĐ, Số tiết]
        # Nằm giữa Tên Môn và Phòng
        start_idx = ma_mon_idx + 2 if ma_mon_idx != -1 else 0
        end_idx = phong_idx if phong_idx != -1 else len(col_texts)
        
        numbers = []
        for c in col_texts[start_idx:end_idx]:
            numbers.extend([int(n) for n in re.findall(r'\b\d+\b', c)])

        si_so, thu, tbd, so_tiet = 0, 2, 1, 3
        if len(numbers) >= 5: # [TC, Sĩ số, Thứ, TBD, ST]
            si_so = numbers[1]
            thu = numbers[2] if 2 <= numbers[2] <= 8 else 2
            tbd = numbers[3] if 1 <= numbers[3] <= 15 else 1
            so_tiet = numbers[4]
        elif len(numbers) == 4: # Lỡ AI quét sót Tín chỉ
            si_so = numbers[0]
            thu = numbers[1] if 2 <= numbers[1] <= 8 else 2
            tbd = numbers[2] if 1 <= numbers[2] <= 15 else 1
            so_tiet = numbers[3]

        sessions.append(ParsedSession(
            ma_mon=ma_mon, ten_mon=ten_mon, thu=thu, tiet_bat_dau=tbd, so_tiet=so_tiet,
            truong="HUTECH", phong=phong, ten_lop=ten_lop, nhom=nhom, si_so=si_so,
            date_ranges=date_ranges, status="normal"
        ))

    return ParseResult(sessions=sessions, raw_text="\n".join(raw_texts_debug))

# ── 3. HÀM CHUNG NHẬN YÊU CẦU TỪ ROUTER ───────────────────────────────────────

def parse_schedule(data: bytes, filename: str) -> ParseResult:
    """
    Phân luồng xử lý tùy theo định dạng file upload từ Mobile.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return _parse_pdf(data)
    elif ext in (".jpg", ".jpeg", ".png"):
        return _parse_image(data)
    else:
        # Tạm thời chưa xử lý Excel trong phiên bản này
        raise ValueError("Định dạng file chưa được hỗ trợ.")