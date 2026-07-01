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

    // Các đơn ship mà thiết bị đã từng gửi telemetry (số đơn đã phục vụ).
    @org.springframework.data.jpa.repository.Query(
        "select distinct t.shipmentCode from TelemetryRecord t where t.deviceId = :deviceId order by t.shipmentCode")
    List<String> findDistinctShipmentCodesByDeviceId(@org.springframework.data.repository.query.Param("deviceId") String deviceId);

    long countByDeviceId(String deviceId);
}
