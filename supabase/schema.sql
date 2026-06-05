-- ============================================================
--  Pastacım — Supabase Baseline Şema
--  Çalıştırma: Supabase Dashboard > SQL Editor > New Query
--
--  Bu dosya 1 Haziran 2026 baseline'ını yansıtır.
--
--  ⚠️ Sıfırdan kurulum sırası:
--    1. Bu dosyayı (schema.sql) çalıştırın
--    2. supabase/migrations/0002_remove_wallet_fee.sql
--    3. supabase/migrations/0003_delete_account_rpc.sql
--    4. supabase/migrations/0004_consolidated_jun3_jun5.sql
--       (3-5 Haziran arası uygulanan 15 değişikliği toplar:
--        feedbacks/wallet_top_up_requests tabloları, user-avatars
--        storage bucket, RLS policies, yeni/değişen RPC'ler,
--        pg_cron schedule, reviews.is_anonymous, pastry_shops UNIQUE)
--
--  Sonraki değişiklikler için yeni `0005_*.sql` migration dosyası
--  yazılmalı; Supabase Dashboard veya MCP üzerinden direkt
--  uygulamak yerine repo'ya commit edilmeli.
-- ============================================================

-- ─── Gerekli Extension'lar ────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "cube";
create extension if not exists "earthdistance";

-- ─── ENUM Tipleri ─────────────────────────────────────────────
-- Aktif kullanımdaki enum'lar
create type order_status            as enum ('pending', 'offers_received', 'accepted', 'in_progress', 'ready', 'completed', 'cancelled');
create type offer_status            as enum ('pending', 'accepted', 'rejected', 'withdrawn');
create type delivery_type           as enum ('delivery', 'pickup');
create type wallet_transaction_type as enum ('offer_fee', 'top_up', 'refund');

-- LEGACY: tek-rol döneminden kalan, henüz drop edilmemiş enum'lar.
-- Yeni kod `is_customer` / `is_baker` flag'lerini kullanır.
create type user_role  as enum ('customer', 'baker');
create type token_type as enum ('welcome_bonus', 'order_placed', 'refund', 'offer_placed', 'purchase');

