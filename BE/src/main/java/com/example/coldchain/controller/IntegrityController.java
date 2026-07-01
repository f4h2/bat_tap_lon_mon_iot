package com.example.coldchain.controller;

import com.example.coldchain.dto.admin.AnchorView;
import com.example.coldchain.dto.admin.IntegrityReport;
import com.example.coldchain.service.IntegrityService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/integrity")
public class IntegrityController {
    private final IntegrityService integrityService;

    public IntegrityController(IntegrityService integrityService) {
        this.integrityService = integrityService;
    }

    /** Công bố một mốc neo mới cho trạng thái hash chain hiện tại. */
    @PostMapping("/anchor")
    public ResponseEntity<AnchorView> createAnchor() {
        return ResponseEntity.ok(integrityService.createAnchor());
    }

    /** Kiểm chứng toàn vẹn toàn hệ thống: hash chain + đối chiếu các anchor đã công bố. */
    @GetMapping("/status")
    public ResponseEntity<IntegrityReport> status() {
        return ResponseEntity.ok(integrityService.verify());
    }
}
