-- 0020: "Yeni Sipariş Talebi" push'unun müşteri uygulamasına da düşmesini düzelt.
--
-- Sorun: 0017'deki place_order, baker push'unu HEM baker_push_token HEM legacy
-- push_token'a gönderiyordu. Dual-rol kullanıcıda legacy push_token, en son
-- kayıt olan app'in token'ıyla eziliyor (bkz. 0009 register_push_token) — bu da
-- genelde müşteri app. Sonuç: baker'a giden bildirim müşteri uygulamasında da
-- (kopya olarak) çıkıyordu.
--
-- Çözüm: role-hedefli push için SADECE baker_push_token kullan; o null'sa
-- (per-app token'ı olmayan eski build) ancak o zaman legacy push_token'a düş.
-- Geri kalan mantık 0017 ile aynı.
CREATE OR REPLACE FUNCTION public.place_order(
  p_title text,
  p_description text DEFAULT NULL::text,
  p_serving_size integer DEFAULT NULL::integer,
  p_delivery_type text DEFAULT 'delivery'::text,
  p_delivery_address text DEFAULT NULL::text,
  p_delivery_latitude double precision DEFAULT NULL::double precision,
  p_delivery_longitude double precision DEFAULT NULL::double precision,
  p_delivery_date date DEFAULT NULL::date,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_search_radius_km integer DEFAULT 20,
  p_delivery_time time without time zone DEFAULT NULL::time without time zone,
  p_is_urgent boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id uuid;
  v_customer_id uuid;
  v_body text;
  v_baker record;
  v_tok text;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RETURN json_build_object('error', 'Oturum acmaniz gerekiyor.');
  END IF;

  INSERT INTO public.orders (
    customer_id, title, description, serving_size,
    delivery_type, delivery_address, delivery_latitude, delivery_longitude,
    delivery_date, delivery_time, is_urgent,
    latitude, longitude, search_radius_km, status
  ) VALUES (
    v_customer_id, p_title, p_description, p_serving_size,
    p_delivery_type::public.delivery_type,
    p_delivery_address, p_delivery_latitude, p_delivery_longitude,
    p_delivery_date, p_delivery_time, p_is_urgent,
    p_latitude, p_longitude, p_search_radius_km, 'pending'
  )
  RETURNING id INTO v_order_id;

  -- Yakındaki pastacılara bildirim + push (best-effort; hata siparişi bozmasın)
  BEGIN
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
      v_body := concat_ws(' · ',
        p_title,
        CASE WHEN p_serving_size IS NOT NULL THEN p_serving_size || ' kişilik' END
      );

      FOR v_baker IN
        SELECT ps.user_id, u.baker_push_token, u.push_token
        FROM public.pastry_shops ps
        JOIN public.users u ON u.id = ps.user_id
        WHERE ps.is_active = true
          AND ps.latitude  IS NOT NULL
          AND ps.longitude IS NOT NULL
          AND ps.user_id <> v_customer_id
          AND earth_distance(
                ll_to_earth(p_latitude, p_longitude),
                ll_to_earth(ps.latitude, ps.longitude)
              ) <= p_search_radius_km * 1000
      LOOP
        INSERT INTO public.notifications (user_id, type, title, body, data, target_role)
        VALUES (v_baker.user_id, 'new_order', '📋 Yeni Sipariş Talebi', v_body,
                jsonb_build_object('orderId', v_order_id), 'baker');

        -- SADECE baker token'ına push; null'sa ancak o zaman legacy push_token.
        -- (Eskiden iki token'a birden gidip müşteri app'inde kopya çıkıyordu.)
        FOR v_tok IN
          SELECT DISTINCT t
          FROM unnest(array_remove(
                 ARRAY[COALESCE(v_baker.baker_push_token, v_baker.push_token)], NULL)) AS t
          WHERE t LIKE 'ExponentPushToken%'
        LOOP
          PERFORM net.http_post(
            url     := 'https://exp.host/--/api/v2/push/send',
            headers := jsonb_build_object('Content-Type','application/json'),
            body    := jsonb_build_object('to', v_tok, 'sound','default',
              'title','📋 Yeni Sipariş Talebi', 'body', v_body,
              'data', jsonb_build_object('type','new_order','orderId',v_order_id))
          );
        END LOOP;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- bildirim hatası siparişi etkilemesin
  END;

  RETURN json_build_object('order_id', v_order_id, 'error', NULL);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('order_id', NULL, 'error', SQLERRM);
END;
$function$;
