package com.example.coldchain.service;

import com.example.coldchain.dto.admin.AnchorView;
import com.example.coldchain.dto.admin.IntegrityReport;
import com.example.coldchain.entity.IntegrityAnchor;
import com.example.coldchain.entity.TelemetryRecord;
import com.example.coldchain.repository.IntegrityAnchorRepository;
import com.example.coldchain.repository.TelemetryRecordRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Sổ neo toàn vẹn (external anchor / notary). Định kỳ "công bố" trạng thái hash chain
 * ra một sổ append-only + file ngoài DB. Khi verify, đối chiếu chuỗi hiện tại với các
 * anchor đã công bố -> mọi viết-lại lịch sử đều bị lệch anchor.
 */
@Service
public class IntegrityService {
    private final TelemetryRecordRepository telemetryRepository;
    private final IntegrityAnchorRepository anchorRepository;
    private final RecordHashService recordHashService;
    private final String anchorLogPath;

    public IntegrityService(TelemetryRecordRepository telemetryRepository,
                            IntegrityAnchorRepository anchorRepository,
                            RecordHashService recordHashService,
                            @Value("${app.integrity.anchor-log-path}") String anchorLogPath) {
        this.telemetryRepository = telemetryRepository;
        this.anchorRepository = anchorRepository;
        this.recordHashService = recordHashService;
        this.anchorLogPath = anchorLogPath;
    }

    @Transactional
    public AnchorView createAnchor() {
        List<TelemetryRecord> records = orderedRecords();
        String head = foldHead(records, records.size());
        String prevHash = anchorRepository.findTopByOrderByCreatedAtDesc()
                .map(IntegrityAnchor::getAnchorHmac).orElse("GENESIS");
        Instant now = Instant.now();
        long count = records.size();
        String hmac = anchorHmac(prevHash, head, count, now);

        IntegrityAnchor anchor = new IntegrityAnchor();
        anchor.setScope("GLOBAL");
        anchor.setHeadHash(head);
        anchor.setRecordCount(count);
        anchor.setPrevAnchorHash(prevHash);
        anchor.setAnchorHmac(hmac);
        anchor.setCreatedAt(now);
        anchorRepository.save(anchor);

        appendToExternalLog(anchor);
        return new AnchorView(anchor.getId(), head, count, now, true, "Đã tạo & công bố ra sổ đối soát ngoài");
    }

