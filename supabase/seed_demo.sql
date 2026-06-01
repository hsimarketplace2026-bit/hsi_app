-- ============================================================
-- HSI Marketplace — Demo Seed Data
-- Run in: Supabase Dashboard → SQL Editor
-- Run AFTER schema.sql has been applied
-- Safe to re-run (cleans previous demo data first)
-- ============================================================

-- CLEANUP (removes previous demo data) -----------------------

DELETE FROM public.payments
  WHERE buyer_id IN (
    'bbbbbbbb-0001-0000-0000-000000000000',
    'bbbbbbbb-0002-0000-0000-000000000000',
    'bbbbbbbb-0003-0000-0000-000000000000'
  );

DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders
    WHERE buyer_id IN (
      'bbbbbbbb-0001-0000-0000-000000000000',
      'bbbbbbbb-0002-0000-0000-000000000000',
      'bbbbbbbb-0003-0000-0000-000000000000'
    )
  );

DELETE FROM public.orders
  WHERE buyer_id IN (
    'bbbbbbbb-0001-0000-0000-000000000000',
    'bbbbbbbb-0002-0000-0000-000000000000',
    'bbbbbbbb-0003-0000-0000-000000000000'
  );

DELETE FROM public.cart_items
  WHERE buyer_id IN (
    'bbbbbbbb-0001-0000-0000-000000000000',
    'bbbbbbbb-0002-0000-0000-000000000000',
    'bbbbbbbb-0003-0000-0000-000000000000'
  );

DELETE FROM public.products
  WHERE seller_id IN (
    'aaaaaaaa-0001-0000-0000-000000000000',
    'aaaaaaaa-0002-0000-0000-000000000000'
  );

DELETE FROM public.announcements
  WHERE title IN (
    'Grand Opening Sale!',
    'New Season: Summer Harvest',
    'Free Delivery This Weekend'
  );

DELETE FROM auth.users
  WHERE id IN (
    'aaaaaaaa-0001-0000-0000-000000000000',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'bbbbbbbb-0001-0000-0000-000000000000',
    'bbbbbbbb-0002-0000-0000-000000000000',
    'bbbbbbbb-0003-0000-0000-000000000000'
  );

-- DEMO USERS (auth.users → trigger auto-creates profiles) -----
-- Password for all demo accounts: Demo1234!

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES
  -- Seller 1: active
  (
    'aaaaaaaa-0001-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'greenleaf.farm@demo.com',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"full_name":"Maria Santos","role":"seller"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now() - interval '30 days', now(),
    '', '', '', ''
  ),
  -- Seller 2: pending approval
  (
    'aaaaaaaa-0002-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'hydroharvest@demo.com',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"full_name":"Ahmad Yusof","role":"seller"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now() - interval '5 days', now(),
    '', '', '', ''
  ),
  -- Buyer 1
  (
    'bbbbbbbb-0001-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'john.lim@demo.com',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"full_name":"John Lim","role":"buyer"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now() - interval '20 days', now(),
    '', '', '', ''
  ),
  -- Buyer 2
  (
    'bbbbbbbb-0002-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sarah.chen@demo.com',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"full_name":"Sarah Chen","role":"buyer"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now() - interval '15 days', now(),
    '', '', '', ''
  ),
  -- Buyer 3
  (
    'bbbbbbbb-0003-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'ravi.kumar@demo.com',
    crypt('Demo1234!', gen_salt('bf')),
    now(),
    '{"full_name":"Ravi Kumar","role":"buyer"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now() - interval '10 days', now(),
    '', '', '', ''
  );

-- UPDATE PROFILES with extra details --------------------------
-- (trigger already created the profile rows above)

UPDATE public.profiles SET
  phone        = '+60 12-345 6789',
  farm_name    = 'Green Leaf Hydroponics',
  farm_location = 'Shah Alam, Selangor',
  status       = 'active'
WHERE id = 'aaaaaaaa-0001-0000-0000-000000000000';

