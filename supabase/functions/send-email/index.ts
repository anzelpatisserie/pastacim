// Pastacım — önemli anlar için transactional e-posta (Brevo v3 API).
// Alıcının e-postası service role ile DB'den bakılır; tip-bazlı template.
// ÇALIŞMASI İÇİN: Supabase'de `BREVO_API_KEY` (Brevo v3 API key, xkeysib-...)
// secret'ı ayarlı olmalı:  supabase secrets set BREVO_API_KEY=xkeysib-...
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

type EmailType = "welcome" | "order_ready" | "offer_accepted" | "review_encourage";

function template(type: EmailType, name: string, data: Record<string, unknown>) {
  const title = (data.orderTitle as string) ?? "siparişin";
  const wrap = (heading: string, body: string) => ({
    subject: heading,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2D3748">
      <div style="text-align:center;font-size:30px">🎂</div>
      <h2 style="color:#8B1A3D">${heading}</h2>
      <p>Merhaba ${name},</p>
      ${body}
      <p style="margin-top:24px;color:#718096;font-size:13px">Pastacım • Hayalindeki pastayı yakındaki ustalar yapsın</p>
    </div>`,
  });
  switch (type) {
    case "welcome":
      return wrap("Pastacım'a Hoş Geldin! 🎉", `<p>Aramıza katıldığın için mutluyuz. Hayalindeki pastayı tarif et, yakındaki ustalardan teklif al!</p>`);
    case "order_ready":
      return wrap("Siparişin Teslimata Hazır! 📦", `<p><b>"${title}"</b> siparişin pastacı tarafından hazırlandı ve teslim almaya hazır.</p>`);
    case "offer_accepted":
      return wrap("Teklifin Kabul Edildi! ✅", `<p><b>"${title}"</b> siparişi için verdiğin teklif müşteri tarafından kabul edildi. Hadi hazırlamaya başla!</p>`);
    case "review_encourage":
      return wrap("Siparişin Nasıldı? ⭐", `<p><b>"${title}"</b> siparişin tamamlandı. Pastacıya bir yorum bırakarak diğer müşterilere yardımcı olur musun?</p>`);
    default:
      return null;
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    const { userId, type, data } = await req.json();
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) return json({ error: "BREVO_API_KEY ayarlı değil" }, 500);
    if (!userId || !type) return json({ error: "userId ve type gerekli" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: user } = await admin.from("users").select("email, full_name").eq("id", userId).single();
    if (!user?.email) return json({ error: "kullanıcı/email bulunamadı" }, 404);

    const tpl = template(type as EmailType, user.full_name ?? "değerli kullanıcı", data ?? {});
    if (!tpl) return json({ error: "geçersiz type" }, 400);

    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Pastacım", email: "noreply@ipekciapp.com" },
        to: [{ email: user.email }],
        subject: tpl.subject,
        htmlContent: tpl.html,
      }),
    });
    if (!res.ok) return json({ error: "brevo " + res.status, detail: await res.text() }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
