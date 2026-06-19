package com.example.coldchain.repository;

import com.example.coldchain.entity.Alert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AlertRepository extends JpaRepository<Alert, UUID> {
    List<Alert> findByShipmentCodeOrderByCreatedAtDesc(String shipmentCode);
}
