package com.example.coldchain.repository;

import com.example.coldchain.entity.VerifyCode;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface VerifyCodeRepository extends JpaRepository<VerifyCode, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from VerifyCode v where v.verifyCode = :verifyCode")
    Optional<VerifyCode> findForUpdate(@Param("verifyCode") String verifyCode);
}
