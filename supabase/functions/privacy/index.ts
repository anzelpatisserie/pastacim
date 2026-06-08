import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gizlilik Politikası — Pastacım</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a; line-height: 1.7; }
    h1 { color: #D4526E; }
    h2 { color: #333; margin-top: 32px; }
    a { color: #D4526E; }
    .updated { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Gizlilik Politikası</h1>
  <p class="updated">Son güncelleme: 8 Haziran 2026</p>

  <p>Bu gizlilik politikası, <strong>Pastacım</strong> ve <strong>Pastacım Pro</strong> mobil uygulamalarının kişisel verilerinizi nasıl topladığını, kullandığını ve koruduğunu açıklar. Uygulamalarımızı kullanarak bu politikayı kabul etmiş sayılırsınız.</p>

  <h2>1. Geliştirici Bilgisi</h2>
  <p>
    Uygulama Geliştirici: Anzel Patisserie<br>
    İletişim: <a href="mailto:anzelpatisserie@gmail.com">anzelpatisserie@gmail.com</a>
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
    <li>Her türlü soru ve talep için <a href="mailto:anzelpatisserie@gmail.com">anzelpatisserie@gmail.com</a> adresine yazabilirsiniz.</li>
  </ul>

  <h2>8. Değişiklikler</h2>
  <p>Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişikliklerde uygulama içi bildirim veya e-posta ile bilgilendirme yapılır.</p>
</body>
</html>`;

Deno.serve(async (_req: Request) => {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
