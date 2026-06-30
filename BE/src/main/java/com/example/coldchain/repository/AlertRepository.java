package com.example.coldchain.repository;

import com.example.coldchain.entity.Alert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface AlertRepository extends JpaRepository<Alert, UUID> {
    Page<Alert> findByShipmentCodeOrderByCreatedAtDesc(String shipmentCode, Pageable pageable);
}
