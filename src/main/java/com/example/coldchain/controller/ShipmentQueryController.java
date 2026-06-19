package com.example.coldchain.controller;

import com.example.coldchain.dto.AlertView;
import com.example.coldchain.dto.TelemetryView;
import com.example.coldchain.service.ShipmentQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/shipments")
public class ShipmentQueryController {
    private final ShipmentQueryService queryService;

    public ShipmentQueryController(ShipmentQueryService queryService) {
        this.queryService = queryService;
    }

    @GetMapping("/{shipmentCode}/telemetry")
    public ResponseEntity<List<TelemetryView>> telemetry(@PathVariable String shipmentCode) {
        return ResponseEntity.ok(queryService.telemetry(shipmentCode));
    }

    @GetMapping("/{shipmentCode}/alerts")
    public ResponseEntity<List<AlertView>> alerts(@PathVariable String shipmentCode) {
        return ResponseEntity.ok(queryService.alerts(shipmentCode));
    }
}
