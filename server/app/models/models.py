from sqlalchemy import (
    Column, Integer, SmallInteger, String,
    Text, Computed, ForeignKey, TIMESTAMP
)
from sqlalchemy.sql import func
from app.database import Base


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    file_name     = Column(String(255), nullable=False)
    file_type     = Column(String(10),  nullable=False)          # pdf | xlsx | xls
    truong        = Column(String(50))                           # tên trường nhận diện được
    hoc_ky        = Column(String(30))                           # học kỳ nhận diện được
    status        = Column(String(20),  nullable=False, default="pending")  # pending | success | failed
    error_msg     = Column(Text)                                 # lỗi nếu parse thất bại
    session_count = Column(Integer,     default=0)               # số buổi dạy parse được
    created_at    = Column(TIMESTAMP,   server_default=func.now())


class TeachingSession(Base):
    __tablename__ = "teaching_sessions"

    id            = Column(Integer,      primary_key=True, autoincrement=True)

    # Thông tin môn học
    ma_mon        = Column(String(20),   nullable=False)         # CMP3019
    ten_mon       = Column(String(255),  nullable=False)         # Tên học phần

    # Thông tin lớp
    lop           = Column(String(50))                           # 02/03
    si_so         = Column(Integer)                              # Sĩ số SV

    # Thời gian
    thu           = Column(SmallInteger, nullable=False)         # 2=T2 ... 8=CN
    tiet_bat_dau  = Column(SmallInteger, nullable=False)         # 1-15
    tiet_ket_thuc = Column(SmallInteger, nullable=False)         # 1-15
    so_tiet       = Column(SmallInteger, Computed("tiet_ket_thuc - tiet_bat_dau + 1", persisted=True))

    # Địa điểm & trường
    phong         = Column(String(50))                           # E1-07.08
    truong        = Column(String(50),   nullable=False)         # HUTECH, BKU...

    # Học kỳ
    hoc_ky        = Column(String(30))                           # HK2 25-26

    # Trạng thái
    status        = Column(String(20),   nullable=False, default="normal")  # normal | makeup | cancelled

    # Liên kết file nguồn
    source_file_id = Column(Integer, ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True)

    # Metadata
    created_at    = Column(TIMESTAMP, server_default=func.now())
    updated_at    = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
