from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import engine, Base
import os

# Import models để Alembic nhận diện
from app.models import models
from app.routers import sessions, upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: tạo bảng nếu chưa có
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="TimeTableMaker API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,exp://localhost:8081").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev: cho phép tất cả (mobile expo)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── ĐÂY LÀ CÁCH QUY CHUẨN ENDPOINT ──────────────────────────────────────────
api_router = APIRouter(prefix="/api")

# Gắn các router con vào router tổng
api_router.include_router(sessions.router) # Sẽ thành /api/sessions
api_router.include_router(upload.router)   # Sẽ thành /api/upload

# Gắn router tổng vào app chính
app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok"}