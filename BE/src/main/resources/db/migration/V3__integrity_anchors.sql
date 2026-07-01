-- Sổ neo toàn vẹn (append-only notary). Mỗi anchor "công bố" trạng thái hash chain
-- tại một thời điểm; anchor_hmac ký bằng khóa bí mật ngoài DB nên không thể giả mạo
-- nếu không biết secret. Các anchor cũng tự liên kết qua prev_anchor_hash.
create table integrity_anchors (
    id uuid primary key,
    scope varchar(64) not null default 'GLOBAL',
    head_hash varchar(64) not null,
    record_count bigint not null,
    prev_anchor_hash varchar(64) not null,
    anchor_hmac varchar(64) not null,
    created_at timestamptz not null default now()
);

create index idx_anchor_created on integrity_anchors(created_at);
