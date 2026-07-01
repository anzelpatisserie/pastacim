-- 0022: Bildirimleri tümüyle server-side'a taşı + şablon metinleriyle hizala.
--
-- Amaç: WEB dahil her platformdan yapılan aksiyonlarda mobil cihaza GÜVENİLİR
-- push gitsin. Client-side notifyFromTemplate/notifyUser push'u tarayıcı fetch'ine
-- bağlıydı (web'de CORS/timing ile kaçabiliyor); artık app_notify (pg_net) ile
-- sunucudan gönderiliyor. Bildirim metinleri notification_templates ile hizalandı.
--
-- Kapsam:
--   1) orders status trigger → order_in_progress/order_ready/order_delivered/
--      order_completed/order_reverted (durum olayları; client direkt UPDATE yapsa
--      da bildirim server-side garantili). accepted/cancelled DOKUNULMAZ (ilgili
--      RPC'ler zaten bildiriyor → çift olmasın).
--   2) reject_offer → offer_rejected bildirimi (eskiden yalnızca client'tan).
--   3) accept_offer / cancel_order / place_order → metinleri şablonla hizala.
-- Client tarafındaki karşılık gelen notify çağrıları ayrı commit'te kaldırıldı.

-- ── 1) Durum değişikliği trigger'ı ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_baker_id uuid;
  v_actor    uuid := auth.uid();
  v_title    text := COALESCE(NEW.title, 'Siparişin');
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Kabul edilen teklifin pastacısı
  v_baker_id := COALESCE(NEW.baker_id,
    (SELECT baker_id FROM public.offers WHERE id = NEW.selected_offer_id));

  IF NEW.status = 'in_progress' THEN
    PERFORM app_notify(NEW.customer_id, 'order_in_progress',
      '🍳 Siparişin Hazırlanıyor!',
      '"' || v_title || '" siparişin hazırlanmaya başlandı.',
      jsonb_build_object('orderId', NEW.id), 'customer');

  ELSIF NEW.status = 'ready' AND OLD.status = 'completed' THEN
    -- Müşteri teslimatı geri aldı → pastacıya
    IF v_baker_id IS NOT NULL THEN
      PERFORM app_notify(v_baker_id, 'order_reverted',
        '↩️ Teslimat Geri Alındı',
        'Müşteri "' || v_title || '" siparişini henüz teslim almadığını belirtti.',
        jsonb_build_object('orderId', NEW.id), 'baker');
    END IF;

  ELSIF NEW.status = 'ready' THEN
    PERFORM app_notify(NEW.customer_id, 'order_ready',
      '📦 Siparişin Teslimata Hazır!',
      '"' || v_title || '" siparişin teslim almaya hazır.',
      jsonb_build_object('orderId', NEW.id), 'customer');

  ELSIF NEW.status = 'completed' THEN
    IF v_actor = NEW.customer_id THEN
      -- Müşteri teslim aldı → pastacıya
      IF v_baker_id IS NOT NULL THEN
        PERFORM app_notify(v_baker_id, 'order_completed',
          '🎂 Sipariş Tamamlandı',
          '"' || v_title || '" siparişi müşteri tarafından teslim alındı.',
          jsonb_build_object('orderId', NEW.id), 'baker');
      END IF;
    ELSE
      -- Pastacı teslim etti → müşteriye (müşteri henüz yorum yapmadıysa)
      IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE order_id = NEW.id) THEN
        PERFORM app_notify(NEW.customer_id, 'order_delivered',
          '🎂 Siparişin Teslim Edildi',
          '"' || v_title || '" siparişin teslim edildi olarak işaretlendi. Teslim almadıysan sipariş kartından geri alabilirsin.',
          jsonb_build_object('orderId', NEW.id), 'customer');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- bildirim hatası güncellemeyi bozmasın
END; $$;

DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_status_change();

