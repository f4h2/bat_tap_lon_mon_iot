insert into shipments (
    shipment_code,
    item_type,
    min_temperature,
    max_temperature,
    min_humidity,
    max_humidity,
    status
) values (
    'SHIP-123',
    'Frozen food / vaccine cold-chain demo',
    -22.00,
    -18.00,
    40.00,
    80.00,
    'ACTIVE'
) on conflict (shipment_code) do nothing;

insert into verify_codes (
    verify_code,
    shipment_code,
    status,
    expires_at
) values
    ('SHIP-123-8K2P', 'SHIP-123', 'UNUSED', now() + interval '30 days'),
    ('SHIP-123-DEMO2', 'SHIP-123', 'UNUSED', now() + interval '30 days')
on conflict (verify_code) do nothing;
