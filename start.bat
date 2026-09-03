@echo off
title KeenVideo Studio - Video Duzenleme ve Sikistirma
echo ========================================================
echo            KeenVideo Studio Baslatiliyor...
echo ========================================================
echo.

where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [UYARI] ffmpeg sistem yolunda bulunamadi! Lutfen FFmpeg yuklu oldugundan emin olun.
)

echo Bagimliliklar kontrol ediliyor...
python -m pip install -r requirements.txt --quiet

echo.
echo Sunucu calistiriliyor ve tarayici aciliyor: http://127.0.0.1:8000
echo Durdurmak icin bu pencerede Ctrl+C tuslarina basin.
echo.
python run.py

if %errorlevel% neq 0 (
    echo.
    echo Bir hata olustu.
    pause
)
