# 🐨 koala-cut - Profesyonel Masaüstü Video Kurgu, Ses İyileştirme ve Akıllı Sıkıştırma Stüdyosu

[![GitHub Release](https://img.shields.io/github/v/release/kasimalperenyavuz-design/koala-cut?style=flat-square&color=6366f1)](https://github.com/kasimalperenyavuz-design/koala-cut/releases/tag/v1.3.1)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg?style=flat-square)](https://github.com/kasimalperenyavuz-design/koala-cut/releases)
[![Python](https://img.shields.io/badge/Python-3.11+-amber.svg?style=flat-square)](https://www.python.org/)
[![Tests](https://img.shields.io/badge/Tests-92%20passed-success.svg?style=flat-square)](#-testler-ve-doğrulama)
[![Privacy](https://img.shields.io/badge/Offline-100%25%20Private-purple.svg?style=flat-square)](#)

**koala-cut**, modern içerik üreticileri için tasarlanmış; çoklu iz (multi-track) zaman çizgisi, bağımsız metin izi, yapay zeka destekli ses izolasyonu, şık altyazı tipografisi ve GPU hızlandırmalı akıllı sıkıştırma yeteneklerine sahip modern, **%100 yerel (offline)** çalışan bir video kurgu ve optimizasyon stüdyosudur.

---

## 📥 İndirme ve Hızlı Kurulum

En son sürüm olan **v1.3.1** paketlerini doğrudan GitHub Releases üzerinden edinebilirsiniz:

| Paket | İndirme Bağlantısı | Boyut | Açıklama |
|---|---|---|---|
| **Kurulum Sihirbazı (Önerilen)** | [⬇️ koala-cut-setup.exe](https://github.com/kasimalperenyavuz-design/koala-cut/releases/download/v1.3.1/koala-cut-setup.exe) | ~473 MB | Windows kurulum sihirbazı. FFmpeg, FFprobe ve Whisper AI motoru içinde gömülü gelir. |
| **Taşınabilir Sürüm (Portable)** | [⬇️ koala-cut.exe](https://github.com/kasimalperenyavuz-design/koala-cut/releases/download/v1.3.1/koala-cut.exe) | ~370 MB | Kurulum gerektirmeyen tekil masaüstü çalıştırılabilir dosyası. |

---

## 🌟 Öne Çıkan Özellikler (Highlights)

### ✂️ 1. Çoklu İz Zaman Çizgisi (Multi-Track NLE Timeline)
- **Video (`V1`), Ses (`A1`) ve Bağımsız Metin İzi (`T1`)**: Profesyonel kurgu programları hiyerarşisinde tam teşekküllü çoklu iz çalışma ortamı.
- **Oynatma İmlecinden Hızlı Bölme (Razor Split)**: `S` veya `C` tuşuyla videoyu, sesi veya metni anında ikiye ayırma.
- **Akıllı Boşluk Kapatma (Ripple Delete)**: `Delete` / `Backspace` ile silinen kısımların boşluğunu otomatik kapatma (isteğe göre devre dışı bırakılabilir).
- **Çift Kanatlı Aralık Kırpıcı (Dual-Wing Trimmer)**: CapCut / Premiere benzeri sarı sol ve sağ tutamaçlarla saniyelik hassas aralık belirleme.
- **Önizlemede Boşluk Atlama (Gap Skipping)**: Zaman çizgisinde silinen veya kesilen aralıkları oynatıcıda otomatik atlayarak canlı izleme.
- **Sınırsız Geri Alma (`Ctrl + Z`)**: Kurgu akışında yapılan tüm işlemleri güvenle geri alma.

### ✍️ 2. Timeline Metin İzi & Çift Yönlü Dinamik Senkronizasyon (Yeni!)
- **Ayrı Metin İzi (`T1`)**: Video ve sesin üzerinde bağımsız olarak çalışan metin katmanı.
- **Sürükle-Bırak Konumlandırma**: Mor renkli metin kliplerini zaman çizgisinde serbestçe sağa/sola sürükleyerek başlangıç/bitiş anlarını anında ayarlama.
- **Sol ve Sağ Tutamaçlar (Trim Handles)**:
  - **Sol Tutamaç (Trim Left)**: Metnin videoda ilk görüneceği başlangıç saniyesini doğrudan timeline'dan uzatıp kısaltma.
  - **Sağ Tutamaç (Trim Right)**: Metnin ekranda kalma süresini ve bitiş anını uzatıp kısaltma.
- **Çift Yönlü Senkron (Bidirectional Sync)**: Timeline'da yapılan taşıma ve kırpmalar Inspector paneline; Inspector'da yapılan saniye veya metin değişiklikleri timeline'a canlı yansır.
- **Tıkla-Vurgula & Sil**: Timeline'da metin klibine tıklandığında Inspector doğrudan Metin sekmesine geçer; `Delete` tuşuyla silinir.

### 🎨 3. Gelişmiş Altyazı Tipografisi & Stil Şablonları (Yeni!)
- **5 Hazır Görsel Stil Şablonu**:
  - 🔲 **Kutucuklu (Box)**: TikTok & Reels tarzı yarı saydam / opak arka plan kutusu (varsayılan).
  - 🖋️ **Konturlu (Outline)**: Klasik sinema tarzı kalın siyah kenar konturlu beyaz yazı.
  - 💛 **TikTok Sarı (Yellow Pop)**: Dikkat çekici sarı font (`#FFE81F`), kalın siyah dış hat ve kontrast gölge.
  - 🌑 **Gölge (Shadow)**: Temiz, modern ve yumuşak alt gölge efekti.
  - 🎬 **Sinematik Şerit (Bar)**: Video altını boydan boya kaplayan şık sinematik bant.
- **Tipografi Denetimi**: Font seçimi (`Montserrat`, `Arial`, `Impact`, `Roboto`, `Poppins`), dinamik boyut ($14\text{px} - 48\text{px}$), serbest hex renk seçici ve hızlı renk paleti.
- **Dikey Konumlandırma**: Üst, Orta veya Alt konum seçimi.
- **FFmpeg ASS Motoru**: Canlı önizlemede görünen biçimlendirme, FFmpeg ASS `force_style` altyazı motoru ile video çıktısına tam olarak gömülür.

### 📝 4. Videoya Serbest Metin ve Başlık Ekleme (Custom Text Overlays)
- **Çoklu Katman Desteği**: İstenen sayıda metin veya başlık katmanı ekleyebilme.
- **2B Tuval Konumlandırma**: Yatay ($X: 0\% - 100\%$) ve Dikey ($Y: 0\% - 100\%$) serbest yerleşim slider'ları.
- **Kutulu Arka Plan & Gölge**: Yazı arkasına renkli kutu ve gölge efekti ekleme.
- **FFmpeg `drawtext` Motoru**: `between(t, start, end)` zaman filtresiyle tam zamanlı çıktılarda kusursuz render.

### 🎙️ 5. Yapay Zeka Destekli Ses İyileştirme & İzolasyon
- **RNNoise Yapay Zeka Ses İzolasyonu**: Derin öğrenme sinir ağı modeli (`bd.rnnn`) ile arka plan uğultusunu, fan, klima ve ortam gürültüsünü insan sesinden mükemmel şekilde ayırır.
- **Akıllı Sessizlik Budama (Smart Silence Removal)**: Konuşma aralarındaki sessiz duraklamaları milisaniyelik hassasiyetle tespit edip tek tıkla zaman çizgisinde keser.
- **Faster-Whisper Otomatik Altyazı**: Türkçe ve çok dilli yapay zeka transkripsiyonu ile otomatik SRT/VTT üretimi.

### 🔊 6. Kapsamlı Ses & Görsel Dönüşüm Paketi
- **EBU R128 Akıllı Ses Normalizasyonu (`loudnorm`)**: Yayın standardında dengeli ve net ses seviyesi.
- **Frekans Tabanlı FFT Gürültü Engelleme (`afftdn`)**: Dip sesleri filtreleme.
- **Ses Seviyesi & Tonlama (Pitch)**: Hızlı ses yükseltme/alçaltma ve ton kaydırma.
- **Canlı Web Audio API Önizleme**: Ses efektlerini ve filtrelerini videoyu render etmeden tarayıcıda canlı dinleme.
- **Görsel Dönüşüm (PIP)**: Resim içinde Resim (Picture-in-Picture), serbest konumlandırma, ölçekleme, döndürme ve ayna (flip) efektleri.

### ⚡ 7. GPU Donanım Hızlandırma & Akıllı Hedef MB Sıkıştırması
- **Donanım Hızlandırma**: NVIDIA NVENC, Intel QSV ve AMD AMF donanım kodlayıcı otomatik tespiti ile 5-10 kat daha hızlı video işleme.
- **Hedef Dosya Boyutu Modu**: Discord (8MB / 25MB), WhatsApp (16MB), E-posta (10MB), Web (5MB) hazır kalıpları veya özel MB belirleme.
- **CRF Akıllı Kalite Modu**: H.264 / H.265 (HEVC) desteği ile görsel kayıpsızdan yüksek sıkıştırmaya kadar CRF denetimi.

### 💾 8. Proje Yönetimi (.koalaproject) & Kullanıcı Deneyimi
- **Tek Tıkla Proje Kaydetme & Açma**: Tüm izler, metin katmanları, stil şablonları ve efektler `.koalaproject` dosyasında saklanır.
- **Karanlık ve Açık Tema**: Göz yormayan karanlık stüdyo modu ve ferah açık tema desteği.
- **Dahili Güncelleyici**: GitHub Releases üzerinden yeni sürümleri tek tıkla denetleme ve güncelleme.

---

## ⌨️ Klavye Kısayolları

| Kısayol | İşlev |
|---|---|
| `Space` | Oynat / Duraklat |
| `S` veya `C` | İmlecin Bulunduğu Klibi Böl (Razor Split) |
| `Delete` / `Backspace` | Seçili Klibi Sil (Ripple Delete) |
| `Ctrl + Z` | Son İşlemi Geri Al |
| `Ctrl + S` | Projeyi Kaydet (.koalaproject) |
| `Ctrl + O` | Proje Dosyası Aç |
| `I` / `O` | Giriş (In) ve Çıkış (Out) Noktalarını Belirle |
| `←` / `→` | 1 Saniye Geri / İleri Sar |
| `Shift + ←` / `Shift + →` | 5 Saniye Geri / İleri Sar |
| `J` / `K` / `L` | Hızlı Geri Sar / Duraklat / Hızlı İleri Oynat |
| `M` | Sesi Aç / Kapat (Mute) |
| `F` | Tam Ekran Önizleme |

---

## 🛠️ Geliştirici & Kaynak Koddan Çalıştırma

### Gereksinimler
- Python 3.11+
- FFmpeg ve FFprobe (Sistem PATH'inde veya `dist/` klasöründe)

```bash
# Depoyu klonlayın:
git clone https://github.com/kasimalperenyavuz-design/koala-cut.git
cd koala-cut

# Bağımlılıkları yükleyin:
pip install -r requirements.txt

# Uygulamayı başlatın:
python run.py
```

Uygulama otomatik olarak yerel tarayıcınızda veya yerel masaüstü penceresinde açılacaktır:
👉 `http://127.0.0.1:8000`

---

## 🧪 Testler ve Doğrulama

Tüm modüller, FFmpeg komut derleyicileri, yapay zeka modelleri ve REST API uç noktaları otomatik birim ve entegrasyon testleriyle doğrulanır:

```bash
pytest
```

```
============================= 92 passed in 11.96s =============================
```

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında açık kaynak olarak sunulmaktadır.
Telif Hakkı (C) 2026 koala-cut Studio. Tüm hakları saklıdır.
