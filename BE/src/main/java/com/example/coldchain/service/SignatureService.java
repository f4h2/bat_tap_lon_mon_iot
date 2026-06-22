package com.example.coldchain.service;

import com.example.coldchain.exception.ApiException;
import com.example.coldchain.util.PublicKeyUtil;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.PublicKey;
import java.security.Signature;
import java.util.Base64;

@Service
public class SignatureService {
    public void validatePublicKey(String publicKeyPem) {
        try {
            PublicKeyUtil.parsePublicKey(publicKeyPem);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_PUBLIC_KEY", e.getMessage());
        }
    }

    public String detectAlgorithm(String publicKeyPem) {
        try {
            PublicKey publicKey = PublicKeyUtil.parsePublicKey(publicKeyPem);
            return PublicKeyUtil.defaultSignatureAlgorithm(publicKey);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_PUBLIC_KEY", e.getMessage());
        }
    }

    public boolean verify(String publicKeyPem, String algorithm, String data, String base64Signature) {
        try {
            PublicKey publicKey = PublicKeyUtil.parsePublicKey(publicKeyPem);
            Signature verifier = Signature.getInstance(algorithm);
            verifier.initVerify(publicKey);
            verifier.update(data.getBytes(StandardCharsets.UTF_8));
            byte[] signatureBytes = Base64.getDecoder().decode(base64Signature);
            return verifier.verify(signatureBytes);
        } catch (Exception e) {
            return false;
        }
    }
}
