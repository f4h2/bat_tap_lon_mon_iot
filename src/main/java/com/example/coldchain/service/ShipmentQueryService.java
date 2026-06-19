package com.example.coldchain.service;

import com.example.coldchain.dto.AlertView;
import com.example.coldchain.dto.TelemetryView;
import com.example.coldchain.exception.ApiException;
import com.example.coldchain.repository.AlertRepository;
import com.example.coldchain.repository.ShipmentRepository;
import com.example.coldchain.repository.TelemetryRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ShipmentQueryService {
    private final ShipmentRepository shipmentRepository;
    private final TelemetryRecordRepository telemetryRepository;
    private final AlertRepository alertRepository;

    public ShipmentQueryService(ShipmentRepository shipmentRepository,
                                TelemetryRecordRepository telemetryRepository,
                                AlertRepository alertRepository) {
        this.shipmentRepository = shipmentRepository;
        this.telemetryRepository = telemetryRepository;
        this.alertRepository = alertRepository;
    }

    @Transactional(readOnly = true)
    public List<TelemetryView> telemetry(String shipmentCode) {
        ensureShipmentExists(shipmentCode);
        return telemetryRepository.findByShipmentCodeOrderByCreatedAtDesc(shipmentCode).stream()
                .map(t -> new TelemetryView(
                        t.getId(),
                        t.getDeviceId(),
                        t.getShipmentCode(),
                        t.getTemperature(),
                        t.getHumidity(),
                        t.getRssi(),
                        t.getLat(),
                        t.getLng(),
                        t.getBattery(),
                        t.getDeviceTimestamp(),
                        t.getPayloadHash(),
                        t.getRecordHash(),
                        t.getCreatedAt()
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AlertView> alerts(String shipmentCode) {
        ensureShipmentExists(shipmentCode);
        return alertRepository.findByShipmentCodeOrderByCreatedAtDesc(shipmentCode).stream()
                .map(a -> new AlertView(
                        a.getId(),
                        a.getShipmentCode(),
                        a.getDeviceId(),
                        a.getType().name(),
                        a.getLevel().name(),
                        a.getMessage(),
                        a.getCreatedAt()
                ))
                .toList();
    }

    private void ensureShipmentExists(String shipmentCode) {
        if (!shipmentRepository.existsById(shipmentCode)) {
            throw ApiException.notFound("SHIPMENT_NOT_FOUND", "Shipment does not exist");
        }
    }
}
