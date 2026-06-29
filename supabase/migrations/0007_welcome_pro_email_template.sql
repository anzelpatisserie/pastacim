-- 0007: Pastacı (Pro) app'i için ayrı markalı hoş geldin e-postası şablonu.
-- Applied via Supabase MCP apply_migration on 2026-06-24.
INSERT INTO public.email_templates (key,subject,body,description) VALUES
 ('welcome_pro','Pastacım Pro''ya Hoş Geldin! 🎉', '<p>Pastacım Pro''ya hoş geldin! Yakınındaki sipariş taleplerini gör, teklif ver ve işini büyüt.</p>', 'Pastacı (Pro) kayıt sonrası hoş geldin')
ON CONFLICT (key) DO NOTHING;