UPDATE public.profiles SET
  phone        = '+60 11-222 3344',
  farm_name    = 'HydroHarvest Farm',
  farm_location = 'Subang Jaya, Selangor',
  status       = 'pending'
WHERE id = 'aaaaaaaa-0002-0000-0000-000000000000';

UPDATE public.profiles SET phone = '+60 16-555 1234'
WHERE id = 'bbbbbbbb-0001-0000-0000-000000000000';

UPDATE public.profiles SET phone = '+60 17-888 5566'
WHERE id = 'bbbbbbbb-0002-0000-0000-000000000000';

UPDATE public.profiles SET phone = '+60 19-777 9900'
WHERE id = 'bbbbbbbb-0003-0000-0000-000000000000';

-- PRODUCTS (Seller 1 — Green Leaf Hydroponics) ----------------

INSERT INTO public.products
  (id, seller_id, name, category, description, price, unit, quantity, harvest_date, image_url, status)
VALUES
  (
    'p0000001-0000-0000-0000-000000000001',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Butterhead Lettuce',
    'Vegetables',
    'Tender, sweet butterhead lettuce grown in our climate-controlled NFT system. No pesticides. Harvested fresh daily.',
    4.50, 'head', 150,
    current_date,
    'https://placehold.co/600x400/16a34a/ffffff?text=Butterhead+Lettuce',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000002',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Baby Spinach',
    'Vegetables',
    'Crispy baby spinach leaves, rich in iron and vitamins. Perfect for salads and smoothies. Grown in DWC system.',
    6.00, 'kg', 80,
    current_date,
    'https://placehold.co/600x400/166534/ffffff?text=Baby+Spinach',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000003',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Cherry Tomatoes',
    'Fruits',
    'Sweet and juicy cherry tomatoes in a mix of red and yellow. Grown on vertical towers with drip irrigation.',
    8.00, 'kg', 60,
    current_date + interval '1 day',
    'https://placehold.co/600x400/dc2626/ffffff?text=Cherry+Tomatoes',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000004',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Cucumber',
    'Vegetables',
    'Crispy, thin-skinned cucumbers. Great for juicing and salads. Our most popular product — pre-order recommended.',
    3.50, 'kg', 200,
    current_date,
    'https://placehold.co/600x400/15803d/ffffff?text=Cucumber',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000005',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Thai Basil',
    'Herbs',
    'Aromatic Thai basil with a strong anise-like flavour. Ideal for Thai and Vietnamese cooking. Sold per bunch.',
    5.00, 'bunch', 50,
    current_date,
    'https://placehold.co/600x400/14532d/ffffff?text=Thai+Basil',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000006',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Mint Leaves',
    'Herbs',
    'Fresh spearmint grown hydroponically — more fragrant than soil-grown. Great for teas, desserts, and cocktails.',
    4.00, 'bunch', 40,
    current_date,
    'https://placehold.co/600x400/16a34a/ffffff?text=Mint+Leaves',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000007',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Microgreens Mix',
    'Other',
    'A curated mix of radish, sunflower, and pea microgreens. Packed with nutrients — up to 40x more than mature plants.',
    12.00, 'pack', 30,
    current_date + interval '2 days',
    'https://placehold.co/600x400/4ade80/14532d?text=Microgreens+Mix',
    'active'
  ),
  (
    'p0000001-0000-0000-0000-000000000008',
    'aaaaaaaa-0001-0000-0000-000000000000',
    'Water Spinach (Kangkung)',
    'Vegetables',
    'Tender kangkung grown in our water channel system. Ready to cook — no dirt, no washing hassle.',
    2.50, 'bundle', 100,
    current_date,
    'https://placehold.co/600x400/166534/ffffff?text=Kangkung',
    'active'
  );

-- PRODUCTS (Seller 2 — HydroHarvest Farm, pending) -----------

INSERT INTO public.products
  (id, seller_id, name, category, description, price, unit, quantity, harvest_date, image_url, status)
