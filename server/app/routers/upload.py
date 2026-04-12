"""
routers/upload.py
-----------------
"""

from __future__ import annotations

import asyncio
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from app.database import get_db
# ĐÃ IMPORT THÊM SessionDateRange từ models.py
from app.models.models import TeachingSession, UploadedFile, SessionDateRange
from app.parsers.schedule_parser import ParsedSession, ParseResult, parse_schedule

router = APIRouter(prefix="/upload", tags=["upload"])

# ── Response schemas ──────────────────────────────────────────────────────────

class ParsedSessionOut(BaseModel):
    ma_mon:        str
    ten_mon:       str
    thu:           int
    tiet_bat_dau:  int
    so_tiet:       int
    tiet_ket_thuc: int
    truong:        str
    hoc_ky:        Optional[str]
    phong:         Optional[str]
    nhom:          Optional[str]
    to_th:         Optional[str]
    tin_chi:       Optional[int]
    ten_lop:       Optional[str]
    si_so:         Optional[int]
    status:        str
    date_ranges:   list[str] = []  # Đã thêm trường này để trả về UI

    @classmethod
    def from_parsed(cls, p: ParsedSession) -> "ParsedSessionOut":
        return cls(
            ma_mon        = p.ma_mon,
            ten_mon       = p.ten_mon,
            thu           = p.thu,
            tiet_bat_dau  = p.tiet_bat_dau,
            so_tiet       = p.so_tiet,
            tiet_ket_thuc = p.tiet_bat_dau + p.so_tiet - 1,
            truong        = p.truong,
            hoc_ky        = p.hoc_ky,
            phong         = p.phong,
            nhom          = p.nhom,
            to_th         = p.to_th,
            tin_chi       = p.tin_chi,
            ten_lop       = p.ten_lop,
            si_so         = p.si_so,
            status        = p.status,
            date_ranges   = getattr(p, 'date_ranges', [])
        )


class UploadPreviewResponse(BaseModel):
    file_id:       int
    file_name:     str
    file_type:     str
    truong:        str
    hoc_ky:        Optional[str]
    session_count: int
    sessions:      list[ParsedSessionOut]
    errors:        list[str]
    raw_text:      str


class ConfirmResponse(BaseModel):
    file_id:        int
    sessions_saved: int
    warnings:       list[str] = []


