INSERT INTO users (id, name, legacy_code) VALUES
  (1, 'Ada', 'L1'),
  (2, 'Linus', 'L2');
SELECT setval(pg_get_serial_sequence('users', 'id'), 2);

INSERT INTO orders (id, user_id, total_cents) VALUES
  (1, 1, 1000),
  (2, 2, 2500);
SELECT setval(pg_get_serial_sequence('orders', 'id'), 2);
