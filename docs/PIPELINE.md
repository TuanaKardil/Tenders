# Tenderlist — İhale İşleme Pipeline'ı (scrape → publish)

> Bu dosya, bir ihale çekildikten sonra yayınlanana kadar geçen tüm adımların
> tasarımıdır. Karar kaynağıdır; unutmamak için burada tutulur.
> İlgili: [`ROADMAP.md`](./ROADMAP.md).

## Günlük akış (özet)

```
CRON ~12:00
  → 1. Scrape (5 kaynak)
  → 2. Normalize (aynı-kaynak dedup)
  → 3. ⭐ Cross-source dedup — KATMAN 1 (ucuz, AI'dan ÖNCE)
         ├─ kopya  → kümeye bağla, kaynak linki ekle, AI'ı ATLA (ucuz)
         └─ yeni   ↓
  → 4. Belge indir + PDF/Word/OCR metin çıkarımı
  → 5. AI alan çıkarımı + ⭐ SINIFLANDIRMA (ihale mi?)
         ├─ ihale değil (iş ilanı/award/disposal/haber) → ELE
         └─ ihale ↓
  → 6. AI çeviri + ÖZET (EN+TR)
  → 7. ⭐ Cross-source dedup — KATMAN 2 (embedding + LLM-hakem)
  → 8. Publish gate (extraction_confidence ≥ 0.7)
  → 9. Meili index (küme başına TEK kanonik)
  → 10. Alarm eşleştir
  → 11. E-posta (Resend)
  → 12. Durum tazeleme (open/closing_soon/closed)
```

---

## Aşama aşama

### 0. Zamanlayıcı — `schedules` · 🟡 iskele
Her gün ~12:00'de tekrarlayan BullMQ job; 5 aktif kaynak için scrape işi kuyruğa atar.

### 1. Scrape — `apps/worker/src/scrapers/` · ✅ kurulu
Her adapter **açık + son 7 gün** ihaleleri çeker (`isRecentAndOpen`, gelecek-tarihli elenir).
Kaynaklar: TED (API), Kenya (`/api/active-tenders`), Etiyopya (`cms-v2/get-grouped-sourcing`),
Uganda (HTML), UNGM (arama HTML). → `/api/ingest` → `raw_notices`.

### 2. Normalize — `normalize` worker · ✅ kurulu
`raw_notice` → `tenders` upsert. Aynı-kaynak dedup: (kaynak + notice_id) + `source_hash`.
Aynı hash → dokunma; değişmiş → devam.

### 3. Cross-source dedup — KATMAN 1 (deterministik, ucuz) · 🔴 yeni · `dedupe` worker
Aynı ihale 3 farklı sitede olabilir (UN/Dünya Bankası fonlu olanlar sık). AI'dan ÖNCE elenir
ki kopyalar pahalı AI'ya girmesin.
- **Blok:** `ülke + kapanış tarihi (±2 gün)` (O(n²)'den kaçış)
- **Skor:** normalize referans no (en güçlü) + alıcı adı benzerliği (token/Jaccard) + değer +
  başlık trigram
- Eşik geçerse → aynı **küme** (`dedupe_clusters`, şemada var). Kopya → kümeye bağla, kaynak
  linkini ekle, **AI'ı atla**.

### 4. Belge indir + çıkarım (PDF/Word/görsel) · 🔴 yeni · `extract` worker
**Çoğu ilanın asıl bilgisi ekli belgede.** Adım:
- Ekleri indir (`documents[].url`)
- **PDF → metin** (pdf-parse / pdfjs)
- **Word → metin** (docx parser)
- **Görsel / taranmış PDF → OCR** (tesseract.js, ya da Gemini'nin görsel-okuma yeteneği)
- Çıkan ham metin 5. adımdaki AI'ya girdi olur. (Not: Gemini multimodal olduğundan PDF/görseli
  doğrudan modele verip hem metin çıkarımı hem özet tek çağrıda yapılabilir — maliyet/gecikme
  testine göre seçilecek.)

### 5. AI alan çıkarımı + SINIFLANDIRMA · 🔴 yeni · `extract` worker
Başlık + açıklama + belge metni → AI:
- **Yapılandırılmış alanlar:** alıcı, son tarih, tahmini bedel, para birimi, sektör, CPV,
  uygunluk şartları, ihale türü + **güven skoru**.
- **SINIFLANDIRMA (ihale mi?):** "Açık ihale mi (alıcı tedarikçi/yüklenici arıyor), yoksa iş
  ilanı / kazanan (award) / varlık satışı (disposal) / haber mi?"
  - Ucuz ön-filtre: `notice_type` enum'u (sadece tender/rfp/rfq/eoi/prequalification al;
    award/cancellation/disposal/vacancy ele). Uganda'da "Disposal" sütununu alma.
  - AI teyidi: belirsizler için. "İhale değil" → **ELE, yayınlama.**

### 6. AI çeviri + ÖZET (EN+TR) · 🔴 yeni · `translate-summarize` worker
- `title_en/tr`, `summary_en/tr` üretir. **Her ihale sayfasında AI özeti bundan gelir.**
- (Bu, TR aramayı da açar — şu an İngilizce içerik TR aramada çıkmıyor.)
- **Model: Gemini 2.5 Flash-Lite** (özet için — çok ucuz, yüksek hacme uygun; kurucu tercihi).

