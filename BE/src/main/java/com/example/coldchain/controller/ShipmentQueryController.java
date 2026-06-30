package com.example.coldchain.controller;

import com.example.coldchain.dto.AlertView;
import com.example.coldchain.dto.TelemetryView;
import com.example.coldchain.service.ShipmentQueryService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    public ResponseEntity<Page<TelemetryView>> telemetry(@PathVariable String shipmentCode,
                                                         @RequestParam(defaultValue = "0") int page,
                                                         @RequestParam(defaultValue = "500") int size) {
        return ResponseEntity.ok(queryService.telemetry(shipmentCode, PageRequest.of(page, size)));
    }

    @GetMapping("/{shipmentCode}/alerts")
    public ResponseEntity<Page<AlertView>> alerts(@PathVariable String shipmentCode,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "100") int size) {
        return ResponseEntity.ok(queryService.alerts(shipmentCode, PageRequest.of(page, size)));
    }
}
