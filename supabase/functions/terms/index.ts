import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kullanım Koşulları — Pastacım</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; color: #1a1a1a; line-height: 1.7; }
    h1 { color: #D4526E; }
    h2 { color: #333; margin-top: 32px; }
    a { color: #D4526E; }
    .updated { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
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

  <h2>8. Değişiklikler</h2>
  <p>Koşulları önceden haber vererek değiştirebiliriz. Önemli değişikliklerde uygulama içi bildirim yapılır.</p>

  <h2>9. İletişim</h2>
  <p><a href="mailto:anzelpatisserie@gmail.com">anzelpatisserie@gmail.com</a></p>
</body>
</html>`;

Deno.serve(async (_req: Request) => {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
