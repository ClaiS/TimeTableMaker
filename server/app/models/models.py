from sqlalchemy import (
    Column, Integer, SmallInteger, String,
    Text, Computed, ForeignKey, TIMESTAMP, Date
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    file_name     = Column(String(255), nullable=False)
    file_type     = Column(String(10),  nullable=False)          # pdf | xlsx | xls
    truong        = Column(String(50))
    hoc_ky        = Column(String(30))
    status        = Column(String(20),  nullable=False, default="pending")  # pending | success | failed
    error_msg     = Column(Text)
    session_count = Column(Integer,     default=0)
    created_at    = Column(TIMESTAMP,   server_default=func.now())


class TeachingSession(Base):
    __tablename__ = "teaching_sessions"

    id             = Column(Integer,      primary_key=True, autoincrement=True)

    # Thông tin môn học
    ma_mon         = Column(String(20),   nullable=False)        # CMP101
    ten_mon        = Column(String(255),  nullable=False)        # Tên học phần
    tin_chi        = Column(SmallInteger)

    # Thông tin nhóm / lớp
    nhom           = Column(String(20))                          # 01, 11, 13
    to_th          = Column(String(10))                          # 02 (nullable)
    ten_lop        = Column(String(255))                         # 23DTHA1,23DTHA2
    si_so          = Column(Integer)

    # Thời gian
    thu            = Column(SmallInteger, nullable=False)        # 2=T2 ... 8=CN
    tiet_bat_dau   = Column(SmallInteger, nullable=False)        # 1-15
    so_tiet        = Column(SmallInteger, nullable=False)        # từ PDF
    tiet_ket_thuc  = Column(SmallInteger, Computed("tiet_bat_dau + so_tiet - 1", persisted=True))

    # Địa điểm & trường
    phong          = Column(String(50))
    truong         = Column(String(50),   nullable=False)

    # Học kỳ
    hoc_ky         = Column(String(30))

    # Trạng thái
    status         = Column(String(20),   nullable=False, default="normal")  # normal | makeup | cancelled

    # Liên kết file nguồn
    source_file_id = Column(Integer, ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True)

    # Metadata
    created_at     = Column(TIMESTAMP, server_default=func.now())
    updated_at     = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    date_ranges_rel = relationship("SessionDateRange", backref="session", lazy="selectin", cascade="all, delete-orphan")

    @property
    def date_ranges(self):
        ranges = []
        for dr in self.date_ranges_rel:
            start = dr.ngay_bat_dau.strftime("%d/%m/%Y")
            end = dr.ngay_ket_thuc.strftime("%d/%m/%Y")
            ranges.append(start if start == end else f"{start} - {end}")
        return ranges

class SessionDateRange(Base):
    __tablename__ = "session_date_ranges"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    session_id    = Column(Integer, ForeignKey("teaching_sessions.id", ondelete="CASCADE"), nullable=False)
    ngay_bat_dau  = Column(Date, nullable=False)
    ngay_ket_thuc = Column(Date, nullable=False)