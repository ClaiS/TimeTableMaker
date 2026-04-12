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
    sessions = []
    errors = []
    raw_text_parts = []

    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                raw_text_parts.append(page.extract_text() or "")
                tables = page.extract_tables()
                
                for table in tables:
                    if not table or len(table) < 2:
                        continue 

                    header_idx = -1
                    col_idx = {}
                    
                    # 1. RADAR DÒ TÌM HEADER BẢNG THỜI KHÓA BIỂU
                    for r_idx, row in enumerate(table[:15]): 
                        if not row: continue
                        row_strs = [str(c).replace('\n', ' ').strip().lower() if c else "" for c in row]
                        row_joined = " ".join(row_strs)
                        
                        # Phải có đủ 3 từ khóa này mới đích thị là bảng TKB (Né bảng điểm)
                        if "mã" in row_joined and "thứ" in row_joined and "tiết" in row_joined:
                            header_idx = r_idx
                            for i, col_name in enumerate(row_strs):
                                if "mã" in col_name: col_idx["ma_mon"] = i
                                elif "môn" in col_name and "mã" not in col_name: col_idx["ten_mon"] = i
                                elif "nhóm" in col_name: col_idx["nhom"] = i
                                elif "tổ" in col_name: col_idx["to_th"] = i
                                elif "tín" in col_name: col_idx["tin_chi"] = i
                                elif "sĩ" in col_name: col_idx["si_so"] = i
                                elif "thứ" in col_name: col_idx["thu"] = i
                                elif "bắt đầu" in col_name: col_idx["tiet_bat_dau"] = i
                                elif "số tiết" in col_name: col_idx["so_tiet"] = i
                                elif "phòng" in col_name: col_idx["phong"] = i
                                elif "lớp" in col_name: col_idx["ten_lop"] = i
                                elif "ngày" in col_name: col_idx["ngay_hoc"] = i
                            break
                    
                    # Nếu không tìm thấy Header -> Lướt qua (KHÔNG đọc bảng này)
                    if header_idx == -1 or "ma_mon" not in col_idx or "thu" not in col_idx:
                        continue

                    # 2. XỬ LÝ TỪNG DÒNG VÀ GIẢI NÉN Ô BỊ GỘP
                    for row in table[header_idx + 1:]:
                        if not row: continue
                        
                        processed_cells = []
                        max_sub_rows = 1 # Đếm xem ô này bị nhét bao nhiêu lớp bên trong
                        
                        for cell in row:
                            if not cell:
                                processed_cells.append([""])
                                continue
                            
                            val = str(cell)
                            # Khắc phục lỗi 1 lớp bị rớt chữ làm 2 dòng (Ví dụ: 23DTHA1,\n 23DTHA2)
                            val = re.sub(r',\s*\n\s*', ',', val)
                            
                            # Tách các lớp bị gộp chung do không có kẻ viền bảng
                            sub_vals = [v.strip() for v in re.split(r'\n{2,}', val) if v.strip()]
                            # Fallback: Nếu không có \n\n, thử tách bằng \n thông thường
                            if not sub_vals or len(sub_vals) == 1:
                                sub_vals = [v.strip() for v in re.split(r'\n', val) if v.strip()]
                                
                            if len(sub_vals) > max_sub_rows:
                                max_sub_rows = len(sub_vals)
                            processed_cells.append(sub_vals if sub_vals else [""])

                        # Giải nén từ 1 dòng dính chùm thành nhiều dòng bình thường
                        for i in range(max_sub_rows):
                            def get_val(key):
                                if key not in col_idx: return ""
                                idx = col_idx[key]
                                if idx >= len(processed_cells): return ""
                                cell_list = processed_cells[idx]
                                # Nếu cột này bị merge dọc, lấy giá trị đầu tiên/cuối cùng bù vào
                                return cell_list[i] if i < len(cell_list) else (cell_list[-1] if cell_list else "")

                            ma_mon = get_val("ma_mon").replace('\n', '')
                            if not ma_mon or ma_mon.lower() == "mã mh" or len(ma_mon) < 3: 
                                continue 

                            ten_mon = get_val("ten_mon").replace('\n', ' ')
                            nhom = get_val("nhom").replace('\n', '')
                            to_th = get_val("to_th").replace('\n', '')
                            phong = get_val("phong").replace('\n', '')
                            ten_lop = get_val("ten_lop").replace('\n', ',') 
                            
                            try: tin_chi = int(re.sub(r'\D', '', get_val("tin_chi")))
                            except: tin_chi = None
                            
                            try: si_so = int(re.sub(r'\D', '', get_val("si_so")))
                            except: si_so = None
                            
                            try: thu = int(re.sub(r'\D', '', get_val("thu")))
                            except: thu = 2
                            
                            try: tiet_bat_dau = int(re.sub(r'\D', '', get_val("tiet_bat_dau")))
                            except: tiet_bat_dau = 1
                            
                            try: so_tiet = int(re.sub(r'\D', '', get_val("so_tiet")))
                            except: so_tiet = 3

                            # Lọc ngày tháng (Bắt mọi định dạng DD/MM/YYYY)
                            ngay_hoc_raw = get_val("ngay_hoc")
                            date_ranges = []
                            dates = re.findall(r'\d{2}/\d{2}/\d{4}', ngay_hoc_raw)
                            
                            for j in range(0, len(dates), 2):
                                if j + 1 < len(dates):
                                    date_ranges.append(f"{dates[j]} - {dates[j+1]}")
                                else:
                                    date_ranges.append(f"{dates[j]} - {dates[j]}")

                            sessions.append(ParsedSession(
                                ma_mon=ma_mon,
                                ten_mon=ten_mon,
                                thu=thu,
                                tiet_bat_dau=tiet_bat_dau,
                                so_tiet=so_tiet,
                                truong="HUTECH",
                                phong=phong if phong else None,
                                ten_lop=ten_lop if ten_lop else None,
                                nhom=nhom if nhom else None,
                                to_th=to_th if to_th else None,
                                tin_chi=tin_chi,
                                si_so=si_so,
                                date_ranges=date_ranges,
                                status="normal"
                            ))
                            
    except Exception as e:
        errors.append(f"Lỗi phân tích PDF: {str(e)}")

    return ParseResult(sessions=sessions, raw_text="\n".join(raw_text_parts), errors=errors)

