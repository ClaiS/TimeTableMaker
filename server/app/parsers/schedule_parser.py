"""
schedule_parser.py
------------------
Parse lịch dạy từ 3 nguồn:
  - PDF  → pdfplumber + PyMuPDF fallback
  - Excel (.xlsx / .xls) → openpyxl / pandas
  - Image (.jpg/.png…)   → PaddleOCR

Trả về list[ParsedSession] chuẩn hoá sẵn để insert DB.
"""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── constants ────────────────────────────────────────────────────────────────

# Mapping thứ tiếng Việt → số (2=T2 … 8=CN)
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
    "BKU":     ["bku", "bách khoa", "hcmut"],
    "UIT":     ["uit", "công nghệ thông tin"],
    "UEL":     ["uel", "kinh tế - luật", "kinh te luat"],
    "HCMUTE":  ["hcmute", "sư phạm kỹ thuật", "spkt"],
    "TDTU":    ["tdtu", "tôn đức thắng"],
    "HCMUAF":  ["hcmuaf", "nông lâm"],
    "UEF":     ["uef", "kinh tế tài chính"],
    "VLU":     ["vlu", "văn lang"],
    "HUI":     ["hui", "công nghiệp tp"],
    "HCMUS":   ["hcmus", "khoa học tự nhiên"],
}

# Học kỳ pattern: "HK1 2024-2025", "Học kỳ 2 năm 2025-2026", "HK2 25-26" …
HK_PATTERN = re.compile(
    r"(?:học kỳ|hk)\s*([12i]{1,2})[^\d]*(\d{2,4}[-/]\d{2,4})",
    re.IGNORECASE | re.UNICODE,
)

# Tiết học pattern: "Tiết 1-5", "tiết: 7", "từ tiết 3 đến tiết 6" …
TIET_PATTERN = re.compile(
    r"ti[eế]t[:\s]*(\d{1,2})(?:\s*[-–đến]+\s*(\d{1,2}))?",
    re.IGNORECASE,
)

# Phòng pattern: "P.B2-401", "Phòng A4.01", "B2.401"
PHONG_PATTERN = re.compile(
    r"(?:p\.|phòng\s+)?([A-Z]\d[\w\.\-]{1,8})",
    re.IGNORECASE,
)

# Mã môn: 2-4 chữ cái + 3-4 số  (e.g. CMP101, IT3015)
MAMON_PATTERN = re.compile(r"\b([A-Z]{2,4}\d{3,4})\b")


# ── dataclass output ──────────────────────────────────────────────────────────

@dataclass
class ParsedSession:
    ma_mon:        str
    ten_mon:       str
    thu:           int            # 2-8
    tiet_bat_dau:  int            # 1-15
    so_tiet:       int            # >= 1
    truong:        str            = "OTHER"
    hoc_ky:        Optional[str]  = None
    phong:         Optional[str]  = None
    nhom:          Optional[str]  = None
    ten_lop:       Optional[str]  = None
    si_so:         Optional[int]  = None
    status:        str            = "normal"


@dataclass
class ParseResult:
    sessions:  list[ParsedSession] = field(default_factory=list)
    truong:    str                 = "OTHER"
    hoc_ky:    Optional[str]       = None
    raw_text:  str                 = ""
    errors:    list[str]           = field(default_factory=list)


# ── helpers ───────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Chuẩn hoá unicode NFC, lower, strip."""
    return unicodedata.normalize("NFC", s).lower().strip()


def _detect_school(text: str) -> str:
    t = _norm(text)
    for school, kws in SCHOOL_KEYWORDS.items():
        if any(k in t for k in kws):
            return school
    return "OTHER"


def _detect_hk(text: str) -> Optional[str]:
    m = HK_PATTERN.search(text)
    if m:
        return f"HK{m.group(1).upper()} {m.group(2)}"
    return None


def _parse_thu(cell: str) -> Optional[int]:
    k = _norm(str(cell)).replace(".", "").strip()
    return THU_MAP.get(k)


def _parse_tiet(cell: str) -> tuple[Optional[int], Optional[int]]:
    """Trả (tiet_bat_dau, so_tiet) hoặc (None, None)."""
    m = TIET_PATTERN.search(str(cell))
    if not m:
        # Thử parse dạng "1-5" hoặc "7" thuần
        simple = re.search(r"(\d{1,2})\s*[-–]\s*(\d{1,2})", str(cell))
        if simple:
            a, b = int(simple.group(1)), int(simple.group(2))
            return a, max(1, b - a + 1)
        just_num = re.search(r"(\d{1,2})", str(cell))
        if just_num:
            n = int(just_num.group(1))
            return n, 1
        return None, None
    start = int(m.group(1))
    end   = int(m.group(2)) if m.group(2) else start
    return start, max(1, end - start + 1)


# ── PDF parser ────────────────────────────────────────────────────────────────

