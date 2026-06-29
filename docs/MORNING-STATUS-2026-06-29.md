# Sabah Durumu — 2026-06-29 (gece otonom oturum)

## ✅ Tamamlandı + OTA'da (production, runtime 1.0.0 — aç/kapa ile gelir)
- **Avatar her yerde**: mesaj listesi + mesaj ekranı başlığı + sipariş kartları (customer order detail, baker ActiveOrderCard + RequestCard). `safeAvatarUri` ile **güvenlik filtresi** (sadece Supabase storage host'u — avatar_url kullanıcı-kontrollü, IP sızıntısı önlendi). avatar_url yoksa emoji fallback. (migration 0012 get_conversations.other_user_avatar)
- **Kapalı sohbet kilidi**: sohbet kapalıyken (aktif teklif/sipariş yok) mesaj başlığından profil/dükkan'a gidilemez; tamamlanan/iptal siparişte telefon + iletişim kanalları + mesaj butonu gizli (customer order detail + baker ActiveOrderCard phone).
- **Şikayet (ReportModal)**: resim eki eklendi (galeri → feedbacks bucket `<uid>/reports/...` → admin görebilir) + Android klavye fix (ScrollView + height). file_report'a image_url + admin push **taze token**'a (baker_push_token öncelik) — migration 0013.
- **useUnreadMessages realtime crash FIX** (önceki): channelRef + benzersiz topic. Doğrulandı (emülatör, postgres error 0).
- **Baker ActiveOrderCard kompaktlaştırıldı** (Talepler redesign'in parçası).

## ⚠️ Native build gerektirir (OTA ile GİTMEZ — bir sonraki build'de)
- **Baker app ikonu**: adaptiveIcon bg `#000000` → `#8B1A3D` (siyah köşe bug'ı). `apps/baker/app.config.js`. **Yeni Android build + AAB gerekir.**

## ⏳ Yarım kalan / sabaha (quota/session limiti nedeniyle)
1. **Baker Talepler redesign** — agent session limitine takıldı, sadece ActiveOrderCard kompaktlandı. KALAN: bölüm sıralaması (Açık Talepler üstte → Bekleyen → Aktif → Tamamlanan → Siparişe Dönmeyen), Tamamlanan'ı "Siparişe Dönmeyen" gibi mini-card yap, "Bu bölgede talep yok" empty state'i küçült+canlandır. Dosya: `apps/baker/app/(baker)/index.tsx`.
2. **E-posta sistemi (E)**:
   - **Teklif kabul / teslimat mailleri gelmiyor** (welcome geliyor). `sent_emails`'te sadece welcome var → `send-email` fonksiyonunda offer_accepted/order_ready için **yetki kontrolü (satır 82-100) başarısız olup dedup öncesi return ediyor** (en olası). Loglar hep 200 (fonksiyon hep 200 döner), console.error görünmüyor → odaklı debug gerek: fonksiyona geçici log ekle ya da auth query'sini (offers embed `.eq("orders.customer_id", ...)`) test et. Olası: sendAppEmail accept commit'ten önce ateşleniyor (timing) ya da embed filter semantiği.
   - Admin toplu e-posta panelinde **abone toggle TERS** kurgulanmış (abone=sağ+"abone", sola kaydır="çıktı").
   - **unsubscribe** edge function sayfası raw HTML görünüyor (Content-Type text/html değil) + abonelikten çıkış **kalıcı olmuyor** (admin panelde hala abone) + tekrar-abone akışı yok. Dosya: `supabase/functions/unsubscribe/`.
3. **Web sürümleri (F)** — ayrı oturuma ertelendi (kullanıcı onayı).
4. **Sipariş kartlarında avatar** — eklendi; "kullanıcı adı olan her yer" için kalan spot kontrolü sabah.

## 📱 Android cihaz push'u (G) — KULLANICI AKSİYONU (FCM v1)
Push gelmemesinin sebebi neredeyse kesin: **Expo projelerinde FCM v1 service account tanımlı değil** (Android push için zorunlu; "testte olmak" engel değil). Admin şikayet push'u da bu yüzden gelmiyor (token taze artık ama Android teslimat FCM'e bağlı). Adımlar:
1. Firebase Console → her iki proje için (customer + baker — ya da tek Firebase projesi 2 app) → **Project Settings → Service accounts → Generate new private key** → JSON indir.
2. `cd apps/customer && eas credentials` → Android → "Google Service Account" → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → JSON'u yükle. Aynısını `apps/baker` için.
3. (Alternatif) `eas credentials` interaktif; Claude çalıştıramaz → kullanıcı `! eas credentials` ile yapabilir.
Doğrulama: yükledikten sonra yeni bir bildirim tetikle; Expo push receipt'inde `DeviceNotRegistered`/`InvalidCredentials` kalmamalı.

## Git
Tüm tamamlanan iş commit'li (son: ikon+kompakt kart). Branch: `fix/test-feedback-batch-jun23`.
