-- 0019: nearby_orders RPC'sine latitude/longitude ekle
-- Pastacı sipariş kartlarında müşteri konumunu (adres + gel-al + reverse-geocode
-- başarısız) her zaman gösterebilmek için koordinatları döndür. Dönüş tipi
-- değiştiği için DROP + CREATE gerekiyor. Geri kalan mantık aynen korunur.

DROP FUNCTION public.nearby_orders(double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.nearby_orders(lat double precision, lng double precision, radius_km double precision)
 RETURNS TABLE(id uuid, customer_id uuid, title text, description text, photos jsonb, serving_size integer, delivery_type text, delivery_date date, delivery_time time without time zone, delivery_address text, is_urgent boolean, status text, distance_km numeric, created_at timestamp with time zone, customer_full_name text, customer_avatar_url text, customer_total_orders integer, customer_completed_orders integer, customer_member_days integer, latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    o.id, o.customer_id, o.title, o.description, o.photos,
    o.serving_size, o.delivery_type, o.delivery_date, o.delivery_time,
    o.delivery_address,
    COALESCE(o.is_urgent, false) AS is_urgent,
    o.status,
    round((earth_distance(ll_to_earth(lat, lng), ll_to_earth(o.latitude, o.longitude)) / 1000.0)::numeric, 2) AS distance_km,
    o.created_at,
    u.full_name AS customer_full_name,
    u.avatar_url AS customer_avatar_url,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id) AS customer_total_orders,
    (SELECT COUNT(*)::integer FROM public.orders WHERE customer_id = u.id AND status = 'completed') AS customer_completed_orders,
    EXTRACT(DAY FROM (NOW() - u.created_at))::integer AS customer_member_days,
    o.latitude, o.longitude
  FROM public.orders o
  LEFT JOIN public.users u ON u.id = o.customer_id
  WHERE
    o.status IN ('pending', 'offers_received')
    AND o.latitude IS NOT NULL
    AND o.longitude IS NOT NULL
    AND earth_distance(ll_to_earth(lat, lng), ll_to_earth(o.latitude, o.longitude)) <= radius_km * 1000
  ORDER BY o.created_at DESC;
$function$;