def _parse_pdf(data: bytes) -> ParseResult:
    result = ParseResult()
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            all_text = []
            all_rows: list[list] = []
            for page in pdf.pages:
                txt = page.extract_text() or ""
                all_text.append(txt)
                for tbl in (page.extract_tables() or []):
                    all_rows.extend(tbl)

        full_text = "\n".join(all_text)
        result.raw_text  = full_text[:4000]
        result.truong    = _detect_school(full_text[:500])
        result.hoc_ky    = _detect_hk(full_text[:1000])

        sessions = _rows_to_sessions(all_rows, result.truong, result.hoc_ky)
        if not sessions:
            sessions = _text_to_sessions(full_text, result.truong, result.hoc_ky)
        result.sessions = sessions

    except Exception as e:
        # Fallback PyMuPDF
        try:
            import fitz  # PyMuPDF
            doc  = fitz.open(stream=data, filetype="pdf")
            text = "\n".join(page.get_text() for page in doc)
            result.raw_text  = text[:4000]
            result.truong    = _detect_school(text[:500])
            result.hoc_ky    = _detect_hk(text[:1000])
            result.sessions  = _text_to_sessions(text, result.truong, result.hoc_ky)
        except Exception as e2:
            result.errors.append(f"PDF parse failed: {e} / {e2}")

    return result


# ── Excel parser ──────────────────────────────────────────────────────────────

def _parse_excel(data: bytes, filename: str = "") -> ParseResult:
    result = ParseResult()
    try:
        import pandas as pd

        engine = "xlrd" if filename.lower().endswith(".xls") else "openpyxl"
        xf = pd.ExcelFile(io.BytesIO(data), engine=engine)

        all_rows: list[list] = []
        header_text = ""

        for sheet in xf.sheet_names:
            df = xf.parse(sheet, header=None, dtype=str).fillna("")
            # Lấy vài dòng đầu để detect trường/HK
            header_text += " ".join(
                str(v) for v in df.iloc[:5].values.flatten()
            ) + " "
            for row in df.values.tolist():
                all_rows.append([str(c) for c in row])

        result.truong  = _detect_school(header_text)
        result.hoc_ky  = _detect_hk(header_text)
        result.raw_text = header_text[:2000]
        result.sessions = _rows_to_sessions(all_rows, result.truong, result.hoc_ky)

    except Exception as e:
        result.errors.append(f"Excel parse failed: {e}")

    return result


# ── Image parser (PaddleOCR) ──────────────────────────────────────────────────

def _parse_image(data: bytes) -> ParseResult:
    result = ParseResult()
    try:
        import numpy as np
        from PIL import Image as PILImage
        from paddleocr import PaddleOCR

        img     = PILImage.open(io.BytesIO(data)).convert("RGB")
        img_arr = np.array(img)

        ocr = PaddleOCR(use_angle_cls=True, lang="ch", show_log=False)
        ocr_result = ocr.ocr(img_arr, cls=True)

        lines = []
        if ocr_result and ocr_result[0]:
            for item in ocr_result[0]:
                text, conf = item[1]
                if conf > 0.5:
                    lines.append(text)

        full_text        = "\n".join(lines)
        result.raw_text  = full_text[:4000]
        result.truong    = _detect_school(full_text[:500])
        result.hoc_ky    = _detect_hk(full_text[:1000])
        result.sessions  = _text_to_sessions(full_text, result.truong, result.hoc_ky)

    except Exception as e:
        result.errors.append(f"Image OCR failed: {e}")

    return result


# ── Row-based parser (cho bảng có cột rõ ràng) ───────────────────────────────

# Tên cột phổ biến trong file lịch giảng dạy đại học VN
_COL_ALIASES = {
    "ma_mon":       ["mã môn", "ma mon", "mã hp", "ma hp", "subject code", "mã học phần"],
    "ten_mon":      ["tên môn", "ten mon", "tên học phần", "học phần", "subject name", "tên hp"],
    "thu":          ["thứ", "thu", "day", "ngày", "ngay"],
    "tiet":         ["tiết", "tiet", "period", "ca học", "ca hoc", "tiết bắt đầu"],
    "so_tiet":      ["số tiết", "so tiet", "tổng tiết", "sl tiết"],
    "phong":        ["phòng", "phong", "room", "địa điểm", "dia diem"],
    "nhom":         ["nhóm", "nhom", "group", "lớp", "lop"],
    "si_so":        ["sĩ số", "si so", "số sv", "so sv"],
    "hoc_ky":       ["học kỳ", "hoc ky", "semester", "hk"],
}


def _find_header_row(rows: list[list]) -> tuple[int, dict[str, int]]:
    """Tìm dòng header và map cột → index."""
    for i, row in enumerate(rows[:20]):
        mapping: dict[str, int] = {}
        row_norm = [_norm(str(c)) for c in row]
        for field_name, aliases in _COL_ALIASES.items():
            for j, cell in enumerate(row_norm):
                if any(a in cell for a in aliases):
                    mapping[field_name] = j
                    break
        # Cần ít nhất: ten_mon + (thu hoặc tiet)
        if "ten_mon" in mapping and ("thu" in mapping or "tiet" in mapping):
            return i, mapping
    return -1, {}


