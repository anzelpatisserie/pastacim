// Pastacım — e-posta abonelikten çıkma (public link, JWT gerekmez).
// Toplu mail footer'ındaki linkten çağrılır: /unsubscribe?u=<userId>&t=<token>
// Token doğrulanır → users.email_opt_out = true → onay HTML sayfası gösterilir.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const page = (msg: string) =>
  new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pastacım</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:40px auto;padding:24px;color:#2D3748;text-align:center">
<div style="font-size:44px">🎂</div>
<h2 style="color:#8B1A3D">${msg}</h2>
<p style="color:#718096;font-size:13px">Pastacım</p>
</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get("u");
    const t = url.searchParams.get("t");
    if (!u || !t) return page("Geçersiz bağlantı.");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: user } = await admin
      .from("users").select("id, email_unsub_token").eq("id", u).single();
    if (!user || user.email_unsub_token !== t) {
      return page("Bağlantı geçersiz veya süresi dolmuş.");
    }
    await admin.from("users").update({ email_opt_out: true }).eq("id", u);
    return page("E-posta aboneliğinden çıktınız.<br>Artık toplu e-posta almayacaksınız.");
  } catch {
    return page("Bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
  }
});
