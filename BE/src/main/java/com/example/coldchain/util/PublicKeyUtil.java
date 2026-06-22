package com.example.coldchain.util;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

public final class PublicKeyUtil {
    private PublicKeyUtil() {}

    public static PublicKey parsePublicKey(String pem) {
        String normalized = pem
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
        byte[] encoded = Base64.getDecoder().decode(normalized);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(encoded);
        try {
            return KeyFactory.getInstance("EC").generatePublic(keySpec);
        } catch (Exception ignored) {
            try {
                return KeyFactory.getInstance("RSA").generatePublic(keySpec);
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid public key. Expected X.509 PEM EC or RSA public key", e);
            }
        }
    }

    public static String defaultSignatureAlgorithm(PublicKey publicKey) {
        if ("EC".equalsIgnoreCase(publicKey.getAlgorithm())) {
            return "SHA256withECDSA";
        }
        if ("RSA".equalsIgnoreCase(publicKey.getAlgorithm())) {
            return "SHA256withRSA";
        }
        throw new IllegalArgumentException("Unsupported public key algorithm: " + publicKey.getAlgorithm());
    }
}
