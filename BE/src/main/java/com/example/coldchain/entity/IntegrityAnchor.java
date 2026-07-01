package com.example.coldchain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "integrity_anchors")
public class IntegrityAnchor {
    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "scope", nullable = false, length = 64)
    private String scope;

    @Column(name = "head_hash", nullable = false, length = 64)
    private String headHash;

    @Column(name = "record_count", nullable = false)
    private long recordCount;

    @Column(name = "prev_anchor_hash", nullable = false, length = 64)
    private String prevAnchorHash;

    @Column(name = "anchor_hmac", nullable = false, length = 64)
    private String anchorHmac;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
        if (scope == null) scope = "GLOBAL";
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getHeadHash() { return headHash; }
    public void setHeadHash(String headHash) { this.headHash = headHash; }
    public long getRecordCount() { return recordCount; }
    public void setRecordCount(long recordCount) { this.recordCount = recordCount; }
    public String getPrevAnchorHash() { return prevAnchorHash; }
    public void setPrevAnchorHash(String prevAnchorHash) { this.prevAnchorHash = prevAnchorHash; }
    public String getAnchorHmac() { return anchorHmac; }
    public void setAnchorHmac(String anchorHmac) { this.anchorHmac = anchorHmac; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