    @Transactional(readOnly = true)
    public IntegrityReport verify() {
        List<TelemetryRecord> records = orderedRecords();

        // Layer 1: từng bản ghi — record_hash (HMAC) tính lại phải khớp + liên kết chuỗi.
        List<String> tamperedIds = new ArrayList<>();
        Map<String, String> lastHashByDevice = new HashMap<>();
        for (TelemetryRecord r : records) {
            boolean bad = false;
            String recomputed = recordHashService.recordHash(
                    r.getDeviceId(), r.getDeviceTimestamp(), r.getPayloadHash(), r.getSignature(), r.getPreviousHash());
            if (!recomputed.equals(r.getRecordHash())) bad = true;
            String expectedPrev = lastHashByDevice.getOrDefault(r.getDeviceId(), "GENESIS");
            if (!expectedPrev.equals(r.getPreviousHash())) bad = true;
            lastHashByDevice.put(r.getDeviceId(), r.getRecordHash());
            if (bad) tamperedIds.add(r.getId().toString());
        }

        // Fold head tại mỗi tiền tố (dùng record_hash đang lưu).
        String[] fold = new String[records.size() + 1];
        fold[0] = "GENESIS";
        for (int i = 1; i <= records.size(); i++) {
            fold[i] = recordHashService.hmac(fold[i - 1] + "|" + records.get(i - 1).getRecordHash());
        }

        // Layer 2: đối chiếu từng anchor đã công bố.
        List<IntegrityAnchor> anchors = anchorRepository.findAllByOrderByCreatedAtAsc();
        List<AnchorView> anchorViews = new ArrayList<>();
        long invalid = 0;
        String prevHash = "GENESIS";
        for (IntegrityAnchor a : anchors) {
            List<String> notes = new ArrayList<>();
            if (!anchorHmac(a.getPrevAnchorHash(), a.getHeadHash(), a.getRecordCount(), a.getCreatedAt()).equals(a.getAnchorHmac())) {
                notes.add("mã HMAC điểm đối soát không hợp lệ (bị giả mạo hoặc sai secret)");
            }
            if (!prevHash.equals(a.getPrevAnchorHash())) notes.add("liên kết giữa các điểm đối soát bị đứt");
            prevHash = a.getAnchorHmac();

            boolean headOk = a.getRecordCount() >= 0 && a.getRecordCount() <= records.size()
                    && fold[(int) a.getRecordCount()].equals(a.getHeadHash());
            if (!headOk) notes.add("head_hash không khớp chuỗi hiện tại (dữ liệu đã bị sửa/xoá)");

            boolean valid = notes.isEmpty();
            if (!valid) invalid++;
            anchorViews.add(new AnchorView(a.getId(), a.getHeadHash(), a.getRecordCount(), a.getCreatedAt(),
                    valid, valid ? "Hợp lệ" : String.join("; ", notes)));
        }

        // Đối chiếu số anchor đã công bố ra sổ ngoài vs còn lại trong DB (bắt việc xoá anchor).
        long publishedCount = readExternalLogCount();
        long missing = Math.max(0, publishedCount - anchors.size());

        boolean ok = tamperedIds.isEmpty() && invalid == 0 && missing == 0;
        String message = ok
                ? "TOÀN VẸN: hash chain và tất cả điểm đối soát đều khớp."
                : String.format("PHÁT HIỆN BẤT THƯỜNG: %d bản ghi bị sửa, %d điểm đối soát sai, %d điểm đối soát bị xoá khỏi DB.",
                    tamperedIds.size(), invalid, missing);

        return new IntegrityReport(ok, records.size(), tamperedIds.size(), anchors.size(), invalid, missing,
                message, anchorViews, tamperedIds);
    }

    private List<TelemetryRecord> orderedRecords() {
        List<TelemetryRecord> recs = new ArrayList<>(telemetryRepository.findAll());
        recs.sort(Comparator.comparing(TelemetryRecord::getCreatedAt).thenComparing(r -> r.getId().toString()));
        return recs;
    }

    private String foldHead(List<TelemetryRecord> records, int upto) {
        String acc = "GENESIS";
        for (int i = 0; i < upto; i++) {
            acc = recordHashService.hmac(acc + "|" + records.get(i).getRecordHash());
        }
        return acc;
    }

    private String anchorHmac(String prevHash, String head, long count, Instant createdAt) {
        return recordHashService.hmac(prevHash + "|" + head + "|" + count + "|" + createdAt.toEpochMilli());
    }

    private void appendToExternalLog(IntegrityAnchor a) {
        try {
            Path p = Path.of(anchorLogPath);
            if (p.getParent() != null) Files.createDirectories(p.getParent());
            String line = String.format("{\"createdAt\":\"%s\",\"recordCount\":%d,\"headHash\":\"%s\",\"anchorHmac\":\"%s\"}%n",
                    a.getCreatedAt(), a.getRecordCount(), a.getHeadHash(), a.getAnchorHmac());
            Files.writeString(p, line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            // Công bố ra sổ ngoài là best-effort; không chặn nghiệp vụ nếu ghi file lỗi.
        }
    }

    private long readExternalLogCount() {
        try {
            Path p = Path.of(anchorLogPath);
            if (!Files.exists(p)) return 0;
            return Files.readAllLines(p).stream().filter(s -> !s.isBlank()).count();
        } catch (IOException e) {
            return 0;
        }
    }
}
