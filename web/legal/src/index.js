// Pastacım — Yasal dokümanlar (Kullanım Koşulları + Gizlilik Politikası)
// Cloudflare Worker. pastacim.ipekciapp.com üzerinden text/html olarak servis eder.
//
// NEDEN: Supabase Edge Functions, paylaşılan *.supabase.co alan adında yanıtı
// zorla `text/plain` + `sandbox` CSP ile döndürüyor (anti-phishing). Bu yüzden
// HTML, App Store / tarayıcıda ham metin olarak görünüyordu. Worker temiz HTML döner.

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a; line-height: 1.7; }
  h1 { color: #D4526E; }
  h2 { color: #333; margin-top: 32px; }
  a { color: #D4526E; }
  .updated { color: #888; font-size: 0.9em; }
  @media (prefers-color-scheme: dark) {
    body { background: #121212; color: #e8e8e8; }
    h2 { color: #ddd; }
  }
`;

function page(title, inner) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Pastacım</title>
  <style>${STYLE}</style>
</head>
<body>
${inner}
</body>
</html>`;
}

const TERMS = page('Kullanım Koşulları', `
  <h1>Kullanım Koşulları</h1>
  <p class="updated">Son güncelleme: 8 Haziran 2026</p>

  <p>Bu kullanım koşulları, <strong>Pastacım</strong> ve <strong>Pastacım Pro</strong> uygulamalarını kullanırken geçerli olan kuralları belirler. Uygulamaları kullanarak bu koşulları kabul etmiş sayılırsınız.</p>

  <h2>1. Hizmet Tanımı</h2>
  <p>Pastacım, müşterilerin pasta / tatlı / börek siparişi oluşturduğu; yakınlarındaki pastacıların bu siparişlere teklif verdiği bir aracı platformdur. Platform yalnızca müşteri ile pastacı arasında aracılık sağlar; siparişin kalitesi veya tesliminden doğrudan sorumlu değildir.</p>

  <h2>2. Hesap Koşulları</h2>
  <ul>
    <li>Gerçek ve güncel bilgilerle kayıt olmanız zorunludur.</li>
    <li>Hesap güvenliğiniz sizin sorumluluğunuzdadır.</li>
    <li>Bir hesap birden fazla kişi tarafından kullanılamaz.</li>
  </ul>

  <h2>3. Müşteri Yükümlülükleri</h2>
  <ul>
    <li>Sipariş oluştururken gerçek ve eksiksiz bilgi verilmelidir.</li>
    <li>Kabul edilen teklif için pastacıyla iyi niyetli iletişim kurulmalıdır.</li>
    <li>Sipariş iptallerinde pastacı bildirilmelidir.</li>
  </ul>

  <h2>4. Pastacı Yükümlülükleri</h2>
  <ul>
    <li>Yalnızca gerçekçi ve yerine getirebileceğiniz teklifler veriniz.</li>
    <li>Kabul edilen siparişleri belirlenen sürede teslim etmeye çalışınız.</li>
    <li>Dükkan profilinizde güncel ve doğru bilgilere yer veriniz.</li>
  </ul>

  <h2>5. Yasaklı Kullanımlar</h2>
  <ul>
    <li>Platform üzerinden yanıltıcı, sahte veya yasadışı içerik paylaşmak</li>
    <li>Diğer kullanıcıları taciz etmek veya spam göndermek</li>
    <li>Uygulamanın güvenlik önlemlerini aşmaya çalışmak</li>
    <li>Üçüncü taraf yazılımlarla platformu otomatize etmek</li>
  </ul>

  <h2>6. Sorumluluk Sınırı</h2>
  <p>Platform, aracı konumundadır. Müşteri ile pastacı arasındaki ticari anlaşmazlıklarda platform doğrudan taraf değildir; arabuluculuk amacıyla destek verebilir.</p>

  <h2>7. Değişiklikler</h2>
  <p>Koşulları önceden haber vererek değiştirebiliriz. Önemli değişikliklerde uygulama içi bildirim yapılır.</p>

  <h2>8. İletişim</h2>
  <p><a href="mailto:info@ipekciapp.com">info@ipekciapp.com</a></p>
`);

const PRIVACY = page('Gizlilik Politikası', `
  <h1>Gizlilik Politikası</h1>
  <p class="updated">Son güncelleme: 8 Haziran 2026</p>

  <p>Bu gizlilik politikası, <strong>Pastacım</strong> ve <strong>Pastacım Pro</strong> mobil uygulamalarının kişisel verilerinizi nasıl topladığını, kullandığını ve koruduğunu açıklar. Uygulamalarımızı kullanarak bu politikayı kabul etmiş sayılırsınız.</p>

  <h2>1. Geliştirici Bilgisi</h2>
  <p>
    Uygulama Geliştirici: Soner İpekci<br>
    İletişim: <a href="mailto:info@ipekciapp.com">info@ipekciapp.com</a>
  </p>

  <h2>2. Topladığımız Veriler</h2>
  <ul>
    <li><strong>Hesap bilgileri:</strong> E-posta adresi ve ad-soyad (kayıt sırasında alınır).</li>
    <li><strong>Konum:</strong> Yakındaki pastacıları veya sipariş taleplerini listelemek için yalnızca uygulama ön plandayken anlık konum alınır. Konum sürekli izlenmez ve cihaz dışında saklanmaz.</li>
    <li><strong>Profil fotoğrafı:</strong> Yüklemeyi tercih etmeniz hâlinde depolanır.</li>
    <li><strong>Push token:</strong> Sipariş ve teklif bildirimlerini iletmek için cihaz push token'ı kaydedilir.</li>
    <li><strong>Sipariş ve teklif içerikleri:</strong> Platform üzerindeki ticari işlemlerin yürütülmesi için saklanır.</li>
    <li><strong>Mesajlar:</strong> Müşteri–pastacı iletişimi platform üzerinde şifreli olarak saklanır.</li>
  </ul>

  <h2>3. Verilerin Kullanım Amacı</h2>
  <ul>
    <li>Hesap oluşturma ve kimlik doğrulama</li>
    <li>Konum bazlı pastacı / sipariş eşleştirmesi</li>
    <li>Sipariş, teklif ve mesaj bildirimlerinin iletilmesi</li>
    <li>Platform güvenliği ve sahteciliğin önlenmesi</li>
  </ul>

  <h2>4. Üçüncü Taraf Hizmetler</h2>
  <ul>
    <li><strong>Supabase</strong> (veri tabanı ve kimlik doğrulama): Verileriniz AB Standart Sözleşme Hükümleri (SCC) kapsamında işlenir. Bkz. <a href="https://supabase.com/privacy" target="_blank">Supabase Gizlilik Politikası</a>.</li>
    <li><strong>Google OAuth / Firebase Cloud Messaging</strong>: Google hesabıyla giriş ve push bildirimleri için kullanılır. Bkz. <a href="https://policies.google.com/privacy" target="_blank">Google Gizlilik Politikası</a>.</li>
    <li><strong>Google Maps / Places API</strong>: Pastacı dükkan konumu doğrulaması için kullanılır.</li>
    <li><strong>Expo (EAS)</strong>: Uygulama dağıtımı ve OTA güncellemeleri için kullanılır.</li>
  </ul>

  <h2>5. Veri Saklama Süresi</h2>
  <p>Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı uygulama içindeki "Hesabımı Sil" seçeneğiyle silebilirsiniz; bu işlem tüm kişisel verilerinizi kalıcı olarak siler.</p>

  <h2>6. Çocukların Gizliliği</h2>
  <p>Uygulamalarımız 13 yaşın altındaki çocuklara yönelik değildir ve bu yaş grubundan bilerek veri toplamıyoruz.</p>

  <h2>7. Haklarınız</h2>
  <ul>
    <li>Verilerinize erişim talep edebilirsiniz.</li>
    <li>Verilerinizin düzeltilmesini isteyebilirsiniz.</li>
    <li>Hesabınızı ve tüm verilerinizi kalıcı olarak silebilirsiniz (uygulama içi "Hesabımı Sil").</li>
    <li>Her türlü soru ve talep için <a href="mailto:info@ipekciapp.com">info@ipekciapp.com</a> adresine yazabilirsiniz.</li>
  </ul>

  <h2>8. Değişiklikler</h2>
  <p>Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişikliklerde uygulama içi bildirim veya e-posta ile bilgilendirme yapılır.</p>
`);

const HOME = page('Yasal', `
  <h1>Pastacım — Yasal</h1>
  <ul>
    <li><a href="/terms">Kullanım Koşulları</a></li>
    <li><a href="/privacy">Gizlilik Politikası</a></li>
  </ul>
`);

function htmlResponse(body, cache = true) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// ── E-posta aboneliği (unsubscribe / resubscribe) ───────────────────────────
// Supabase edge function'lar HTML'i sandbox'lıyor (text/plain'e çeviriyor); bu
// yüzden sayfa burada (Cloudflare worker) servis edilir, opt-out RPC ile yapılır.
const SUPA_URL = 'https://lvrbzhziayegyinkcuka.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cmJ6aHppYXllZ3lpbmtjdWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDkzMDMsImV4cCI6MjA5NTE4NTMwM30.GtcdOSz26CZ8nrHGYOCmVcpCdefhT_njTIfx2KDhEgI';

function unsubPage(heading, bodyHtml, extraHtml = '') {
  return htmlResponse(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} — Pastacım</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FFF9F9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:480px;width:100%;padding:40px 32px;text-align:center}.emoji{font-size:48px;margin-bottom:16px}h2{color:#8B1A3D;font-size:22px;font-weight:800;margin-bottom:16px}p{color:#4A5568;font-size:14px;line-height:1.7;margin-bottom:10px}.btn{display:inline-block;margin-top:24px;padding:14px 32px;background:#8B1A3D;color:#fff;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px}.note{color:#A0AEC0;font-size:12px;margin-top:28px}</style>
</head><body><div class="card"><div class="emoji">🎂</div><h2>${heading}</h2>${bodyHtml}${extraHtml}<p class="note">Pastacım &mdash; Türkiye'nin pasta platformu</p></div></body></html>`, false);
}

async function handleUnsubscribe(url) {
  const u = url.searchParams.get('u');
  const t = url.searchParams.get('t');
  const resub = url.searchParams.get('resubscribe') === '1' || url.searchParams.get('action') === 'resubscribe';
  if (!u || !t) return unsubPage('Geçersiz Bağlantı', '<p>Bu abonelik linki geçersiz görünüyor.</p>');
  try {
    const resp = await fetch(`${SUPA_URL}/rest/v1/rpc/set_email_subscription`, {
      method: 'POST',
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: u, p_token: t, p_resubscribe: resub }),
    });
    const data = await resp.json().catch(() => null);
    if (!data || data.ok !== true) {
      return unsubPage('Geçersiz Bağlantı', '<p>Bu abonelik bağlantısı artık geçerli değil. Lütfen e-postanızdaki orijinal bağlantıyı kullanın.</p>');
    }
    if (resub) {
      return unsubPage('Tekrar Abone Oldunuz! 🎉', '<p>Bundan sonra Pastacım&apos;dan kampanya ve duyuruları tekrar alacaksınız.</p>');
    }
    const resubUrl = `${url.origin}${url.pathname}?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&resubscribe=1`;
    return unsubPage(
      'Abonelikten Çıktınız',
      "<p>Bundan sonra yalnızca önemli bildirimler (sipariş durumu, teklif, hesap güvenliği) gönderilecek; pazarlama ve toplu e-posta almayacaksınız.</p><p>Fikrinizi değiştirirseniz aşağıdaki düğmeye tıklayabilirsiniz.</p>",
      `<a class="btn" href="${resubUrl}">Tekrar Abone Ol</a>`,
    );
  } catch {
    return unsubPage('Hata', '<p>Bir hata oluştu. Lütfen daha sonra tekrar deneyin.</p>');
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname.replace(/\/+$/, '') || '/') {
      case '/terms':
        return htmlResponse(TERMS);
      case '/privacy':
        return htmlResponse(PRIVACY);
      case '/unsubscribe':
        return handleUnsubscribe(url);
      case '/':
        return htmlResponse(HOME);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};
