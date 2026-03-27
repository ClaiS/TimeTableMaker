"""
routers/detect.py
─────────────────
POST /detect-rect
  - Nhận 1 frame ảnh (base64 hoặc multipart)
  - OpenCV detect hình chữ nhật lớn nhất (bảng lịch)
  - Trả về tọa độ 4 góc theo % (0.0–1.0) so với kích thước ảnh

POST /detect-rect/crop
  - Nhận ảnh full-res + tọa độ 4 góc
  - Perspective warp → ảnh phẳng, thẳng, rõ nét
  - Trả về ảnh đã crop (base64 JPEG)
"""

from __future__ import annotations

import base64
import io
import cv2
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/detect-rect", tags=["detect"])


# ── Response schemas ──────────────────────────────────────────────────────────

class Corner(BaseModel):
    x: float   # 0.0 – 1.0  (relative to image width)
    y: float   # 0.0 – 1.0  (relative to image height)

class DetectResponse(BaseModel):
    found:   bool
    corners: Optional[list[Corner]]   # [tl, tr, br, bl] nếu found
    confidence: float                 # 0.0 – 1.0

class CropResponse(BaseModel):
    image_b64: str   # JPEG base64


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Không decode được ảnh")
    return img


def _enhance_for_detection(img: np.ndarray) -> np.ndarray:
    """
    Tăng cường ảnh để detect cạnh bảng trên màn hình laptop tốt hơn.
    - Màn hình thường sáng, nền tối → cần normalize
    - Giảm glare bằng CLAHE
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # CLAHE để cân bằng histogram cục bộ (giúp đọc màn hình)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray  = clahe.apply(gray)

    # Làm mờ nhẹ để giảm nhiễu
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny edge detection với ngưỡng tự động
    med   = float(np.median(blur))
    lower = max(0,   int(0.67 * med))
    upper = min(255, int(1.33 * med))
    edges = cv2.Canny(blur, lower, upper)

    # Dilate để nối các cạnh đứt
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges  = cv2.dilate(edges, kernel, iterations=1)

    return edges


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Sắp xếp 4 điểm theo thứ tự: tl, tr, br, bl."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s    = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]     # tl: x+y nhỏ nhất
    rect[2] = pts[np.argmax(s)]     # br: x+y lớn nhất
    rect[1] = pts[np.argmin(diff)]  # tr: x-y nhỏ nhất
    rect[3] = pts[np.argmax(diff)]  # bl: x-y lớn nhất
    return rect


def _find_document_corners(img: np.ndarray) -> tuple[bool, Optional[np.ndarray], float]:
    """
    Tìm hình chữ nhật lớn nhất trong ảnh.
    Trả về (found, corners_4x2, confidence).
    """
    h, w = img.shape[:2]
    img_area = w * h

    edges = _enhance_for_detection(img)

    # Tìm contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return False, None, 0.0

    # Sắp xếp theo diện tích giảm dần
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    for cnt in contours[:10]:
        area = cv2.contourArea(cnt)

        # Bỏ qua nếu quá nhỏ (< 10% diện tích ảnh) hoặc quá lớn (> 98%)
        ratio = area / img_area
        if ratio < 0.10 or ratio > 0.98:
            continue

        # Xấp xỉ polygon
        peri   = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)

        if len(approx) == 4:
            pts        = approx.reshape(4, 2).astype(np.float32)
            ordered    = _order_corners(pts)
            confidence = min(1.0, ratio / 0.7)   # heuristic confidence
            return True, ordered, round(confidence, 2)

    # Fallback: dùng bounding rect của contour lớn nhất
    cnt    = contours[0]
    area   = cv2.contourArea(cnt)
    ratio  = area / img_area
    if ratio < 0.10:
        return False, None, 0.0

    x, y, cw, ch = cv2.boundingRect(cnt)
    pts = np.array([
        [x,      y     ],
        [x + cw, y     ],
        [x + cw, y + ch],
        [x,      y + ch],
    ], dtype=np.float32)
    confidence = min(0.6, ratio / 0.7)
    return True, pts, round(confidence, 2)


def _perspective_warp(img: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    Perspective transform: biến tứ giác → hình chữ nhật phẳng.
    corners: [[tl], [tr], [br], [bl]]
    """
    tl, tr, br, bl = corners

    # Tính kích thước output
    w1 = np.linalg.norm(br - bl)
    w2 = np.linalg.norm(tr - tl)
    h1 = np.linalg.norm(tr - br)
    h2 = np.linalg.norm(tl - bl)
    W  = int(max(w1, w2))
    H  = int(max(h1, h2))

    if W < 50 or H < 50:
        raise ValueError("Vùng crop quá nhỏ")

    dst = np.array([[0, 0], [W-1, 0], [W-1, H-1], [0, H-1]], dtype=np.float32)
    M   = cv2.getPerspectiveTransform(corners, dst)

    # Sharpen sau warp để chữ rõ hơn
    warped = cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC)

    # Auto-brighten nếu ảnh tối (màn hình laptop trong điều kiện thiếu sáng)
    mean_val = warped.mean()
    if mean_val < 100:
        alpha = min(2.0, 180.0 / max(mean_val, 1))
        warped = cv2.convertScaleAbs(warped, alpha=alpha, beta=10)

    # Sharpen kernel
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    warped = cv2.filter2D(warped, -1, kernel)

    return warped


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=DetectResponse)
async def detect_rect(file: UploadFile = File(...)):
    """
    Nhận frame JPEG (từ mobile gửi mỗi ~500ms).
    Trả về tọa độ 4 góc theo tỉ lệ 0.0–1.0.
    """
    data = await file.read()
    try:
        img = _decode_image(data)
    except Exception as e:
        raise HTTPException(400, f"Ảnh không hợp lệ: {e}")

    h, w = img.shape[:2]

    # Scale down để detect nhanh hơn (không cần full-res)
    scale     = min(1.0, 640 / max(w, h))
    small     = cv2.resize(img, (int(w * scale), int(h * scale)))
    found, corners, conf = _find_document_corners(small)

    if not found or corners is None:
        return DetectResponse(found=False, corners=None, confidence=0.0)

    # Scale corners về tỉ lệ 0–1 so với ảnh gốc
    rel_corners = [
        Corner(x=round(float(pt[0]) / (w * scale), 4),
               y=round(float(pt[1]) / (h * scale), 4))
        for pt in corners  # [tl, tr, br, bl]
    ]

    return DetectResponse(found=True, corners=rel_corners, confidence=conf)


