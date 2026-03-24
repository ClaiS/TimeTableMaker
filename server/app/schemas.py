from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SessionBase(BaseModel):
    ma_mon:        str           = Field(..., min_length=1, max_length=20)
    ten_mon:       str           = Field(..., min_length=1, max_length=255)
    lop:           Optional[str] = Field(None, max_length=50)
    si_so:         Optional[int] = Field(None, ge=0)
    thu:           int           = Field(..., ge=2, le=8)
    tiet_bat_dau:  int           = Field(..., ge=1, le=15)
    tiet_ket_thuc: int           = Field(..., ge=1, le=15)
    phong:         Optional[str] = Field(None, max_length=50)
    truong:        str           = Field(..., min_length=1, max_length=50)
    hoc_ky:        Optional[str] = Field(None, max_length=30)
    status:        str           = Field("normal", pattern="^(normal|makeup|cancelled)$")


class SessionCreate(SessionBase):
    source_file_id: Optional[int] = None


class SessionUpdate(BaseModel):
    ma_mon:        Optional[str] = Field(None, min_length=1, max_length=20)
    ten_mon:       Optional[str] = Field(None, min_length=1, max_length=255)
    lop:           Optional[str] = Field(None, max_length=50)
    si_so:         Optional[int] = Field(None, ge=0)
    thu:           Optional[int] = Field(None, ge=2, le=8)
    tiet_bat_dau:  Optional[int] = Field(None, ge=1, le=15)
    tiet_ket_thuc: Optional[int] = Field(None, ge=1, le=15)
    phong:         Optional[str] = Field(None, max_length=50)
    truong:        Optional[str] = Field(None, min_length=1, max_length=50)
    hoc_ky:        Optional[str] = Field(None, max_length=30)
    status:        Optional[str] = Field(None, pattern="^(normal|makeup|cancelled)$")


class SessionStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(normal|makeup|cancelled)$")


class SessionResponse(SessionBase):
    id:             int
    so_tiet:        int
    source_file_id: Optional[int]
    created_at:     datetime
    updated_at:     datetime

    class Config:
        from_attributes = True