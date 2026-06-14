// Pastacım — önemli anlar için transactional e-posta (Brevo v3 API).
// Güvenlik: çağıran JWT'si doğrulanır (anon reddedilir), tip-bazlı yetki
// kontrolü yapılır (çağıran ilgili siparişin tarafı mı), HTML escape edilir,
// sent_emails ile idempotency/loop guard, tüm hatalarda generic yanıt + sunucu log.
// ÇALIŞMASI İÇİN: Supabase'de `BREVO_API_KEY` (Brevo v3 API key, xkeysib-...) secret'ı gerekir.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TYPES = ["welcome", "order_ready", "offer_accepted", "review_encourage"];

const esc = (s: unknown) =>
  String(s ?? "").slice(0, 120)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function template(type: string, name: string, data: Record<string, unknown>) {
  const title = esc(data.orderTitle ?? "siparişin");
  const safeName = esc(name || "değerli kullanıcı");
  const wrap = (heading: string, body: string) => ({
    subject: heading,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2D3748">
      <div style="text-align:center;font-size:30px">🎂</div>
      <h2 style="color:#8B1A3D">${heading}</h2>
      <p>Merhaba ${safeName},</p>
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

function ok() { return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }); }

Deno.serve(async (req) => {
  // Her başarısızlıkta aynı generic yanıt (user enumeration / oracle yok); detay sunucuda loglanır.
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => null);
    const userId = body?.userId as string | undefined;
    const type = body?.type as string | undefined;
    const data = (body?.data ?? {}) as Record<string, unknown>;
    const orderId = (data.orderId as string | undefined) ?? null;
    if (!userId || !type || !TYPES.includes(type)) { console.error("send-email: bad request"); return ok(); }

    // 1) Çağıran kimliği (anon key reddedilir; gerçek kullanıcı JWT'si şart)
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) { console.error("send-email: unauthenticated"); return ok(); }

    // 2) Tip-bazında yetki: çağıran ilgili siparişin tarafı mı?
    let authorized = false;
    if (type === "welcome") {
      authorized = caller.id === userId;
    } else if (type === "order_ready" || type === "review_encourage") {
      // caller = pastacı, userId = müşteri
      const { data: rows } = await admin.from("offers")
        .select("id, orders!inner(customer_id)")
        .eq("baker_id", caller.id).eq("status", "accepted")
        .eq("orders.customer_id", userId).limit(1);
      authorized = !!rows?.length;
    } else if (type === "offer_accepted") {
      // caller = müşteri, userId = pastacı
      const { data: rows } = await admin.from("offers")
        .select("id, orders!inner(customer_id)")
        .eq("baker_id", userId).eq("status", "accepted")
        .eq("orders.customer_id", caller.id).limit(1);
      authorized = !!rows?.length;
    }
    if (!authorized) { console.error("send-email: unauthorized", type, caller.id); return ok(); }

    // 3) Idempotency / loop guard: aynı (alıcı,tip,sipariş) ikinci kez gönderilmez
    const { error: dupErr } = await admin.from("sent_emails")
      .insert({ recipient_id: userId, type, order_id: orderId });
    if (dupErr) { console.error("send-email: dedup/skip", dupErr.code); return ok(); }

    if (!apiKey) { console.error("send-email: BREVO_API_KEY yok"); return ok(); }
    const { data: user } = await admin.from("users").select("email, full_name").eq("id", userId).single();
    if (!user?.email) { console.error("send-email: email yok"); return ok(); }

    const tpl = template(type, user.full_name ?? "", data);
    if (!tpl) return ok();

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
    if (!res.ok) console.error("send-email: brevo", res.status, await res.text());
    return ok();
  } catch (e) {
    console.error("send-email: exception", String(e));
    return ok();
  }
});