@router.post("/crop", response_model=CropResponse)
async def crop_and_warp(
    file:    UploadFile = File(...),
    tl_x: float = Form(...), tl_y: float = Form(...),
    tr_x: float = Form(...), tr_y: float = Form(...),
    br_x: float = Form(...), br_y: float = Form(...),
    bl_x: float = Form(...), bl_y: float = Form(...),
):
    """
    Nhận ảnh full-res + tọa độ 4 góc (tỉ lệ 0–1).
    Trả về ảnh đã perspective-warp dưới dạng base64 JPEG.
    """
    data = await file.read()
    try:
        img = _decode_image(data)
    except Exception as e:
        raise HTTPException(400, f"Ảnh không hợp lệ: {e}")

    h, w = img.shape[:2]

    corners = np.array([
        [tl_x * w, tl_y * h],
        [tr_x * w, tr_y * h],
        [br_x * w, br_y * h],
        [bl_x * w, bl_y * h],
    ], dtype=np.float32)

    try:
        warped = _perspective_warp(img, corners)
    except Exception as e:
        raise HTTPException(422, f"Crop thất bại: {e}")

    # Encode sang JPEG
    _, buf = cv2.imencode('.jpg', warped, [cv2.IMWRITE_JPEG_QUALITY, 92])
    b64    = base64.b64encode(buf.tobytes()).decode()

    return CropResponse(image_b64=b64)
