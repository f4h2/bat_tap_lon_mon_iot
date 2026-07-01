package com.example.coldchain.repository;

import com.example.coldchain.entity.IntegrityAnchor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IntegrityAnchorRepository extends JpaRepository<IntegrityAnchor, java.util.UUID> {
    List<IntegrityAnchor> findAllByOrderByCreatedAtAsc();
    Optional<IntegrityAnchor> findTopByOrderByCreatedAtDesc();
}