-- ── 2) reject_offer → offer_rejected bildirimi ──────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_offer(p_offer_id uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_order_customer_id uuid;
  v_baker_id uuid;
  v_title text;
BEGIN
  SET LOCAL row_security = off;
  v_user_id := auth.uid();
  SELECT o.customer_id, off.baker_id, o.title
    INTO v_order_customer_id, v_baker_id, v_title
    FROM public.offers off JOIN public.orders o ON o.id = off.order_id
    WHERE off.id = p_offer_id;
  IF v_order_customer_id != v_user_id THEN
    RETURN json_build_object('error', 'Yetki yok.');
  END IF;

  UPDATE public.offers SET status = 'rejected' WHERE id = p_offer_id;

  -- Pastacıya ret bildirimi (server-side; eskiden client'tan gidiyordu)
  PERFORM app_notify(v_baker_id, 'offer_rejected',
    '❌ Teklifiniz Reddedildi',
    COALESCE(v_title, 'Siparişiniz') || ' için teklifiniz reddedildi.',
    jsonb_build_object('orderId', (SELECT order_id FROM public.offers WHERE id = p_offer_id)),
    'baker');

  RETURN json_build_object('success', true, 'error', NULL);
END; $function$;

-- ── 3a) accept_offer → metinleri şablonla hizala ────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_offer   offers%ROWTYPE;
  v_order   orders%ROWTYPE;
  v_rejected RECORD;
  v_title   text;
BEGIN
  SELECT * INTO v_offer FROM offers WHERE id = p_offer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'order_id', null, 'error', 'Teklif bulunamadı.');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_offer.order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'order_id', null, 'error', 'Sipariş bulunamadı.');
  END IF;

  IF auth.uid() != v_order.customer_id THEN
    RETURN jsonb_build_object('success', false, 'order_id', null, 'error', 'Yetkisiz işlem.');
  END IF;

  v_title := COALESCE(v_order.title, 'Siparişiniz');

  UPDATE offers SET status = 'accepted' WHERE id = p_offer_id;
  UPDATE offers SET status = 'rejected'
    WHERE order_id = v_offer.order_id AND id != p_offer_id AND status = 'pending';
  UPDATE orders
    SET status = 'accepted', selected_offer_id = p_offer_id, baker_id = v_offer.baker_id
    WHERE id = v_offer.order_id;

  -- Kabul edilen baker'a (şablon: offer_accepted)
  PERFORM app_notify(v_offer.baker_id, 'offer_accepted',
    '✅ Teklifiniz Kabul Edildi!',
    v_title || ' için teklifiniz kabul edildi.',
    jsonb_build_object('orderId', v_offer.order_id), 'baker');

  -- Reddedilen baker'lara (şablon: offer_rejected)
  FOR v_rejected IN
    SELECT baker_id FROM offers
    WHERE order_id = v_offer.order_id AND id != p_offer_id AND status = 'rejected'
  LOOP
    PERFORM app_notify(v_rejected.baker_id, 'offer_rejected',
      '❌ Teklifiniz Reddedildi',
      v_title || ' için teklifiniz reddedildi.',
      jsonb_build_object('orderId', v_offer.order_id), 'baker');
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_offer.order_id, 'error', null);
END; $function$;

-- ── 3b) cancel_order → order_cancelled metnini şablonla hizala ───────────────
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order_title text;
  v_baker RECORD;
BEGIN
  SET LOCAL row_security = off;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND customer_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Sipariş bulunamadı');
  END IF;

  SELECT title INTO v_order_title FROM public.orders WHERE id = p_order_id;

  UPDATE public.orders SET status = 'cancelled', updated_at = NOW() WHERE id = p_order_id;

  UPDATE public.offers SET status = 'rejected', updated_at = NOW()
    WHERE order_id = p_order_id AND status IN ('pending', 'accepted');

  FOR v_baker IN
    SELECT DISTINCT o.baker_id FROM public.offers o
    WHERE o.order_id = p_order_id AND o.status = 'rejected'
      AND o.updated_at >= NOW() - INTERVAL '1 second'
  LOOP
    PERFORM app_notify(v_baker.baker_id, 'order_cancelled',
      '⌛ Sipariş İptal Edildi',
      '"' || COALESCE(v_order_title, 'Siparişiniz') || '" siparişi iptal edildi.',
      jsonb_build_object('orderId', p_order_id), 'baker');
  END LOOP;

  RETURN json_build_object('success', true, 'error', NULL);
END; $function$;