def _parse_excel(data: bytes, filename: str = "") -> ParseResult:
    # ... logic pandas cũ của bạn ...
    return ParseResult(sessions=[])


# ── Image parser (Dùng Gemini 2.5 Flash) ──────────────────────────────────────

def _parse_with_gemini(data: bytes, mime_type: str) -> ParseResult:
    try:
        # ÉP KIỂU JSON & NHIỆT ĐỘ 0 ĐỂ ĐẢM BẢO CHÍNH XÁC
        model = genai.GenerativeModel(
            model_name='gemini-2.5-flash',
            generation_config={
                "temperature": 0.0, 
                "response_mime_type": "application/json" 
            }
        )
        
        # Nhét file PDF hoặc Ảnh vào trực tiếp cho AI
        document_part = {
            "mime_type": mime_type,
            "data": data
        }
        
        current_year = datetime.datetime.now().year
        
        prompt = f"""
        Bạn là một hệ thống trích xuất dữ liệu lịch giảng dạy đại học xuất sắc và cực kỳ tỉ mỉ.
        Nhiệm vụ: Đọc tệp tài liệu đính kèm (có thể là Ảnh hoặc PDF) và trích xuất TUYỆT ĐỐI TẤT CẢ các buổi dạy thành một mảng JSON.
        
        Quy tắc SỐNG CÒN (Bắt buộc tuân thủ 100%):
        1. KHÔNG ĐƯỢC BỎ SÓT: Rà soát bảng từ trên xuống dưới, từ trái qua phải. Có bao nhiêu dòng môn học, PHẢI tạo ra bấy nhiêu object. Việc bỏ sót là lỗi cực kỳ nghiêm trọng.
        2. CHUẨN HOÁ NGÀY THÁNG (date_ranges): 
           - Bắt buộc dùng định dạng "DD/MM/YYYY - DD/MM/YYYY".
           - Năm hiện tại đang là {current_year}. Nếu trên tài liệu chỉ ghi ngày/tháng (vd: 05/03) mà thiếu năm, HÃY TỰ ĐỘNG THÊM NĂM {current_year} VÀO.
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

        response = model.generate_content([prompt, document_part])
        response_text = response.text.strip()
        
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
        return ParseResult(sessions=[], errors=[f"Lỗi phân tích: {str(e)}"])

# def _parse_image_gemini(data: bytes) -> ParseResult:
#     try:
#         # 1. KHÓA SỰ SÁNG TẠO VÀ ÉP KIỂU JSON
#         model = genai.GenerativeModel(
#             model_name='gemini-2.5-flash',
#             generation_config={
#                 "temperature": 0.0, 
#                 "response_mime_type": "application/json" 
#             }
#         )
        
#         image_part = {
#             "mime_type": "image/jpeg",
#             "data": data
#         }
        
#         # 2. LẤY NĂM HIỆN TẠI ĐỂ TRUYỀN VÀO PROMPT
#         current_year = datetime.datetime.now().year
        
#         # 3. KỶ LUẬT THÉP VỚI F-STRING (Chú ý dùng {{ }} cho ngoặc nhọn của JSON)
#         prompt = f"""
#         Bạn là một hệ thống trích xuất dữ liệu lịch giảng dạy đại học xuất sắc và cực kỳ tỉ mỉ.
#         Nhiệm vụ: Đọc bức ảnh lịch dạy và trích xuất TUYỆT ĐỐI TẤT CẢ các buổi dạy thành một mảng JSON.
        
