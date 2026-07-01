package com.example.coldchain.dto.admin;

import java.util.List;

public record IntegrityReport(
        boolean ok,
        long totalRecords,
        long tamperedRecords,
        long totalAnchors,
        long invalidAnchors,
        long missingFromDbAnchors,
        String message,
        List<AnchorView> anchors,
        List<String> tamperedRecordIds
) {
}
