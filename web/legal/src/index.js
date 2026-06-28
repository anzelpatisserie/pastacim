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

function htmlResponse(body) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    switch (pathname.replace(/\/+$/, '') || '/') {
      case '/terms':
        return htmlResponse(TERMS);
      case '/privacy':
        return htmlResponse(PRIVACY);
      case '/':
        return htmlResponse(HOME);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};
