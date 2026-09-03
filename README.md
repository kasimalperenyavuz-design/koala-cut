# KeenVideo Studio - Video Düzenleme ve Sıkıştırma Uygulaması

Modern, karanlık temalı, yerel (offline) çalışan video kırpma, boyutlandırma, aspect ratio dönüştürme, FPS değiştirme ve hedef dosya boyutuna göre akıllı sıkıştırma stüdyosu.

## Özellikler

- **Video Kırpma (Trim / Cut):** Başlangıç ve bitiş zamanı belirleme, canlı playhead senkronizasyonu, saniyelik hassas kesme.
- **En Boy Oranı (Aspect Ratio) & Kadraj:** 16:9 (YouTube), 9:16 (TikTok/Reels/Shorts), 1:1 (Instagram), 4:5 (Portrait), 21:9 (Ultrawide) ve Orijinal oranlar. Letterbox (Siyah şerit / Pad) ve Akıllı Kırpma (Center Crop) modları.
- **Çözünürlük Değiştirme:** 4K, 1080p Full HD, 720p HD, 480p SD ve Özel en/boy boyutları.
- **FPS (Kare Hızı) Kontrolü:** 24 FPS (Sinematik), 30 FPS (Standart), 60 FPS (Akıcı) veya özel kare hızı.
- **Dosya Boyutu Küçültme (Gelişmiş Sıkıştırma):**
  - **Hedef Boyut Modu:** Discord (8MB / 25MB), WhatsApp (16MB), E-posta (10MB), Web (5MB) hazır şablonları veya MB cinsinden özel hedef boyut belirleme.
  - **CRF Akıllı Kalite Modu:** H.264 / H.265 (HEVC) desteği ile görsel kayıpsızdan yüksek sıkıştırmaya kadar CRF ayarı.
  - **Ses Yönetimi:** Ses bitrate kontrolü veya sesi tamamen kaldırma (Sessiz video).
- **Canlı İlerleme Takibi:** Server-Sent Events (SSE) ile anlık yüzde, kodlama hızı (speed x), FPS ve kalan süre (ETA) göstergesi.
- **Dahili Önizleme ve İndirme:** İşlem öncesi ve sonrası boyut karşılaştırması (% kazanç), tarayıcı içi video oynatıcı ve tek tıkla indirme.

## Hızlı Başlangıç

### Yöntem 1: Tek Tıkla Başlatma (Windows)
start.bat dosyasına çift tıklayın. Otomatik olarak bağımlılıkları kontrol edip tarayıcınızda açacaktır:
http://127.0.0.1:8000

### Yöntem 2: Komut Satırından Başlatma
`ash
# Gerekli kütüphaneleri yükleyin:
pip install -r requirements.txt

# Uygulamayı başlatın:
python run.py
`

## Testleri Çalıştırma
`ash
pytest tests/ -v
`
