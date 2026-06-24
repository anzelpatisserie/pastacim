// Pastacım — admin toplu e-posta (yalnız anzelpatisserie@gmail.com).
// Hedef app'in OPT-IN (email_opt_out=false) kullanıcılarına Brevo ile gönderir,
// her maile kişisel unsubscribe linki + List-Unsubscribe header ekler,
// email_campaigns'e tarihçe yazar. Toplu/pazarlama maili olduğundan opt-out'a UYAR.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const ADMIN_EMAIL = "anzelpatisserie@gmail.com";

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

    // 1) Admin doğrulama
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "unauthenticated" }, 401);
    const { data: cu } = await admin.from("users").select("email").eq("id", caller.id).single();
    if (cu?.email !== ADMIN_EMAIL) return json({ error: "yetkisiz" }, 403);

    // 2) Girdi
    const body = await req.json().catch(() => null);
    const app = body?.app as string;
    const subject = String(body?.subject ?? "").trim();
    const htmlBody = String(body?.body ?? "").trim();
    if (!["customer", "baker"].includes(app) || !subject || !htmlBody) {
      return json({ error: "gecersiz_girdi" }, 400);
    }
    if (!apiKey) return json({ error: "brevo_key_yok" }, 500);

    // 3) Alıcılar — yalnız opt-in
    const col = app === "customer" ? "is_customer" : "is_baker";
    const { data: users } = await admin
      .from("users")
      .select("id, email, full_name, email_unsub_token")
      .eq(col, true).eq("email_opt_out", false).not("email", "is", null);
    const recipients = (users ?? []).filter((u: { email: string | null }) => !!u.email);

    const shell = (unsubUrl: string) =>
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2D3748">
        <div style="text-align:center;font-size:30px">🎂</div>
        ${htmlBody}
        <p style="margin-top:24px;color:#718096;font-size:12px">Bu e-postayı Pastacım'a kayıtlı olduğunuz için aldınız.
        <a href="${unsubUrl}" style="color:#8B1A3D">Abonelikten çık</a></p>
      </div>`;

    let sent = 0;
    for (let i = 0; i < recipients.length; i += 20) {
      const chunk = recipients.slice(i, i + 20);
      await Promise.all(chunk.map(async (u: { id: string; email: string; email_unsub_token: string }) => {
        const unsubUrl = `${FUNCTIONS_BASE}/unsubscribe?u=${u.id}&t=${u.email_unsub_token}`;
        try {
          const res = await fetch(BREVO_URL, {
            method: "POST",
            headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
              sender: { name: "Pastacım", email: "noreply@ipekciapp.com" },
              to: [{ email: u.email }],
              subject,
              htmlContent: shell(unsubUrl),
              headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
            }),
          });
          if (res.ok) sent++;
          else console.error("broadcast brevo FAIL", res.status, await res.text());
        } catch (e) {
          console.error("broadcast send err", String(e));
        }
      }));
    }

    await admin.from("email_campaigns").insert({
      app_target: app, subject, body: htmlBody, sent_count: sent, created_by: caller.id,
    });

    return json({ sent_count: sent, total: recipients.length, error: null });
  } catch (e) {
    console.error("admin-broadcast-email exception", String(e));
    return json({ error: "exception" }, 500);
  }
});
