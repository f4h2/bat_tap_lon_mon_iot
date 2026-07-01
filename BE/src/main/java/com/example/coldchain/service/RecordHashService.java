package com.example.coldchain.service;

import com.example.coldchain.config.SecurityProperties;
import com.example.coldchain.util.ApiKeyUtil;
import org.springframework.stereotype.Service;

/**
 * Tính record_hash và các HMAC toàn vẹn bằng khóa bí mật (integritySecret) đặt NGOÀI DB.
 * Nhờ vậy, người chỉ có quyền ghi DB mà không có secret sẽ không tính lại được hash hợp lệ.
 */
@Service
public class RecordHashService {
    private final SecurityProperties securityProperties;

    public RecordHashService(SecurityProperties securityProperties) {
        this.securityProperties = securityProperties;
    }

    /** record_hash = HMAC-SHA256(secret, deviceId|timestamp|payloadHash|signature|previousHash). */
    public String recordHash(String deviceId, long timestamp, String payloadHash, String signature, String previousHash) {
        String data = deviceId + "|" + timestamp + "|" + payloadHash + "|" + signature + "|" + previousHash;
        return hmac(data);
    }

    /** HMAC-SHA256(secret, data) dạng hex — dùng cho anchor & fold chuỗi. */
    public String hmac(String data) {
        return ApiKeyUtil.hmacSha256Hex(data, securityProperties.integritySecret());
    }
}