VALUES
  (
    'p0000002-0000-0000-0000-000000000001',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'Strawberries',
    'Fruits',
    'Premium hydroponic strawberries — sweet, plump, and pesticide-free. Limited weekly harvest, order early!',
    18.00, 'kg', 25,
    current_date + interval '3 days',
    'https://placehold.co/600x400/be123c/ffffff?text=Strawberries',
    'active'
  ),
  (
    'p0000002-0000-0000-0000-000000000002',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'Edible Flowers Mix',
    'Other',
    'A beautiful mix of nasturtium, viola, and borage flowers. Perfect for plating and dessert garnishes.',
    15.00, 'box', 15,
    current_date + interval '1 day',
    'https://placehold.co/600x400/9333ea/ffffff?text=Edible+Flowers',
    'active'
  ),
  (
    'p0000002-0000-0000-0000-000000000003',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'Cilantro',
    'Herbs',
    'Fresh, flavourful cilantro grown without soil. Great for curries, salsas, and garnishes.',
    3.50, 'bunch', 60,
    current_date,
    'https://placehold.co/600x400/15803d/ffffff?text=Cilantro',
    'active'
  ),
  (
    'p0000002-0000-0000-0000-000000000004',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'Lemongrass',
    'Herbs',
    'Thick, fragrant lemongrass stalks. Essential for Malaysian and Thai dishes. Sold per bundle of 5 stalks.',
    4.00, 'bundle', 45,
    current_date,
    'https://placehold.co/600x400/ca8a04/ffffff?text=Lemongrass',
    'active'
  ),
  (
    'p0000002-0000-0000-0000-000000000005',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'Baby Bok Choy',
    'Vegetables',
    'Tender baby bok choy harvested at peak sweetness. Perfect for stir-fry, steamboat, and braising.',
    5.50, 'kg', 70,
    current_date,
    'https://placehold.co/600x400/166534/ffffff?text=Baby+Bok+Choy',
    'active'
  ),
  (
    'p0000002-0000-0000-0000-000000000006',
    'aaaaaaaa-0002-0000-0000-000000000000',
    'Red Oakleaf Lettuce',
    'Vegetables',
    'Beautifully coloured red oakleaf lettuce with a mild, slightly nutty flavour. Eye-catching for salad platters.',
    5.00, 'head', 80,
    current_date + interval '1 day',
    'https://placehold.co/600x400/991b1b/ffffff?text=Red+Oakleaf+Lettuce',
    'active'
  );

-- ANNOUNCEMENTS -----------------------------------------------

INSERT INTO public.announcements
  (id, title, body, is_featured, is_active, created_at)
VALUES
  (
    'aa000001-0000-0000-0000-000000000001',
    'Grand Opening Sale!',
    'Celebrate the launch of HSI Marketplace with 20% off your first order! Use code FRESH20 at checkout. Valid for the entire month of May 2026. Fresh produce delivered straight from our community hydroponic farms to your door.',
    true, true,
    now() - interval '2 days'
  ),
  (
    'aa000001-0000-0000-0000-000000000002',
    'New Season: Summer Harvest',
    'Our farmers have started their summer planting cycle. Expect new arrivals of cherry tomatoes, strawberries, and fresh herbs every week. Subscribe to stay updated on new listings from your favourite farms.',
    true, true,
    now() - interval '7 days'
  ),
  (
    'aa000001-0000-0000-0000-000000000003',
    'Free Delivery This Weekend',
    'Enjoy free delivery on all orders above RM 50 this Saturday and Sunday. Support local hydroponic farmers and get the freshest produce without leaving your home.',
    true, true,
    now() - interval '1 day'
  );

-- ORDERS + ORDER ITEMS + PAYMENTS -----------------------------

-- Order 1: John Lim bought from Green Leaf — COMPLETED
INSERT INTO public.orders (id, buyer_id, seller_id, status, total_amount, delivery_notes, created_at)
VALUES (
  'order001-0000-0000-0000-000000000001',
  'bbbbbbbb-0001-0000-0000-000000000000',
  'aaaaaaaa-0001-0000-0000-000000000000',
  'completed',
  18.50,
  'Please leave at guard house if no one home.',
  now() - interval '14 days'
);

INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
VALUES
  ('order001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', 3,  4.50),
  ('order001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000006', 1,  4.00);

INSERT INTO public.payments (order_id, buyer_id, method, proof_url, status, admin_notes)
VALUES (
  'order001-0000-0000-0000-000000000001',
  'bbbbbbbb-0001-0000-0000-000000000000',
  'Online Transfer',
  null,
  'verified',
  'Payment confirmed. Thank you!'
);

-- Order 2: Sarah Chen bought from Green Leaf — PAYMENT UPLOADED (pending verify)
INSERT INTO public.orders (id, buyer_id, seller_id, status, total_amount, delivery_notes, created_at)
VALUES (
  'order002-0000-0000-0000-000000000001',
  'bbbbbbbb-0002-0000-0000-000000000000',
  'aaaaaaaa-0001-0000-0000-000000000000',
  'payment_uploaded',
  36.00,
  'Ring doorbell twice.',
  now() - interval '2 days'
);

INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
VALUES
  ('order002-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000003', 3, 8.00),
  ('order002-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000007', 1, 12.00);

INSERT INTO public.payments (order_id, buyer_id, method, proof_url, status)
VALUES (
  'order002-0000-0000-0000-000000000001',
  'bbbbbbbb-0002-0000-0000-000000000000',
  'DuitNow QR',
  null,
  'pending'
);

-- Order 3: Ravi Kumar bought from Green Leaf — PENDING
INSERT INTO public.orders (id, buyer_id, seller_id, status, total_amount, delivery_notes, created_at)
VALUES (
  'order003-0000-0000-0000-000000000001',
  'bbbbbbbb-0003-0000-0000-000000000000',
  'aaaaaaaa-0001-0000-0000-000000000000',
  'pending',
  22.50,
  null,
  now() - interval '1 hour'
);

INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
VALUES
  ('order003-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000002', 2, 6.00),
  ('order003-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000004', 3, 3.50);

-- Order 4: John Lim bought from Green Leaf — PROCESSING
INSERT INTO public.orders (id, buyer_id, seller_id, status, total_amount, delivery_notes, created_at)
VALUES (
  'order004-0000-0000-0000-000000000001',
  'bbbbbbbb-0001-0000-0000-000000000000',
  'aaaaaaaa-0001-0000-0000-000000000000',
  'processing',
  41.00,
  'Call before delivery.',
  now() - interval '5 days'
);

INSERT INTO public.order_items (order_id, product_id, quantity, unit_price)
VALUES
  ('order004-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000005', 3, 5.00),
  ('order004-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000007', 2, 12.00),
  ('order004-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000008', 1, 2.50);

INSERT INTO public.payments (order_id, buyer_id, method, proof_url, status)
VALUES (
  'order004-0000-0000-0000-000000000001',
  'bbbbbbbb-0001-0000-0000-000000000000',
  'Online Transfer',
  null,
  'verified'
);

-- CART ITEMS (Ravi has items waiting in cart) -----------------

INSERT INTO public.cart_items (buyer_id, product_id, quantity)
VALUES
  ('bbbbbbbb-0003-0000-0000-000000000000', 'p0000001-0000-0000-0000-000000000001', 2),
  ('bbbbbbbb-0003-0000-0000-000000000000', 'p0000001-0000-0000-0000-000000000005', 1),
  ('bbbbbbbb-0003-0000-0000-000000000000', 'p0000001-0000-0000-0000-000000000007', 1);

-- Done! -------------------------------------------------------
SELECT 'Demo data loaded successfully!' as result;
SELECT 'Sellers: ' || count(*)::text FROM public.profiles WHERE role = 'seller';
SELECT 'Buyers: '  || count(*)::text FROM public.profiles WHERE role = 'buyer';
SELECT 'Products: '|| count(*)::text FROM public.products;
SELECT 'Orders: '  || count(*)::text FROM public.orders;
