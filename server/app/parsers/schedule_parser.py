"""
schedule_parser.py
------------------
Parse lịch dạy từ 3 nguồn:
  - PDF  → pdfplumber + PyMuPDF fallback
  - Excel (.xlsx / .xls) → openpyxl / pandas
  - Image (.jpg/.png…)   → Gemini 1.5 Flash (AI API)

Trả về ParseResult chuẩn hoá sẵn để insert DB.
"""

from __future__ import annotations

import io
import re
import os
import json
import unicodedata
import datetime
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, List
import google.generativeai as genai

# Cấu hình Gemini API (Lấy từ .env)
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ── constants ────────────────────────────────────────────────────────────────

THU_MAP: dict[str, int] = {
    "2": 2, "hai": 2, "t2": 2, "thứ 2": 2, "thứ hai": 2,
    "3": 3, "ba":  3, "t3": 3, "thứ 3": 3, "thứ ba":  3,
    "4": 4, "tư":  4, "t4": 4, "thứ 4": 4, "thứ tư":  4,
    "5": 5, "năm": 5, "t5": 5, "thứ 5": 5, "thứ năm": 5,
    "6": 6, "sáu": 6, "t6": 6, "thứ 6": 6, "thứ sáu": 6,
    "7": 7, "bảy": 7, "t7": 7, "thứ 7": 7, "thứ bảy": 7,
    "cn": 8, "chủ nhật": 8, "chu nhat": 8,
}

SCHOOL_KEYWORDS: dict[str, list[str]] = {
    "HUTECH":  ["hutech", "công nghệ tp", "công nghệ thành phố"],
    # ... (Các trường khác)
}

# ── dataclass output ──────────────────────────────────────────────────────────

@dataclass
class ParsedSession:
    ma_mon:        str
    ten_mon:       str
    thu:           int
    tiet_bat_dau:  int
    so_tiet:       int
    truong:        str            = "OTHER"
    hoc_ky:        Optional[str]  = None
    phong:         Optional[str]  = None
    nhom:          Optional[str]  = None
    to_th:         Optional[str]  = None
    tin_chi:       Optional[int]  = None 
    ten_lop:       Optional[str]  = None
    si_so:         Optional[int]  = None
    status:        str            = "normal"
    date_ranges:   List[str]      = field(default_factory=list)


@dataclass
class ParseResult:
    sessions:  list[ParsedSession] = field(default_factory=list)
    truong:    str                 = "OTHER"
    hoc_ky:    Optional[str]       = None
    raw_text:  str                 = ""
    errors:    list[str]           = field(default_factory=list)


# ── PDF / Excel parser (GIỮ NGUYÊN LOGIC CŨ CỦA BẠN) ──────────────────────────
# (Tôi tóm tắt hàm ở đây để file gọn, nếu bạn đang dùng pdfplumber thì cứ để nguyên ruột hàm _parse_pdf và _parse_excel của bạn vào đây)

def _parse_pdf(data: bytes) -> ParseResult:
    # ... logic pdfplumber cũ của bạn ...
    return ParseResult(sessions=[])

def _parse_excel(data: bytes, filename: str = "") -> ParseResult:
    # ... logic pandas cũ của bạn ...
    return ParseResult(sessions=[])


# ── Image parser (Dùng Gemini 1.5 Flash) ──────────────────────────────────────