### 7. Cross-source dedup — KATMAN 2 (anlamsal) · 🔴 yeni
Katman 1'in kaçırdığı (dili/formatı çok farklı) kopyalar için:
- `alıcı | başlık | ülke | deadline` embedding'i (pgvector'da)
- Aynı blokta yüksek kosinüs benzerliği → aday; **0.75–0.90 arası → LLM-hakem** ("aynı mı?")
- Aynıysa → kümeleri birleştir, fazlalığı yayından çek.

### 8. Publish gate — `publish-gate` · ✅ mantık kurulu
- `extraction_confidence ≥ 0.7` → **publish** (`is_published = true`)
- `< 0.7` → **admin inceleme kuyruğu** (`/admin`), elle onay.
- Küme başına **tek kanonik** yayınlanır (kanonik = ülkesiyle uyumlu ulusal portal > en çok
  belge/en yüksek quality_score; diğerleri "ayna").

### 9. Meili index — `index-sync` worker · ✅ kurulu
Kanonik yayınlanan ihale Meili'ye → sitede aranabilir. Kapanan/yayından çıkan silinir.

### 10. Alarm eşleştir — `alert-match` worker · ✅ kurulu
Yeni ihale ↔ kullanıcı kayıtlı aramaları. Eşleşme + frekans (anlık/günlük/haftalık) →
e-posta işi. (Kullanıcı küme başına **1 kez** uyarılır.)

### 11. E-posta — `email-dispatch` worker · ✅ kurulu (Resend anahtarı bekliyor)
Resend ile digest e-posta. → Çekirdek döngü tamam.

### 12. Durum tazeleme — `status-refresh` worker · ✅ kurulu
Günlük: son tarihe göre open → closing_soon → closed; kapananları index'ten düşür.

---

## AI katmanı — model ve görev tablosu (OpenRouter üzerinden)

| Görev | Model | Not |
|-------|-------|-----|
| **İhale ÖZETİ (her sayfa)** | **Gemini 2.5 Flash-Lite** | Kurucu tercihi; çok ucuz, yüksek hacim |
| Alan çıkarımı (JSON) | Gemini 2.5 Flash | Daha güçlü; düşük-güvende Pro'ya yükselt |
| Çeviri EN↔TR | Gemini 2.5 Flash / Flash-Lite | |
| Sınıflandırma (ihale mi?) | Flash-Lite | Ucuz, ikili karar |
| Belge/görsel okuma (OCR) | Gemini multimodal **veya** tesseract.js | Test edilip seçilecek |
| Dedup embedding | Gemini/OpenAI embeddings | pgvector'da saklanır |
| Dedup LLM-hakem (sınırdakiler) | Flash | Sadece kararsız çiftler |

`.env`: `OPENROUTER_API_KEY` hazır. `OPENROUTER_MODEL=google/gemini-2.5-flash` (özet için
Flash-Lite'a ayarlanacak; görev başına model seçilebilir).

---

## Belge (PDF/Word/görsel) çıkarımı — nasıl yapacağız

**Sorun:** Bazı ilanlarda asıl bilgi (kapsam, şartlar, son tarih) **ekli PDF/Word/görselde.**

**Çözüm (4. + 6. adım):**
1. Ekli belge URL'lerini al (`documents[]`).
2. İndir → tür tespit (PDF / DOCX / JPG-PNG / taranmış-PDF).
3. Metin çıkar:
   - PDF (metin katmanlı) → `pdf-parse`/`pdfjs`
   - DOCX → docx parser
   - Görsel / taranmış PDF → **OCR** (tesseract.js) **veya** Gemini multimodal'a doğrudan ver
4. Çıkan metni AI'ya ver → hem eksik yapılandırılmış alanları doldur, hem **özet** çıkar.
5. Belge linkleri detay sayfasında listelenir (biz belgeyi barındırmayız, sadece linkleriz).

**Karar noktası:** "OCR + ayrı AI" mi, yoksa "PDF/görseli doğrudan Gemini multimodal'a verip
tek çağrıda özet+alan" mı — ilki daha kontrollü/ucuz, ikincisi daha basit. Hacim/maliyet
testiyle seçilecek.

---

## İnşa durumu

| Parça | Durum |
|---|---|
| Scrape (5 kaynak) · Normalize · Publish gate · Index · Alarm · E-posta · Status | ✅ |
| Zamanlayıcı tetiği (12:00) | 🟡 iskele |
| Cross-source dedup — Katman 1 (deterministik) | 🔴 |
| Cross-source dedup — Katman 2 (embedding + LLM) + pgvector | 🔴 |
| Sınıflandırma kapısı (ihale mi?) | 🔴 |
| Belge indir + PDF/Word/OCR | 🔴 |
| AI alan çıkarımı | 🔴 |
| AI çeviri + özet (Flash-Lite) | 🔴 |
| Kanonik seçim + "ayrıca şurada" UI | 🔴 |

**Asıl inşa edilecek "AI beyni":** belge/OCR → çıkarım+sınıflandırma → çeviri+özet, artı
iki dedup katmanı. Gerisi hazır ve gerçek veriyle test edildi (~254 canlı ihale).

**Operasyonel:** Düzenli çalışması için worker deploy (Railway) + Redis gerekli (Upstash
kotası dolu; şimdilik backfill elle çalışıyor).
