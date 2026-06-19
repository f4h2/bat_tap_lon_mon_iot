package com.example.coldchain.service;

import com.example.coldchain.entity.Alert;
import com.example.coldchain.entity.Shipment;
import com.example.coldchain.entity.TelemetryRecord;
import com.example.coldchain.entity.enums.AlertLevel;
import com.example.coldchain.entity.enums.AlertType;
import com.example.coldchain.repository.AlertRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
public class AlertService {
    private final AlertRepository alertRepository;

    public AlertService(AlertRepository alertRepository) {
        this.alertRepository = alertRepository;
    }

    public List<Alert> evaluateAndSave(Shipment shipment, TelemetryRecord telemetry) {
        List<Alert> alerts = new ArrayList<>();
        if (telemetry.getTemperature() != null) {
            if (shipment.getMinTemperature() != null && telemetry.getTemperature().compareTo(shipment.getMinTemperature()) < 0) {
                alerts.add(build(telemetry, AlertType.TEMP_OUT_OF_RANGE, AlertLevel.HIGH,
                        "Temperature is below allowed range: " + telemetry.getTemperature() + "°C"));
            }
            if (shipment.getMaxTemperature() != null && telemetry.getTemperature().compareTo(shipment.getMaxTemperature()) > 0) {
                alerts.add(build(telemetry, AlertType.TEMP_OUT_OF_RANGE, AlertLevel.HIGH,
                        "Temperature is above allowed range: " + telemetry.getTemperature() + "°C"));
            }
        }

        if (telemetry.getHumidity() != null) {
            BigDecimal humidity = telemetry.getHumidity();
            if (shipment.getMinHumidity() != null && humidity.compareTo(shipment.getMinHumidity()) < 0) {
                alerts.add(build(telemetry, AlertType.HUMIDITY_OUT_OF_RANGE, AlertLevel.WARNING,
                        "Humidity is below allowed range: " + humidity + "%"));
            }
            if (shipment.getMaxHumidity() != null && humidity.compareTo(shipment.getMaxHumidity()) > 0) {
                alerts.add(build(telemetry, AlertType.HUMIDITY_OUT_OF_RANGE, AlertLevel.WARNING,
                        "Humidity is above allowed range: " + humidity + "%"));
            }
        }

        if (telemetry.getBattery() != null && telemetry.getBattery() < 20) {
            alerts.add(build(telemetry, AlertType.LOW_BATTERY, AlertLevel.WARNING,
                    "Battery is low: " + telemetry.getBattery() + "%"));
        }

        if (telemetry.getRssi() != null && telemetry.getRssi() < -85) {
            alerts.add(build(telemetry, AlertType.WEAK_SIGNAL, AlertLevel.WARNING,
                    "RSSI signal is weak: " + telemetry.getRssi()));
        }

        return alertRepository.saveAll(alerts);
    }

    private Alert build(TelemetryRecord telemetry, AlertType type, AlertLevel level, String message) {
        Alert alert = new Alert();
        alert.setShipmentCode(telemetry.getShipmentCode());
        alert.setDeviceId(telemetry.getDeviceId());
        alert.setTelemetryId(telemetry.getId());
        alert.setType(type);
        alert.setLevel(level);
        alert.setMessage(message);
        return alert;
    }
}