#         Quy tắc SỐNG CÒN (Bắt buộc tuân thủ 100%):
#         1. KHÔNG ĐƯỢC BỎ SÓT: Rà soát bảng từ trên xuống dưới, từ trái qua phải. Bức ảnh có bao nhiêu dòng môn học, PHẢI tạo ra bấy nhiêu object. Việc bỏ sót môn học là lỗi cực kỳ nghiêm trọng.
#         2. CHUẨN HOÁ NGÀY THÁNG (date_ranges): 
#            - Bắt buộc dùng định dạng "DD/MM/YYYY - DD/MM/YYYY".
#            - Năm hiện tại đang là {current_year}. Nếu trên ảnh chỉ ghi ngày/tháng (vd: 05/03) mà thiếu năm, HÃY TỰ ĐỘNG THÊM NĂM {current_year} VÀO.
#            - Tuyệt đối không tự bịa ngày tháng nếu không có.
#         3. Cột 'Tổ TH' (to_th): Nếu có số thì ghi số (vd: "02"), nếu không có thực hành thì để null.
#         4. Cột 'Tín chỉ' (tin_chi): Số nguyên.
#         5. Cột 'Sĩ số' (si_so): Số nguyên. Nếu rớt dòng (vd 10 trên 3 dưới), gộp thành 103.
#         6. Thứ (thu): Số nguyên từ 2 đến 8 (Chủ nhật là 8).
        
#         Định dạng JSON đầu ra BẮT BUỘC:
#         [
#           {{
#             "ma_mon": "CMP376",
#             "ten_mon": "Thực hành lập trình Web",
#             "tin_chi": 1,
#             "nhom": "31",
#             "to_th": "02",
#             "thu": 5,
#             "tiet_bat_dau": 7,
#             "so_tiet": 5,
#             "phong": "E1-04.06/1",
#             "ten_lop": "23DTHE3,23DTHE2",
#             "si_so": 28,
#             "date_ranges": ["05/02/{current_year} - 05/02/{current_year}", "05/03/{current_year} - 02/04/{current_year}"]
#           }}
#         ]
#         """

#         response = model.generate_content([prompt, image_part])
#         response_text = response.text.strip()
        
#         # Parse JSON an toàn
#         json_data = json.loads(response_text)
        
#         sessions = []
#         for item in json_data:
#             sessions.append(ParsedSession(
#                 ma_mon=item.get("ma_mon", "UNKNOWN"),
#                 ten_mon=item.get("ten_mon", "UNKNOWN"),
#                 thu=int(item.get("thu", 2)),
#                 tiet_bat_dau=int(item.get("tiet_bat_dau", 1)),
#                 so_tiet=int(item.get("so_tiet", 3)),
#                 truong="HUTECH",
#                 phong=item.get("phong"),
#                 ten_lop=item.get("ten_lop"),
#                 nhom=item.get("nhom"),
#                 to_th=item.get("to_th"),
#                 tin_chi=int(item.get("tin_chi", 0)) if item.get("tin_chi") else None,
#                 si_so=int(item.get("si_so", 0)),
#                 date_ranges=item.get("date_ranges", []),
#                 status="normal"
#             ))
            
#         return ParseResult(sessions=sessions, raw_text=response.text)

#     except Exception as e:
#         return ParseResult(sessions=[], errors=[f"Lỗi phân tích Gemini: {str(e)}"])


# ── Public entry point ────────────────────────────────────────────────────────

# def parse_schedule(data: bytes, filename: str) -> ParseResult:
#     ext = Path(filename).suffix.lower()

#     if ext == ".pdf":
#         return _parse_pdf(data)
#     elif ext in (".xlsx", ".xls"):
#         return _parse_excel(data, filename)
#     elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"):
#         return _parse_image_gemini(data)
#     else:
#         result = _parse_pdf(data)
#         if not result.sessions:
#             result = _parse_image_gemini(data)
#         return result
    
def parse_schedule(data: bytes, filename: str) -> ParseResult:
    ext = Path(filename).suffix.lower()

    # TẤT CẢ FILE ĐỀU ĐƯỢC ĐẨY THẲNG VÀO AI (Gemini Flash)
    if ext == ".pdf":
        return _parse_with_gemini(data, "application/pdf")
    elif ext in (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff"):
        return _parse_with_gemini(data, "image/jpeg")
    else:
        # Tạm thời chưa xử lý Excel, trả về mảng rỗng
        return ParseResult(sessions=[])