def _rows_to_sessions(
    rows: list[list],
    truong: str,
    hoc_ky: Optional[str],
) -> list[ParsedSession]:
    header_idx, col_map = _find_header_row(rows)
    if header_idx < 0:
        return []

    sessions: list[ParsedSession] = []

    for row in rows[header_idx + 1:]:
        if not any(str(c).strip() for c in row):
            continue  # dòng trống

        def get(key: str, default: str = "") -> str:
            idx = col_map.get(key)
            if idx is None or idx >= len(row):
                return default
            return str(row[idx]).strip()

        ten_mon = get("ten_mon")
        if not ten_mon or len(ten_mon) < 2:
            continue

        # Mã môn: lấy từ cột hoặc detect từ tên
        ma_mon = get("ma_mon")
        if not ma_mon:
            m = MAMON_PATTERN.search(ten_mon)
            ma_mon = m.group(1) if m else "N/A"

        # Thứ
        thu_raw = get("thu")
        thu = _parse_thu(thu_raw)
        if thu is None:
            continue  # bắt buộc có thứ

        # Tiết
        tiet_raw = get("tiet")
        tbd, so_tiet = _parse_tiet(tiet_raw)
        if tbd is None:
            continue

        # So tiết override
        so_tiet_raw = get("so_tiet")
        if so_tiet_raw:
            try:
                so_tiet = int(so_tiet_raw)
            except ValueError:
                pass

        # Phòng
        phong_raw = get("phong")
        phong = phong_raw if phong_raw else None

        # Nhóm/lớp
        nhom = get("nhom") or None

        # Sĩ số
        si_so_raw = get("si_so")
        si_so: Optional[int] = None
        try:
            si_so = int(si_so_raw) if si_so_raw else None
        except ValueError:
            pass

        # Học kỳ override từ cột
        hk_cell = get("hoc_ky")
        row_hk  = _detect_hk(hk_cell) or hoc_ky

        sessions.append(ParsedSession(
            ma_mon       = ma_mon.upper(),
            ten_mon      = ten_mon,
            thu          = thu,
            tiet_bat_dau = tbd,
            so_tiet      = so_tiet or 1,
            truong       = truong,
            hoc_ky       = row_hk,
            phong        = phong,
            nhom         = nhom,
            si_so        = si_so,
        ))

    return sessions


# ── Text-based parser (fallback khi không có bảng rõ) ────────────────────────

def _text_to_sessions(
    text: str,
    truong: str,
    hoc_ky: Optional[str],
) -> list[ParsedSession]:
    """
    Cố gắng extract từ văn bản thuần.
    Tìm mẫu: "[Mã môn] [Tên môn] Thứ X Tiết Y-Z Phòng P"
    """
    sessions: list[ParsedSession] = []
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    for i, line in enumerate(lines):
        # Cần có thứ trong dòng
        thu = None
        for alias, val in THU_MAP.items():
            if re.search(rf"\b{re.escape(alias)}\b", _norm(line)):
                thu = val
                break
        if thu is None:
            continue

        # Tiết
        tbd, so_tiet = _parse_tiet(line)
        if tbd is None:
            continue

        # Mã môn
        ma_match = MAMON_PATTERN.search(line)
        ma_mon   = ma_match.group(1) if ma_match else "N/A"

        # Tên môn: lấy từ dòng trước hoặc cùng dòng (heuristic)
        ten_mon = line
        # Thử dọn bớt token đã nhận diện
        ten_mon = re.sub(r"\bthứ\s+\d\b", "", ten_mon, flags=re.IGNORECASE)
        ten_mon = TIET_PATTERN.sub("", ten_mon)
        ten_mon = PHONG_PATTERN.sub("", ten_mon)
        ten_mon = MAMON_PATTERN.sub("", ten_mon)
        ten_mon = re.sub(r"\s{2,}", " ", ten_mon).strip(" -–|/\\")
        if len(ten_mon) < 3:
            # Lấy dòng trước
            ten_mon = lines[i - 1] if i > 0 else "Học phần không xác định"

        # Phòng
        phong_m = PHONG_PATTERN.search(line)
        phong   = phong_m.group(1) if phong_m else None

        sessions.append(ParsedSession(
            ma_mon       = ma_mon.upper(),
            ten_mon      = ten_mon[:100],
            thu          = thu,
            tiet_bat_dau = tbd,
            so_tiet      = so_tiet or 1,
            truong       = truong,
            hoc_ky       = hoc_ky,
            phong        = phong,
        ))

    return sessions


# ── Public entry point ────────────────────────────────────────────────────────

def parse_schedule(data: bytes, filename: str) -> ParseResult:
    """
    Dispatch theo extension.
    filename chỉ dùng để lấy extension — không cần path thật.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return _parse_pdf(data)
    elif ext in (".xlsx", ".xls"):
        return _parse_excel(data, filename)
    elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"):
        return _parse_image(data)
    else:
        # Thử PDF trước, fallback image
        result = _parse_pdf(data)
        if not result.sessions:
            result = _parse_image(data)
        return result
