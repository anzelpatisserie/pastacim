// Pastacım — e-posta abonelikten çıkma / tekrar abone olma (public link, JWT gerekmez).
// Toplu mail footer'ındaki linkten çağrılır: /unsubscribe?u=<userId>&t=<token>
// Token doğrulanır → users.email_opt_out güncellenir → Türkçe HTML sayfası gösterilir.
// Tekrar abone olmak için: /unsubscribe?u=<userId>&t=<token>&resubscribe=1
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const htmlPage = (title: string, heading: string, bodyHtml: string, extraHtml = "") =>
  new Response(
    `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Pastacım</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, Segoe UI, Roboto, sans-serif;
      background: #FFF9F9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
      max-width: 480px;
      width: 100%;
      padding: 40px 32px;
      text-align: center;
    }
    .emoji { font-size: 48px; margin-bottom: 16px; }
    h2 { color: #8B1A3D; font-size: 22px; font-weight: 800; margin-bottom: 16px; }
    p { color: #4A5568; font-size: 14px; line-height: 1.7; margin-bottom: 10px; }
    .btn {
      display: inline-block;
      margin-top: 24px;
      padding: 14px 32px;
      background: #8B1A3D;
      color: #fff;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      transition: background 0.2s;
    }
    .btn:hover { background: #6D1530; }
    .note { color: #A0AEC0; font-size: 12px; margin-top: 28px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">🎂</div>
    <h2>${heading}</h2>
    ${bodyHtml}
    ${extraHtml}
    <p class="note">Pastacım &mdash; Türkiye&apos;nin pasta platformu</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get("u");
    const t = url.searchParams.get("t");
    const isResubscribe =
      url.searchParams.get("resubscribe") === "1" ||
      url.searchParams.get("action") === "resubscribe";

    if (!u || !t) {
      return htmlPage(
        "Geçersiz Bağlantı",
        "Geçersiz bağlantı.",
        `<p>Bu abonelik linki geçersiz görünüyor. Lütfen e-postanızdaki orijinal bağlantıyı kullanın.</p>`,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Token doğrulama: userId + email_unsub_token eşleşmesi
    const { data: user, error: lookupErr } = await admin
      .from("users")
      .select("id, email_opt_out, email_unsub_token")
      .eq("id", u)
      .single();

    if (lookupErr || !user || user.email_unsub_token !== t) {
      return htmlPage(
        "Geçersiz Bağlantı",
        "Bağlantı geçersiz veya süresi dolmuş.",
        `<p>Bu abonelik bağlantısı artık geçerli değil. Lütfen e-postanızdaki orijinal bağlantıyı kullanın.</p>`,
      );
    }

    if (isResubscribe) {
      // Tekrar abone ol: email_opt_out = false
      const { error: updateErr } = await admin
        .from("users")
        .update({ email_opt_out: false })
        .eq("id", u);

      if (updateErr) {
        console.error("[unsubscribe] resubscribe update error:", updateErr.message);
        throw updateErr;
      }

      return htmlPage(
        "Tekrar Abone Oldunuz",
        "Tekrar abone oldunuz! 🎉",
        `<p>Bundan sonra Pastacım&apos;dan kampanya ve duyuruları tekrar alacaksınız.</p>
         <p>Aboneliğinizi istediğiniz zaman yönetebilirsiniz.</p>`,
      );
    }

    // Abonelikten çık: email_opt_out = true
    const { error: updateErr } = await admin
      .from("users")
      .update({ email_opt_out: true })
      .eq("id", u);

    if (updateErr) {
      console.error("[unsubscribe] opt-out update error:", updateErr.message);
      throw updateErr;
    }

    // Tekrar abone olma linki
    const resubUrl = `${url.origin}${url.pathname}?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&resubscribe=1`;

    return htmlPage(
      "Abonelikten Çıktınız",
      "Abonelikten çıktınız.",
      `<p>Bundan sonra yalnızca önemli bildirimler (sipariş durumu, teklif, hesap güvenliği) gönderilecek; pazarlama ve toplu e-posta almayacaksınız.</p>
       <p>Fikrinizi değiştirirseniz aşağıdaki düğmeye tıklayabilirsiniz.</p>`,
      `<a class="btn" href="${resubUrl}">Tekrar Abone Ol</a>`,
    );
  } catch (err) {
    console.error("[unsubscribe] unexpected error:", err);
    return htmlPage(
      "Hata",
      "Bir hata oluştu.",
      `<p>Lütfen daha sonra tekrar deneyin. Sorun devam ederse destek ekibimizle iletişime geçin.</p>`,
    );
  }
});
