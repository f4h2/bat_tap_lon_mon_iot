package com.example.coldchain.dto.admin;

public record DashboardStatsResponse(
        long totalShipments,
        long activeDevices,
        long unusedVerifyCodes,
        long totalAlerts
) {
}
