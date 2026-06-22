package com.example.coldchain.util;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

public final class ApiKeyUtil {
    private static final SecureRandom RANDOM = new SecureRandom();

    private ApiKeyUtil() {}

    public static String generateApiKey() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return "iot_sk_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String hmacSha256Hex(String apiKey, String pepper) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(apiKey.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Could not hash api key", e);
        }
    }

    public static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