-- ============================================================
--  1. USERS — Kullanıcı profilleri (auth.users'ı genişletir)
-- ============================================================
create table public.users (
  id              uuid          primary key references auth.users(id) on delete cascade,
  email           text          unique,
  phone           text,
  full_name       text,
  avatar_url      text,
  -- Aktif rol flag'leri (her ikisi true olabilir)
  is_customer     boolean       not null default true,
  is_baker        boolean       not null default false,
  -- Pastacı TL cüzdanı (teklif ücretleri buradan düşer)
  wallet_balance  numeric(10,2) not null default 0.00 check (wallet_balance >= 0),
  -- Push notification token
  push_token      text,
  -- LEGACY: tek-rol dönemine ait; yeni kod okumaz/yazmaz
  role            user_role     not null default 'customer',
  token_balance   integer       not null default 0 check (token_balance >= 0),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

comment on table public.users is 'Kullanıcı profilleri; her hesap müşteri ve/veya pastacı olabilir.';
comment on column public.users.role          is 'LEGACY — yerini is_customer/is_baker aldı.';
comment on column public.users.token_balance is 'LEGACY — yerini wallet_balance aldı.';

-- ─── updated_at otomatik güncelleme ──────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

-- ─── Yeni kullanıcı kaydında profil oluştur ──────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, is_customer, is_baker, wallet_balance)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    true,
    false,
    0.00
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  2. PASTRY_SHOPS — Pastacı dükkanları
-- ============================================================
create table public.pastry_shops (
  id               uuid          primary key default uuid_generate_v4(),
  user_id          uuid          not null references public.users(id) on delete cascade,
  name             text          not null,
  description      text,
  cover_image_url  text,
  images           jsonb         not null default '[]'::jsonb,
  address          text,
  latitude         double precision,
  longitude        double precision,
  working_hours    jsonb,
  -- Örnek: {"mon": {"open": "09:00", "close": "18:00"}, ...}
  is_active        boolean       not null default true,
  rating           numeric(3,2)  not null default 0.00 check (rating >= 0 and rating <= 5),
  review_count     integer       not null default 0,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

comment on table public.pastry_shops is 'Pastacı dükkan profilleri ve konum bilgileri.';

create trigger pastry_shops_updated_at
  before update on public.pastry_shops
  for each row execute function public.handle_updated_at();

create index idx_pastry_shops_user_id  on public.pastry_shops(user_id);
create index idx_pastry_shops_location on public.pastry_shops(latitude, longitude) where is_active = true;

-- ============================================================
--  3. ORDERS — Müşteri sipariş talepleri
-- ============================================================
create table public.orders (
  id                  uuid          primary key default uuid_generate_v4(),
  customer_id         uuid          not null references public.users(id) on delete cascade,
  title               text          not null,
  description         text,
  photos              jsonb         not null default '[]'::jsonb,
  serving_size        integer       check (serving_size > 0),
  delivery_type       delivery_type not null default 'delivery',
  delivery_address    text,
  delivery_latitude   double precision,
  delivery_longitude  double precision,
  delivery_date       date,
  delivery_time       time,
  -- Müşteri iletişim bilgileri (yalnızca teklif kabul sonrası açılır)
  customer_email      text,
  customer_phone      text,
  status              order_status  not null default 'pending',
  selected_offer_id   uuid,         -- offers tablosuna FK, döngüsel; aşağıda eklenir
  latitude            double precision,
  longitude           double precision,
  search_radius_km    integer       not null default 20 check (search_radius_km between 1 and 50),
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

comment on table public.orders is 'Müşteri sipariş talepleri.';

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.handle_updated_at();

create index idx_orders_customer_id on public.orders(customer_id);
create index idx_orders_status      on public.orders(status);
create index idx_orders_location    on public.orders(latitude, longitude) where status = 'pending';

-- ============================================================
--  4. OFFERS — Pastacıların teklifleri
-- ============================================================
create table public.offers (
  id              uuid          primary key default uuid_generate_v4(),
  order_id        uuid          not null references public.orders(id) on delete cascade,
  baker_id        uuid          not null references public.users(id) on delete cascade,
  shop_id         uuid          not null references public.pastry_shops(id) on delete cascade,
  price           numeric(10,2) not null check (price > 0),
  message         text,
  estimated_days  integer       check (estimated_days > 0),
  status          offer_status  not null default 'pending',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  unique (order_id, baker_id)
);

comment on table public.offers is 'Pastacıların sipariş taleplerine verdikleri teklifler.';

create trigger offers_updated_at
  before update on public.offers
  for each row execute function public.handle_updated_at();

create index idx_offers_order_id on public.offers(order_id);
create index idx_offers_baker_id on public.offers(baker_id);
create index idx_offers_status   on public.offers(status);

-- Döngüsel FK: orders.selected_offer_id → offers.id
alter table public.orders
  add constraint fk_selected_offer
  foreign key (selected_offer_id) references public.offers(id) on delete set null;

-- ============================================================
--  5. MESSAGES — Sipariş bazlı mesajlaşma
-- ============================================================
create table public.messages (
  id           uuid        primary key default uuid_generate_v4(),
  order_id     uuid        not null references public.orders(id) on delete cascade,
  sender_id    uuid        not null references public.users(id) on delete cascade,
  receiver_id  uuid        not null references public.users(id) on delete cascade,
  content      text        check (content is null or length(content) > 0),
  image_url    text,
  is_read      boolean     not null default false,
  created_at   timestamptz not null default now(),
  constraint messages_content_or_image check (content is not null or image_url is not null)
);

comment on table public.messages is 'Müşteri-pastacı sipariş mesajlaşması.';

create index idx_messages_order_id    on public.messages(order_id);
create index idx_messages_receiver_id on public.messages(receiver_id) where is_read = false;
create index idx_messages_created_at  on public.messages(created_at desc);

-- ============================================================
--  6. NOTIFICATIONS — Uygulama içi bildirim akışı
-- ============================================================
create table public.notifications (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text,
  data        jsonb       not null default '{}'::jsonb,
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is 'Kullanıcı bildirim akışı (push + in-app).';

create index idx_notifications_user_id    on public.notifications(user_id, created_at desc);
create index idx_notifications_unread     on public.notifications(user_id) where is_read = false;

-- ============================================================
--  7. REVIEWS — Tamamlanan sipariş yorumları
-- ============================================================
create table public.reviews (
  id           uuid        primary key default uuid_generate_v4(),
  order_id     uuid        not null unique references public.orders(id) on delete cascade,
  customer_id  uuid        not null references public.users(id) on delete cascade,
  baker_id     uuid        not null references public.users(id) on delete cascade,
  shop_id      uuid        not null references public.pastry_shops(id) on delete cascade,
  rating       smallint    not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

comment on table public.reviews is 'Tamamlanan siparişlere verilen yorumlar.';

create index idx_reviews_shop_id  on public.reviews(shop_id);
create index idx_reviews_baker_id on public.reviews(baker_id);

-- Yorum eklenince dükkan rating'ini güncelle
create or replace function public.update_shop_rating()
returns trigger language plpgsql as $$
declare
  new_rating numeric(3,2);
  new_count  integer;
begin
  select round(avg(rating)::numeric, 2), count(*)
    into new_rating, new_count
    from public.reviews
    where shop_id = coalesce(new.shop_id, old.shop_id);

  update public.pastry_shops
    set rating = coalesce(new_rating, 0), review_count = new_count
    where id = coalesce(new.shop_id, old.shop_id);

  return coalesce(new, old);
end;
$$;

create trigger reviews_update_shop_rating
  after insert or update or delete on public.reviews
  for each row execute function public.update_shop_rating();

-- ============================================================
--  8. WALLET_TRANSACTIONS — Pastacı cüzdan hareketleri
-- ============================================================
create table public.wallet_transactions (
  id           uuid                    primary key default uuid_generate_v4(),
  user_id      uuid                    not null references public.users(id) on delete cascade,
  amount       numeric(10,2)           not null,
  type         wallet_transaction_type not null,
  description  text,
  order_id     uuid                    references public.orders(id) on delete set null,
  created_at   timestamptz             not null default now()
);

comment on table public.wallet_transactions is 'Pastacı cüzdan hareketleri (offer_fee / top_up / refund). Yalnızca SECURITY DEFINER RPC''ler insert edebilir.';

create index idx_wallet_tx_user_id on public.wallet_transactions(user_id, created_at desc);

-- ============================================================
--  9. TOKEN_TRANSACTIONS — LEGACY (kullanılmıyor, drop edilmedi)
-- ============================================================
create table public.token_transactions (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references public.users(id) on delete cascade,
  amount       integer     not null,
  type         token_type  not null,
  description  text,
  order_id     uuid        references public.orders(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.token_transactions is 'LEGACY — jeton dönemi kayıtları. Yeni kod wallet_transactions kullanır.';

create index idx_token_tx_user_id on public.token_transactions(user_id);

-- ============================================================
--  KONUM RPC — Yakındaki pastacılar
-- ============================================================
create or replace function public.nearby_bakers(
  lat        double precision,
  lng        double precision,
  radius_km  double precision default 20
)
returns table (
  id              uuid,
  user_id         uuid,
  name            text,
  description     text,
  cover_image_url text,
  latitude        double precision,
  longitude       double precision,
  rating          numeric,
  review_count    integer,
  distance_km     double precision
) language sql stable as $$
  select
    ps.id, ps.user_id, ps.name, ps.description, ps.cover_image_url,
    ps.latitude, ps.longitude, ps.rating, ps.review_count,
    round(
      (earth_distance(ll_to_earth(lat, lng), ll_to_earth(ps.latitude, ps.longitude)) / 1000.0)::numeric,
      2
    ) as distance_km
  from public.pastry_shops ps
  where ps.is_active = true
    and ps.latitude  is not null
    and ps.longitude is not null
    and earth_distance(ll_to_earth(lat, lng), ll_to_earth(ps.latitude, ps.longitude)) <= radius_km * 1000
  order by distance_km asc;
$$;

-- ============================================================
--  KONUM RPC — Yakındaki sipariş talepleri (pastacı görür)
-- ============================================================
create or replace function public.nearby_orders(
  lat        double precision,
  lng        double precision,
  radius_km  double precision default 20
)
returns table (
  id            uuid,
  customer_id   uuid,
  title         text,
  description   text,
  photos        jsonb,
  serving_size  integer,
  delivery_type delivery_type,
  delivery_date date,
  status        order_status,
  distance_km   double precision,
  created_at    timestamptz
) language sql stable as $$
  select
    o.id, o.customer_id, o.title, o.description, o.photos,
    o.serving_size, o.delivery_type, o.delivery_date, o.status,
    round(
      (earth_distance(ll_to_earth(lat, lng), ll_to_earth(o.latitude, o.longitude)) / 1000.0)::numeric,
      2
    ) as distance_km,
    o.created_at
  from public.orders o
  where o.status = 'pending'
    and o.latitude  is not null
    and o.longitude is not null
    and earth_distance(ll_to_earth(lat, lng), ll_to_earth(o.latitude, o.longitude)) <= radius_km * 1000
  order by o.created_at desc;
$$;

-- ============================================================
--  CÜZDAN & TEKLİF RPC'LERİ
-- ============================================================

-- Pastacı teklif verir; cüzdandan kişi_sayısı × ₺5 düşer
create or replace function public.submit_offer(
  p_order_id       uuid,
  p_price          numeric,
  p_message        text,
  p_estimated_days integer
)
returns jsonb language plpgsql security definer as $$
declare
  v_baker_id uuid := auth.uid();
  v_shop_id  uuid;
  v_serving  integer;
  v_fee      numeric;
  v_offer_id uuid;
begin
  select id into v_shop_id
    from public.pastry_shops
    where user_id = v_baker_id and is_active = true
    limit 1;
  if not found then
    return jsonb_build_object('error', 'dukkan_bulunamadi');
  end if;

  select serving_size into v_serving from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('error', 'siparis_bulunamadi');
  end if;

  v_fee := coalesce(v_serving, 1) * 5.0;

  if (select wallet_balance from public.users where id = v_baker_id) < v_fee then
    return jsonb_build_object('error', 'yetersiz_bakiye');
  end if;

  insert into public.offers (order_id, baker_id, shop_id, price, message, estimated_days)
    values (p_order_id, v_baker_id, v_shop_id, p_price, p_message, p_estimated_days)
    returning id into v_offer_id;

  update public.users set wallet_balance = wallet_balance - v_fee where id = v_baker_id;

  insert into public.wallet_transactions (user_id, amount, type, description, order_id)
    values (v_baker_id, -v_fee, 'offer_fee', 'Teklif ücreti', p_order_id);

  update public.orders set status = 'offers_received' where id = p_order_id and status = 'pending';

  return jsonb_build_object('offer_id', v_offer_id);
end;
$$;

-- Cüzdana TL yükle (ilerleyen sürümde Stripe webhook'una bağlanacak)
create or replace function public.add_wallet_balance(p_amount numeric)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
begin
  if p_amount <= 0 then
    return jsonb_build_object('error', 'gecersiz_miktar');
  end if;

  update public.users set wallet_balance = wallet_balance + p_amount where id = v_user_id;

  insert into public.wallet_transactions (user_id, amount, type, description)
    values (v_user_id, p_amount, 'top_up', 'Cüzdan yükleme');

  return jsonb_build_object('success', true);
end;
$$;

-- Dükkan oluştur; is_baker = true yap
create or replace function public.create_shop(
  p_name        text,
  p_description text,
  p_address     text,
  p_latitude    double precision,
  p_longitude   double precision
)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
begin
  insert into public.pastry_shops (user_id, name, description, address, latitude, longitude)
    values (v_user_id, p_name, p_description, p_address, p_latitude, p_longitude)
    returning id into v_shop_id;

  update public.users set is_baker = true where id = v_user_id;

  return jsonb_build_object('shop_id', v_shop_id);
end;
$$;

-- ============================================================
--  PRODUCTION'DA TANIMLI, GÖVDESİ BURADA OLMAYAN RPC'LER
--  ────────────────────────────────────────────────────────
--  Aşağıdaki RPC'ler Supabase Dashboard üzerinden tanımlandı
--  ve hâlâ tanımları orada tutuluyor. types/database.types.ts
--  içinde imzaları görülebilir. Yeni bir Supabase projesine
--  bu şemayı uygularken `supabase db dump --schema-only` ile
--  bunların güncel gövdesini çıkarmak gerekir:
--
--    - public.place_order(p_title, p_description, p_serving_size,
--        p_delivery_type, p_delivery_address, p_delivery_latitude,
--        p_delivery_longitude, p_delivery_date, p_latitude,
--        p_longitude, p_search_radius_km)
--    - public.accept_offer(p_offer_id)
--    - public.reject_offer(p_offer_id)
--    - public.withdraw_offer(p_offer_id)
--    - public.cancel_order(p_order_id)
--    - public.set_order_status(p_order_id, p_status)
--    - public.get_conversations()
--    - public.create_notification(p_user_id, p_type, p_title,
--        p_body, p_data)
-- ============================================================

-- ============================================================
--  ROW LEVEL SECURITY (RLS)
-- ============================================================

-- ─── users ────────────────────────────────────────────────────
alter table public.users enable row level security;

create policy "users: kendi profilini okur"
  on public.users for select using (auth.uid() = id);

create policy "users: kendi profilini günceller"
  on public.users for update using (auth.uid() = id);

create policy "users: herkese açık temel bilgiler"
  on public.users for select using (true);

-- ─── pastry_shops ─────────────────────────────────────────────
alter table public.pastry_shops enable row level security;

create policy "shops: aktif dükkanları herkes görür"
  on public.pastry_shops for select using (is_active = true);

create policy "shops: pastacı kendi dükkanını yönetir"
  on public.pastry_shops for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── orders ───────────────────────────────────────────────────
alter table public.orders enable row level security;

create policy "orders: müşteri kendi siparişini görür"
  on public.orders for select using (auth.uid() = customer_id);

create policy "orders: müşteri sipariş oluşturur"
  on public.orders for insert with check (auth.uid() = customer_id);

create policy "orders: müşteri kendi siparişini günceller"
  on public.orders for update using (auth.uid() = customer_id);

create policy "orders: müşteri biten siparişi siler"
  on public.orders for delete
  using (auth.uid() = customer_id and status in ('cancelled', 'completed'));

create policy "orders: pastacılar bekleyen siparişleri görür"
  on public.orders for select using (status = 'pending');

-- ─── offers ───────────────────────────────────────────────────
alter table public.offers enable row level security;

create policy "offers: sahip ve baker görür"
  on public.offers for select
  using (
    auth.uid() = baker_id
    or auth.uid() = (select customer_id from public.orders where id = order_id)
  );

create policy "offers: baker teklif verir"
  on public.offers for insert
  with check (
    baker_id = auth.uid()
    and exists (select 1 from public.users where id = auth.uid() and is_baker = true)
  );

create policy "offers: baker kendi teklifini günceller"
  on public.offers for update using (auth.uid() = baker_id);

-- ─── messages ─────────────────────────────────────────────────
alter table public.messages enable row level security;

create policy "messages: katılımcılar görür"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "messages: kullanıcı mesaj gönderir"
  on public.messages for insert with check (auth.uid() = sender_id);

create policy "messages: alıcı okundu işaretler"
  on public.messages for update using (auth.uid() = receiver_id);

-- ─── notifications ────────────────────────────────────────────
alter table public.notifications enable row level security;

create policy "notifications: kullanıcı kendi bildirimlerini görür"
  on public.notifications for select using (auth.uid() = user_id);

create policy "notifications: kullanıcı kendi bildirimini günceller"
  on public.notifications for update using (auth.uid() = user_id);

create policy "notifications: kullanıcı kendi bildirimini siler"
  on public.notifications for delete using (auth.uid() = user_id);

-- ─── reviews ──────────────────────────────────────────────────
alter table public.reviews enable row level security;

create policy "reviews: herkese açık"
  on public.reviews for select using (true);

create policy "reviews: müşteri yorum yapar"
  on public.reviews for insert with check (auth.uid() = customer_id);

-- ─── wallet_transactions ──────────────────────────────────────
alter table public.wallet_transactions enable row level security;

create policy "wallet_tx: kullanıcı kendi hareketlerini görür"
  on public.wallet_transactions for select using (user_id = auth.uid());

-- Yalnızca SECURITY DEFINER RPC'ler insert edebilir
create policy "wallet_tx: doğrudan insert yasak"
  on public.wallet_transactions for insert with check (false);

-- ─── token_transactions (LEGACY) ──────────────────────────────
alter table public.token_transactions enable row level security;

create policy "token_tx: kullanıcı kendi hareketlerini görür"
  on public.token_transactions for select using (auth.uid() = user_id);

create policy "token_tx: doğrudan insert yasak"
  on public.token_transactions for insert with check (false);

-- ============================================================
--  STORAGE BUCKETS — Dashboard veya aşağıdaki SQL ile oluştur
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES
--   ('message-images', 'message-images', true, 10485760,
--    ARRAY['image/jpeg','image/png','image/webp','image/heic']),
--   ('order-photos',   'order-photos',   true, 10485760,
--    ARRAY['image/jpeg','image/png','image/webp','image/heic']),
--   ('shop-images',    'shop-images',    true, 10485760,
--    ARRAY['image/jpeg','image/png','image/webp','image/heic'])
-- ON CONFLICT (id) DO NOTHING;

-- ============================================================
--  TAMAMLANDI — Baseline Şema Özeti
--  ────────────────────────────────────────────────────────
--  Aktif tablolar (9):
--    users, pastry_shops, orders, offers,
--    messages, notifications, reviews, wallet_transactions,
--    feedbacks (+ storage bucket: feedbacks)
--  Not: feedbacks tablosu ve storage bucket Management API ile
--       oluşturulmuştur (2026-06-01).
--  Legacy tablo (1):
--    token_transactions
--  Bu dosyadaki RPC gövdeleri:
--    nearby_bakers, nearby_orders, submit_offer,
--    add_wallet_balance, create_shop
--  Yalnızca Dashboard'da tanımlı RPC'ler:
--    place_order, accept_offer, reject_offer, withdraw_offer,
--    cancel_order, set_order_status, get_conversations,
--    create_notification
--  Trigger'lar:
--    users_updated_at, pastry_shops_updated_at,
--    orders_updated_at, offers_updated_at,
--    reviews_update_shop_rating, on_auth_user_created
--  RLS: Tüm tablolarda aktif
-- ============================================================
