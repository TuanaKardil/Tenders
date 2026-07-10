# Kurulum Talimatları (kurucu için)

Kodun beklediği tüm servisler ve anahtarların nereye gireceği. Tam liste: `/.env.example`.
Kural: **gizli anahtarlar sadece `.env` / `apps/web/.env.local` dosyalarına** — git'e girmezler.

## Öncelik 1 — Uygulamayı gerçek hesaplarla çalıştırmak

### 1. Supabase (veritabanı) — kurulu, sadece şifre gerekli
Proje: `tenderlist` (ref `ubmhbtqmzrhjnzorbtky`, eu-central-1). Şema + seed yüklü, RLS kilitli.
⚠️ "TuanaKardil's Project" başka bir uygulamanın — ona dokunma.

1. supabase.com/dashboard → **tenderlist** → Settings → Database → *Reset database password*
2. Üstte **Connect** → ORMs sekmesi → iki bağlantı dizesi:
```
DATABASE_URL=postgresql://postgres.ubmhbtqmzrhjnzorbtky:SIFRE@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.ubmhbtqmzrhjnzorbtky:SIFRE@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```
- 6543 (pooled) → uygulama, 5432 (direct) → sadece migration.
- Lokal geliştirme brew Postgres (port 5433) ile çalışmaya devam edebilir; Supabase değerleri deploy'da Vercel/Railway env'ine girer.

### 2. Clerk (giriş/kayıt)
1. clerk.com → Create application: `Tenderlist`
2. Giriş yöntemleri: **Email (magic link)** + **Google**
3. Anahtarları `apps/web/.env.local` içine:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```
4. Webhook (deploy sonrası): Configure → Webhooks → Add endpoint
   - URL: `https://SITE/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
   - Signing secret → `CLERK_WEBHOOK_SECRET`
5. Türkçe arayüz: Customization → Localization → Turkish.

### 3. Upstash Redis (canlı kuyruklar)
1. console.upstash.com → Create Database: `tenderlist`, bölge eu-central-1, TLS açık
2. "Redis URL" (`rediss://default:...`) → `REDIS_URL`
- Lokalde brew Redis yeterli; bu değer deploy içindir.

## Öncelik 2 — Ödeme (Faz 1d)

### 4. Paddle Sandbox
1. sandbox-vendors.paddle.com/signup → sandbox hesabı
2. Developer Tools → Authentication:
   - API key → `PADDLE_API_KEY`
   - Client-side token → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
3. Catalog → Products:
   - `Starter`: $19/ay, $190/yıl
   - `Pro`: $59/ay, $590/yıl
4. 4 price ID'yi (`pri_...`) not et → koda girilecek.
5. Webhook (deploy sonrası): Developer Tools → Notifications → Destination:
   `https://SITE/api/webhooks/paddle` → secret → `PADDLE_WEBHOOK_SECRET`
6. **Canlı Paddle onayı haftalar sürebilir — site yayına girer girmez başvur.**

## Öncelik 3 — Canlıya çıkış

### 5. Alan adı
Çalışma adı "Tenderlist", placeholder domain `tenderlist.app`. Karar verilince
e-posta şablonları, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL` ve SEO ayarları güncellenecek.

### 6. Meilisearch Cloud
cloud.meilisearch.com → proje → `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `MEILISEARCH_SEARCH_KEY`.
Kurulumdan sonra indeks ayarları + tam yeniden indeksleme:
`cd apps/worker && pnpm exec tsx src/scripts/meili-setup.ts --reindex`

### 7. Resend (e-posta)
1. resend.com → Domains → alan adını ekle → DKIM/SPF DNS kayıtlarını gir
2. API key → `RESEND_API_KEY`, gönderen → `EMAIL_FROM="Tenderlist <alerts@DOMAIN>"`
- `RESEND_API_KEY` yokken worker e-postaları göndermez, log'lar (dev modu).

### 8. Railway (worker)
railway.app → GitHub ile bağlan → `TuanaKardil/Tenders` reposu.
Servis ayarı: root `apps/worker`, start `pnpm exec tsx src/index.ts`.
Env: `DATABASE_URL` (pooled), `REDIS_URL`, `MEILISEARCH_HOST/ADMIN_KEY`,
`RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`.

### 9. Vercel (web)
vercel.com/new → `TuanaKardil/Tenders` import → Root Directory: `apps/web`.
Env: `.env.example`'daki tüm web değişkenleri.

### 10. PostHog + Sentry (Faz 1e)
- posthog.com (EU) → `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- sentry.io → web + worker için `SENTRY_DSN`

## Lokal geliştirme stack'i (hazır)
```
brew services yerine manuel:
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 -o "-p 5433" start
redis-server --port 6379 --daemonize yes
meilisearch --master-key devmasterkey12345 --db-path <dizin> --http-addr 127.0.0.1:7700

# migration + seed
pnpm db:migrate && pnpm db:seed
# meili ayar + indeks
cd apps/worker && pnpm exec tsx src/scripts/meili-setup.ts --reindex
# worker + web
cd apps/worker && pnpm dev
cd apps/web && pnpm dev
```
