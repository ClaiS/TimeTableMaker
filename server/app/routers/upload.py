"""
routers/upload.py
-----------------
POST /upload
  - Nhận file (PDF / Excel / Image) qua multipart
  - Gọi schedule_parser để trích xuất danh sách buổi dạy
  - Lưu metadata vào uploaded_files
  - Trả về preview (chưa lưu sessions) để mobile confirm

POST /upload/confirm/{file_id}
  - User xác nhận → lưu sessions vào DB
  - Cập nhật status uploaded_files → "success"

DELETE /upload/{file_id}
  - Xoá file record (nếu user bỏ qua)
"""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import TeachingSession, UploadedFile
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
    ten_lop:       Optional[str]
    si_so:         Optional[int]
    status:        str

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
            ten_lop       = p.ten_lop,
            si_so         = p.si_so,
            status        = p.status,
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
    raw_text:      str   # debug / review


class ConfirmResponse(BaseModel):
    file_id:        int
    sessions_saved: int


# ── In-memory preview cache (đủ cho single-user) ─────────────────────────────
# Key: file_id → ParseResult
_preview_cache: dict[int, ParseResult] = {}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=UploadPreviewResponse, status_code=200)
async def upload_file(
    file:    UploadFile = File(...),
    truong:  Optional[str] = Form(None),   # override nếu user chọn tay
    hoc_ky: Optional[str] = Form(None),   # override nếu user chọn tay
    db:      AsyncSession = Depends(get_db),
):
    """
    Upload file → parse → trả preview.
    Chưa lưu sessions vào DB, chờ /confirm.
    """
    filename = file.filename or "upload.bin"
    data     = await file.read()

    # Xác định loại
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    if ext not in ("pdf", "xlsx", "xls", "jpg", "jpeg", "png", "bmp", "webp"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Định dạng '{ext}' chưa được hỗ trợ. Dùng PDF, Excel hoặc ảnh.",
        )

    # Lưu record "pending"
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

    # Parse (chạy trong thread vì PaddleOCR/pdfplumber là sync)
    loop   = asyncio.get_event_loop()
    result: ParseResult = await loop.run_in_executor(
        None, parse_schedule, data, filename
    )

    # Override truong/hk nếu user cung cấp
    if truong:
        result.truong = truong
        for s in result.sessions:
            s.truong = truong
    if hoc_ky:
        result.hoc_ky = hoc_ky
        for s in result.sessions:
            if not s.hoc_ky:
                s.hoc_ky = hoc_ky

    # Cache để confirm sau
    _preview_cache[db_file.id] = result

    # Cập nhật session_count vào record
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
    selected_indices: Optional[list[int]] = None,  # None = lấy tất cả
    db:               AsyncSession = Depends(get_db),
):
    """
    Xác nhận lưu sessions sau khi user review preview.
    selected_indices: list index của sessions muốn giữ (0-based).
    Nếu None → lưu tất cả.
    """
    result = _preview_cache.get(file_id)
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy preview. Hãy upload lại.")

    # Kiểm tra file record
    q      = await db.execute(select(UploadedFile).where(UploadedFile.id == file_id))
    db_file = q.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File record không tồn tại.")

    sessions_to_save = result.sessions
    if selected_indices is not None:
        sessions_to_save = [
            result.sessions[i]
            for i in selected_indices
            if 0 <= i < len(result.sessions)
        ]

    # Bulk insert
    db_sessions = [
        TeachingSession(
            ma_mon        = s.ma_mon,
            ten_mon       = s.ten_mon,
            thu           = s.thu,
            tiet_bat_dau  = s.tiet_bat_dau,
            so_tiet       = s.so_tiet,
            phong         = s.phong,
            nhom          = s.nhom,
            ten_lop       = s.ten_lop,
            si_so         = s.si_so,
            truong        = s.truong,
            hoc_ky        = s.hoc_ky,
            status        = s.status,
            source_file_id= file_id,
        )
        for s in sessions_to_save
    ]
    db.add_all(db_sessions)

    # Cập nhật status file
    await db.execute(
        update(UploadedFile)
        .where(UploadedFile.id == file_id)
        .values(status="success", session_count=len(db_sessions))
    )
    await db.commit()

    # Xoá cache
    _preview_cache.pop(file_id, None)

    return ConfirmResponse(file_id=file_id, sessions_saved=len(db_sessions))


@router.delete("/{file_id}", status_code=204)
async def cancel_upload(file_id: int, db: AsyncSession = Depends(get_db)):
    """Huỷ upload, xoá record và cache."""
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
