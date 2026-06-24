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

// Şablonlar artık DB'de (email_templates) — admin panelden düzenlenebilir.
// DB'de bulunmazsa aşağıdaki sabitlere düşülür (her zaman bir mail gider).
const FALLBACK: Record<string, { subject: string; body: string }> = {
  welcome:          { subject: "Pastacım'a Hoş Geldin! 🎉", body: `<p>Aramıza katıldığın için mutluyuz. Hayalindeki pastayı tarif et, yakındaki ustalardan teklif al!</p>` },
  welcome_pro:      { subject: "Pastacım Pro'ya Hoş Geldin! 🎉", body: `<p>Pastacım Pro'ya hoş geldin! Yakınındaki sipariş taleplerini gör, teklif ver ve işini büyüt.</p>` },
  order_ready:      { subject: "Siparişin Teslimata Hazır! 📦", body: `<p><b>"{{title}}"</b> siparişin pastacı tarafından hazırlandı ve teslim almaya hazır.</p>` },
  offer_accepted:   { subject: "Teklifin Kabul Edildi! ✅", body: `<p><b>"{{title}}"</b> siparişi için verdiğin teklif müşteri tarafından kabul edildi. Hadi hazırlamaya başla!</p>` },
  review_encourage: { subject: "Siparişin Nasıldı? ⭐", body: `<p><b>"{{title}}"</b> siparişin tamamlandı. Pastacıya bir yorum bırakarak diğer müşterilere yardımcı olur musun?</p>` },
};

// welcome maili gönderen app'e göre markalanır: baker app → welcome_pro + "Pastacım Pro".
function templateKeyFor(type: string, isBaker: boolean): string {
  return type === "welcome" && isBaker ? "welcome_pro" : type;
}

// deno-lint-ignore no-explicit-any
async function buildEmail(admin: any, type: string, name: string, data: Record<string, unknown>, isBaker: boolean) {
  const title = esc(data.orderTitle ?? "siparişin");
  const safeName = esc(name || "değerli kullanıcı");
  const tplKey = templateKeyFor(type, isBaker);
  let subject: string | undefined;
  let inner: string | undefined;
  try {
    const { data: row } = await admin.from("email_templates").select("subject, body").eq("key", tplKey).single();
    if (row) { subject = row.subject; inner = row.body; }
  } catch { /* DB hatası → fallback */ }
  subject = subject ?? FALLBACK[tplKey]?.subject;
  inner = inner ?? FALLBACK[tplKey]?.body;
  if (!subject || !inner) return null;
  // Yer tutucular: {{title}} (escape'li kullanıcı verisi), {{name}}
  inner = inner.replace(/\{\{\s*title\s*\}\}/g, title).replace(/\{\{\s*name\s*\}\}/g, safeName);
  const slogan = isBaker
    ? "Pastacım Pro • Yakınındaki siparişleri yönet, teklif ver"
    : "Pastacım • Hayalindeki pastayı yakındaki ustalar yapsın";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2D3748">
      <div style="text-align:center;font-size:30px">🎂</div>
      <h2 style="color:#8B1A3D">${esc(subject)}</h2>
      <p>Merhaba ${safeName},</p>
      ${inner}
      <p style="margin-top:24px;color:#718096;font-size:13px">${slogan}</p>
    </div>`;
  return { subject, html };
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

    // 3) Idempotency / loop guard: dedup satırını LOCK olarak ekle (eşzamanlı
    //    çift gönderimi engeller). ÖNEMLİ: gönderim başarısız olursa bu satırı
    //    GERİ AL (release) — aksi halde başarısız mail bir daha hiç denenmez.
    // welcome maili app'e göre ayrı dedup'lanır (welcome vs welcome_pro) — müşteri ve
    // pastacı app'leri kendi markalı hoş geldin mailini birer kez alır.
    const isBaker = data.app === "baker";
    const dedupType = templateKeyFor(type, isBaker);
    const { error: dupErr } = await admin.from("sent_emails")
      .insert({ recipient_id: userId, type: dedupType, order_id: orderId });
    if (dupErr) { console.error("send-email: dedup/skip", dupErr.code); return ok(); }

    const release = async () => {
      let q = admin.from("sent_emails").delete().eq("recipient_id", userId).eq("type", dedupType);
      q = orderId ? q.eq("order_id", orderId) : q.is("order_id", null);
      await q;
    };

    if (!apiKey) { console.error("send-email: BREVO_API_KEY yok"); await release(); return ok(); }
    const { data: user } = await admin.from("users").select("email, full_name").eq("id", userId).single();
    if (!user?.email) { console.error("send-email: email yok"); await release(); return ok(); }

    const tpl = await buildEmail(admin, type, user.full_name ?? "", data, isBaker);
    if (!tpl) { await release(); return ok(); }

    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: isBaker ? "Pastacım Pro" : "Pastacım", email: "noreply@ipekciapp.com" },
        to: [{ email: user.email }],
        subject: tpl.subject,
        htmlContent: tpl.html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("send-email: brevo FAIL", res.status, errBody);
      await release();  // başarısız → kilidi bırak, sonra tekrar denensin
      return ok();
    }
    console.log("send-email: sent OK", type, userId);
    return ok();
  } catch (e) {
    console.error("send-email: exception", String(e));
    return ok();
  }
});
