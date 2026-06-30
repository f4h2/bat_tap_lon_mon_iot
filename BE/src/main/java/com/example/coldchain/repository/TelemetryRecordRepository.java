package com.example.coldchain.repository;

import com.example.coldchain.entity.TelemetryRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface TelemetryRecordRepository extends JpaRepository<TelemetryRecord, UUID> {
    Optional<TelemetryRecord> findTopByDeviceIdOrderByCreatedAtDesc(String deviceId);
    Page<TelemetryRecord> findByShipmentCodeOrderByCreatedAtDesc(String shipmentCode, Pageable pageable);
}