def _parse_image_gemini(data: bytes) -> ParseResult:
    try:
        # 1. KHÓA SỰ SÁNG TẠO VÀ ÉP KIỂU JSON
        model = genai.GenerativeModel(
            model_name='gemini-2.5-flash',
            generation_config={
                "temperature": 0.0, 
                "response_mime_type": "application/json" 
            }
        )
        
        image_part = {
            "mime_type": "image/jpeg",
            "data": data
        }
        
        # 2. LẤY NĂM HIỆN TẠI ĐỂ TRUYỀN VÀO PROMPT
        current_year = datetime.datetime.now().year
        
        # 3. KỶ LUẬT THÉP VỚI F-STRING (Chú ý dùng {{ }} cho ngoặc nhọn của JSON)
        prompt = f"""
        Bạn là một hệ thống trích xuất dữ liệu lịch giảng dạy đại học xuất sắc và cực kỳ tỉ mỉ.
        Nhiệm vụ: Đọc bức ảnh lịch dạy và trích xuất TUYỆT ĐỐI TẤT CẢ các buổi dạy thành một mảng JSON.
        
        Quy tắc SỐNG CÒN (Bắt buộc tuân thủ 100%):
        1. KHÔNG ĐƯỢC BỎ SÓT: Rà soát bảng từ trên xuống dưới, từ trái qua phải. Bức ảnh có bao nhiêu dòng môn học, PHẢI tạo ra bấy nhiêu object. Việc bỏ sót môn học là lỗi cực kỳ nghiêm trọng.
        2. CHUẨN HOÁ NGÀY THÁNG (date_ranges): 
           - Bắt buộc dùng định dạng "DD/MM/YYYY - DD/MM/YYYY".
           - Năm hiện tại đang là {current_year}. Nếu trên ảnh chỉ ghi ngày/tháng (vd: 05/03) mà thiếu năm, HÃY TỰ ĐỘNG THÊM NĂM {current_year} VÀO.
           - Tuyệt đối không tự bịa ngày tháng nếu không có.
        3. Cột 'Tổ TH' (to_th): Nếu có số thì ghi số (vd: "02"), nếu không có thực hành thì để null.
        4. Cột 'Tín chỉ' (tin_chi): Số nguyên.
        5. Cột 'Sĩ số' (si_so): Số nguyên. Nếu rớt dòng (vd 10 trên 3 dưới), gộp thành 103.
        6. Thứ (thu): Số nguyên từ 2 đến 8 (Chủ nhật là 8).
        
        Định dạng JSON đầu ra BẮT BUỘC:
        [
          {{
            "ma_mon": "CMP376",
            "ten_mon": "Thực hành lập trình Web",
            "tin_chi": 1,
            "nhom": "31",
            "to_th": "02",
            "thu": 5,
            "tiet_bat_dau": 7,
            "so_tiet": 5,
            "phong": "E1-04.06/1",
            "ten_lop": "23DTHE3,23DTHE2",
            "si_so": 28,
            "date_ranges": ["05/02/{current_year} - 05/02/{current_year}", "05/03/{current_year} - 02/04/{current_year}"]
          }}
        ]
        """

        response = model.generate_content([prompt, image_part])
        response_text = response.text.strip()
        
        # Parse JSON an toàn
        json_data = json.loads(response_text)
        
        sessions = []
        for item in json_data:
            sessions.append(ParsedSession(
                ma_mon=item.get("ma_mon", "UNKNOWN"),
                ten_mon=item.get("ten_mon", "UNKNOWN"),
                thu=int(item.get("thu", 2)),
                tiet_bat_dau=int(item.get("tiet_bat_dau", 1)),
                so_tiet=int(item.get("so_tiet", 3)),
                truong="HUTECH",
                phong=item.get("phong"),
                ten_lop=item.get("ten_lop"),
                nhom=item.get("nhom"),
                to_th=item.get("to_th"),
                tin_chi=int(item.get("tin_chi", 0)) if item.get("tin_chi") else None,
                si_so=int(item.get("si_so", 0)),
                date_ranges=item.get("date_ranges", []),
                status="normal"
            ))
            
        return ParseResult(sessions=sessions, raw_text=response.text)

    except Exception as e:
        return ParseResult(sessions=[], errors=[f"Lỗi phân tích Gemini: {str(e)}"])


# ── Public entry point ────────────────────────────────────────────────────────

def parse_schedule(data: bytes, filename: str) -> ParseResult:
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return _parse_pdf(data)
    elif ext in (".xlsx", ".xls"):
        return _parse_excel(data, filename)
    elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"):
        return _parse_image_gemini(data)
    else:
        result = _parse_pdf(data)
        if not result.sessions:
            result = _parse_image_gemini(data)
        return result