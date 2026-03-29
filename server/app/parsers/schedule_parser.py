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
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        image_part = {
            "mime_type": "image/jpeg",
            "data": data
        }
        
        prompt = """
        Bạn là một hệ thống trích xuất dữ liệu lịch giảng dạy đại học xuất sắc.
        Hãy đọc bức ảnh lịch dạy (của HUTECH) được cung cấp và trích xuất tất cả các buổi dạy thành một mảng JSON.
        
        Tuyệt đối không giải thích, chỉ trả về đúng định dạng JSON như mẫu sau:
        [
          {
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
            "date_ranges": ["05/02/2026 - 05/02/2026", "05/03/2026 - 02/04/2026"]
          }
        ]
        
        Quy tắc:
        1. Cột 'Tổ TH' (to_th): Nếu môn có thực hành sẽ có số (vd: 02), nếu ô trống thì để null.
        2. Cột 'Tín chỉ' (tin_chi): Trích xuất thành số nguyên.
        3. Cột 'Ngày học' có thể có nhiều khoảng thời gian, hãy gom hết vào mảng date_ranges.
        4. Tên môn không được chứa số thứ tự hay ký tự lạ.
        5. 'thu' (Thứ) là số nguyên từ 2 đến 8.
        6. Nếu cột 'Sĩ số' bị rớt dòng (vd 10 trên, 3 dưới), gộp lại thành 103.
        7. Nếu không thấy dữ liệu, hãy trả về mảng rỗng [].
        """

        response = model.generate_content([prompt, image_part])
        response_text = response.text.strip()
        
        # Clean markdown if any
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
            
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