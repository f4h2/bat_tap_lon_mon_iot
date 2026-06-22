package com.example.coldchain.repository;

import com.example.coldchain.entity.DeviceNonce;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface DeviceNonceRepository extends JpaRepository<DeviceNonce, UUID> {
    boolean existsByDeviceIdAndNonce(String deviceId, String nonce);
}
