from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models.models import TeachingSession
from app.schemas import SessionCreate, SessionUpdate, SessionStatusUpdate, SessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=List[SessionResponse])
async def get_sessions(
    hoc_ky: str | None = None,
    truong: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(TeachingSession).order_by(TeachingSession.thu, TeachingSession.tiet_bat_dau)
    if hoc_ky:
        query = query.where(TeachingSession.hoc_ky == hoc_ky)
    if truong:
        query = query.where(TeachingSession.truong == truong)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeachingSession).where(TeachingSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi dạy")
    return session


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    if body.tiet_ket_thuc < body.tiet_bat_dau:
        raise HTTPException(status_code=422, detail="Tiết kết thúc phải >= tiết bắt đầu")
    session = TeachingSession(**body.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(session_id: int, body: SessionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeachingSession).where(TeachingSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi dạy")

    update_data = body.model_dump(exclude_unset=True)
    tb = update_data.get("tiet_bat_dau", session.tiet_bat_dau)
    tk = update_data.get("tiet_ket_thuc", session.tiet_ket_thuc)
    if tk < tb:
        raise HTTPException(status_code=422, detail="Tiết kết thúc phải >= tiết bắt đầu")

    for field, value in update_data.items():
        setattr(session, field, value)

    await db.commit()
    await db.refresh(session)
    return session


@router.patch("/{session_id}/status", response_model=SessionResponse)
async def update_session_status(session_id: int, body: SessionStatusUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeachingSession).where(TeachingSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi dạy")
    session.status = body.status
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TeachingSession).where(TeachingSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi dạy")
    await db.delete(session)
    await db.commit()