# Key: file_id → ParseResult
_preview_cache: dict[int, ParseResult] = {}

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=UploadPreviewResponse, status_code=200)
async def upload_file(
    file:    UploadFile = File(...),
    truong:  Optional[str] = Form(None),
    hoc_ky:  Optional[str] = Form(None),
    db:      AsyncSession = Depends(get_db),
):
    filename = file.filename or "upload.bin"
    data     = await file.read()

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in ("pdf", "xlsx", "xls", "jpg", "jpeg", "png", "bmp", "webp"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Định dạng '{ext}' chưa được hỗ trợ. Dùng PDF, Excel hoặc ảnh.",
        )

    db_file = UploadedFile(
        file_name     = filename,
        file_type     = ext,
        truong        = truong or "OTHER",
        hoc_ky        = hoc_ky,
        status        = "pending",
        session_count = 0,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    loop   = asyncio.get_event_loop()
    result: ParseResult = await loop.run_in_executor(
        None, parse_schedule, data, filename
    )

    if truong:
        result.truong = truong
        for s in result.sessions:
            s.truong = truong
    if hoc_ky:
        result.hoc_ky = hoc_ky
        for s in result.sessions:
            if not s.hoc_ky:
                s.hoc_ky = hoc_ky

    _preview_cache[db_file.id] = result

    await db.execute(
        update(UploadedFile)
        .where(UploadedFile.id == db_file.id)
        .values(
            truong        = result.truong,
            hoc_ky        = result.hoc_ky,
            session_count = len(result.sessions),
        )
    )
    await db.commit()

    return UploadPreviewResponse(
        file_id       = db_file.id,
        file_name     = filename,
        file_type     = ext,
        truong        = result.truong,
        hoc_ky        = result.hoc_ky,
        session_count = len(result.sessions),
        sessions      = [ParsedSessionOut.from_parsed(s) for s in result.sessions],
        errors        = result.errors,
        raw_text      = result.raw_text,
    )


@router.post("/confirm/{file_id}", response_model=ConfirmResponse)
async def confirm_upload(
    file_id:          int,
    selected_indices: Optional[list[int]] = None,
    db:               AsyncSession = Depends(get_db),
):
    result = _preview_cache.get(file_id)
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy preview. Hãy upload lại.")

    q = await db.execute(select(UploadedFile).where(UploadedFile.id == file_id))
    db_file = q.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File record không tồn tại.")

    sessions_to_save = result.sessions
    if selected_indices is not None:
        sessions_to_save = [result.sessions[i] for i in selected_indices if 0 <= i < len(result.sessions)]

    # 1. KHỬ TRÙNG LẶP DO AI (Deduplication)
    unique_sessions = []
    seen_keys = set()
    for s in sessions_to_save:
        sig = f"{s.ma_mon}_{s.thu}_{s.tiet_bat_dau}_{s.nhom}"
        if sig not in seen_keys:
            seen_keys.add(sig)
            unique_sessions.append(s)
    sessions_to_save = unique_sessions

    saved_count = 0
    warnings = []

    for s in sessions_to_save:
        # --- BƯỚC A: TÍNH TOÁN TẤT CẢ CÁC NGÀY DẠY CỤ THỂ ---
        new_actual_dates = []
        target_weekday = s.thu - 2 # Python: 0=Thứ 2, 6=Chủ nhật
        
        if hasattr(s, 'date_ranges') and s.date_ranges:
            for dr in s.date_ranges:
                parts = [p.strip() for p in dr.split('-')]
                try:
                    start_d = datetime.strptime(parts[0], "%d/%m/%Y").date()
                    end_d = datetime.strptime(parts[1], "%d/%m/%Y").date() if len(parts) == 2 else start_d
                    
                    # Tìm ngày đúng với 'Thứ' đầu tiên
                    days_ahead = target_weekday - start_d.weekday()
                    if days_ahead < 0: days_ahead += 7
                    curr_d = start_d + timedelta(days=days_ahead)
                    
                    while curr_d <= end_d:
                        new_actual_dates.append(curr_d)
                        curr_d += timedelta(days=7)
                except ValueError: continue

        # --- BƯỚC B: KIỂM TRÀ TRÙNG LỊCH (SQL JOIN SIÊU NHANH) ---
        tiet_ket_thuc_du_kien = s.tiet_bat_dau + s.so_tiet - 1
        has_conflict = False
        conflict_info = ""

        if new_actual_dates:
            # Query: Tìm bất kỳ ngày nào trong DB trùng với danh sách ngày mới VÀ trùng tiết
            from app.models.models import SessionDate # Đảm bảo import đúng
            
            conflict_query = (
                select(TeachingSession.ten_mon, SessionDate.ngay_day)
                .join(SessionDate)
                .where(
                    SessionDate.ngay_day.in_(new_actual_dates),
                    TeachingSession.tiet_bat_dau <= tiet_ket_thuc_du_kien,
                    TeachingSession.tiet_ket_thuc >= s.tiet_bat_dau,
                    TeachingSession.status != 'cancelled'
                )
            )
            conflict_res = await db.execute(conflict_query)
            conflict_item = conflict_res.first()
            
            if conflict_item:
                has_conflict = True
                # Chỉ lấy đúng format Ngày/Tháng/Năm (DD/MM/YYYY)
                ngay_trung = conflict_item.ngay_day.strftime('%d/%m/%Y')
                conflict_info = f"môn '{conflict_item.ten_mon}' vào ngày {ngay_trung}"

        if has_conflict:
            warnings.append(f"Môn '{s.ten_mon}' trùng lịch với {conflict_info}")

        # --- BƯỚC C: LƯU VÀO DATABASE ---
        # 1. Lưu TeachingSession
        new_session = TeachingSession(
            ma_mon=s.ma_mon, ten_mon=s.ten_mon, thu=s.thu,
            tiet_bat_dau=s.tiet_bat_dau, so_tiet=s.so_tiet,
            phong=s.phong, nhom=s.nhom, to_th=s.to_th,
            tin_chi=s.tin_chi, ten_lop=s.ten_lop, si_so=s.si_so,
            truong=s.truong, hoc_ky=s.hoc_ky, status=s.status,
            source_file_id=file_id
        )
        db.add(new_session)
        await db.flush() # Lấy ID

        # 2. Lưu vào bảng SessionDateRange (Để FE hiển thị text cũ)
        if hasattr(s, 'date_ranges'):
            for dr in s.date_ranges:
                parts = [p.strip() for p in dr.split('-')]
                try:
                    sd = datetime.strptime(parts[0], "%d/%m/%Y").date()
                    ed = datetime.strptime(parts[1], "%d/%m/%Y").date() if len(parts) == 2 else sd
                    db.add(SessionDateRange(session_id=new_session.id, ngay_bat_dau=sd, ngay_ket_thuc=ed))
                except: continue

        # 3. 🌟 QUAN TRỌNG: Lưu TỪNG NGAY CỤ THỂ vào bảng mới
        from app.models.models import SessionDate
        for d in new_actual_dates:
            db.add(SessionDate(session_id=new_session.id, ngay_day=d))
        
        await db.flush()
        saved_count += 1

    # Kết thúc
    await db.execute(update(UploadedFile).where(UploadedFile.id == file_id).values(status="success", session_count=saved_count))
    await db.commit()
    _preview_cache.pop(file_id, None)
    return ConfirmResponse(file_id=file_id, sessions_saved=saved_count, warnings=warnings)
@router.delete("/{file_id}", status_code=204)
async def cancel_upload(file_id: int, db: AsyncSession = Depends(get_db)):
    _preview_cache.pop(file_id, None)

    q      = await db.execute(select(UploadedFile).where(UploadedFile.id == file_id))
    db_file = q.scalar_one_or_none()
    if db_file:
        await db.execute(
            update(UploadedFile)
            .where(UploadedFile.id == file_id)
            .values(status="failed")
        )
        await db.commit()