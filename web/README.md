# HUTECH TKB – Web (React + Vite)

## Cài đặt & Chạy

```bash
# 1. Cài dependencies
npm install

# 2. Chạy dev server
npm run dev

# 3. Mở trình duyệt
# http://localhost:5173
```

## Build production

```bash
npm run build
npm run preview
```

## Cấu trúc project

```
src/
├── shared/
│   └── data.js          # Dữ liệu dùng chung (schools, tiers, mock data)
├── components/
│   ├── Sidebar.jsx      # Sidebar điều hướng
│   └── AEModal.jsx      # Modal thêm/sửa buổi dạy
├── pages/
│   ├── TKBPage.jsx      # Lưới thời khóa biểu
│   ├── FreePage.jsx     # Lịch trống
│   ├── UploadPage.jsx   # Upload PDF/Excel
│   └── NotifPage.jsx    # Thông báo
├── App.jsx              # Root component
├── main.jsx             # Entry point
└── index.css            # Global styles
```

## Tính năng

- Lưới TKB 7 cột × 15 tiết, hover hiện tooltip chi tiết
- CRUD buổi dạy (thêm, sửa, xóa)
- Màu sắc phân loại theo trường (22 trường)
- Nhập tên trường tự do với gợi ý
- Lịch trống tổng hợp tự động
- Upload PDF/Excel với nhận diện tên trường
- Push Notification (browser API)
- Chuyển tuần ‹ ›

## Tech Stack

- React 18 + Vite 5
- CSS-in-JS (inline styles)
- Google Fonts: Be Vietnam Pro + JetBrains Mono
