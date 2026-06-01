/**
 * Tüm kullanıcılara kampanya bildirimi gönder.
 *
 * Kullanım:
 *   SUPABASE_SERVICE_KEY=<key> node scripts/broadcast.js "Başlık" "Mesaj"
 *
 * Service key → Supabase Dashboard > Settings > API > service_role (secret)
 *
 * Örnek:
 *   SUPABASE_SERVICE_KEY=eyJhbG... node scripts/broadcast.js \
 *     "🎂 Özel Kampanya!" \
 *     "Bu hafta tüm siparişlerde özel fiyatlar sizi bekliyor."
 */

const SUPABASE_URL = 'https://lvrbzhziayegyinkcuka.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const title = process.argv[2] || '📣 Pastacım\'dan Duyuru!';
const body  = process.argv[3] || 'Yeni kampanyalarımızı kaçırmayın!';

async function main() {
  if (!SERVICE_KEY) {
    console.error('❌  SUPABASE_SERVICE_KEY eksik!');
    console.error('    Kullanım: SUPABASE_SERVICE_KEY=xxx node scripts/broadcast.js "Başlık" "Mesaj"');
    process.exit(1);
  }

  console.log(`\n📣  Kampanya gönderiliyor...\n    Başlık : ${title}\n    Mesaj  : ${body}\n`);

  // ── 1. broadcast_notification RPC ──────────────────────────────────────────
  // In-app bildirimleri toplu ekler; push token listesini döndürür.
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/broadcast_notification`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_title: title, p_body: body }),
  });

  if (!rpcRes.ok) {
    const txt = await rpcRes.text();
    console.error('❌  RPC hatası:', rpcRes.status, txt);
    process.exit(1);
  }

  const rows = await rpcRes.json();           // [{ push_token: "ExponentPushToken[...]" }, ...]
  const tokens = (rows ?? [])
    .map((r) => r.push_token)
    .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));

  console.log(`✅  In-app bildirimler oluşturuldu. ${tokens.length} push token bulundu.`);

  // ── 2. Expo Push API ────────────────────────────────────────────────────────
  if (tokens.length === 0) {
    console.log('ℹ️   Push token yok — push bildirim gönderilmedi.');
    return;
  }

  // Expo API max 100 mesaj per request
  const CHUNK = 100;
  let sent = 0;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const messages = chunk.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: { type: 'campaign' },
    }));

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const pushData = await pushRes.json();
    const errors = (pushData?.data ?? []).filter((r) => r.status === 'error');
    sent += chunk.length - errors.length;
    if (errors.length) console.warn(`⚠️   ${errors.length} push hata:`, errors);
  }

  console.log(`📱  ${sent} / ${tokens.length} push bildirim başarıyla gönderildi.`);
  console.log('\n🎉  Kampanya tamamlandı!\n');
}

main().catch((err) => { console.error('❌ Hata:', err); process.exit(1); });
