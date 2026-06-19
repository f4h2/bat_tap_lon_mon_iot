create table shipments (
    shipment_code varchar(64) primary key,
    item_type varchar(255) not null,
    min_temperature numeric(8,2),
    max_temperature numeric(8,2),
    min_humidity numeric(8,2),
    max_humidity numeric(8,2),
    status varchar(32) not null default 'ACTIVE',
    created_at timestamptz not null default now()
);

create table verify_codes (
    verify_code varchar(128) primary key,
    shipment_code varchar(64) not null references shipments(shipment_code),
    status varchar(32) not null default 'UNUSED',
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    used_at timestamptz,
    used_by_device_id varchar(128)
);

create table devices (
    device_id varchar(128) primary key,
    shipment_code varchar(64) not null references shipments(shipment_code),
    api_key_hash varchar(128) not null,
    public_key_pem text not null,
    signature_algorithm varchar(64) not null,
    status varchar(32) not null default 'ACTIVE',
    created_at timestamptz not null default now(),
    activated_at timestamptz not null default now(),
    last_seen_at timestamptz,
    version bigint not null default 0
);

create table telemetry_records (
    id uuid primary key,
    device_id varchar(128) not null references devices(device_id),
    shipment_code varchar(64) not null references shipments(shipment_code),
    temperature numeric(8,2),
    humidity numeric(8,2),
    rssi integer,
    lat numeric(10,7),
    lng numeric(10,7),
    battery integer,
    raw_payload text not null,
    signature text not null,
    payload_hash varchar(64) not null,
    previous_hash varchar(64) not null,
    record_hash varchar(64) not null,
    canonical_request text not null,
    device_timestamp bigint not null,
    nonce varchar(128) not null,
    created_at timestamptz not null default now()
);

create table device_nonces (
    id uuid primary key,
    device_id varchar(128) not null references devices(device_id),
    nonce varchar(128) not null,
    device_timestamp bigint not null,
    created_at timestamptz not null default now(),
    constraint uk_device_nonce unique (device_id, nonce)
);

create table alerts (
    id uuid primary key,
    shipment_code varchar(64) not null references shipments(shipment_code),
    device_id varchar(128) not null references devices(device_id),
    telemetry_id uuid not null references telemetry_records(id),
    type varchar(64) not null,
    level varchar(32) not null,
    message varchar(500) not null,
    created_at timestamptz not null default now()
);

create table audit_logs (
    id uuid primary key,
    actor_type varchar(64) not null,
    actor_id varchar(128),
    action varchar(128) not null,
    result varchar(64) not null,
    message varchar(1000),
    created_at timestamptz not null default now()
);

create index idx_verify_codes_shipment on verify_codes(shipment_code);
create index idx_devices_shipment on devices(shipment_code);
create index idx_telemetry_shipment_created on telemetry_records(shipment_code, created_at desc);
create index idx_telemetry_device_created on telemetry_records(device_id, created_at desc);
create index idx_alerts_shipment_created on alerts(shipment_code, created_at desc);
create index idx_audit_created on audit_logs(created_at desc);
