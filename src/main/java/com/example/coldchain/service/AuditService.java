package com.example.coldchain.service;

import com.example.coldchain.entity.AuditLog;
import com.example.coldchain.repository.AuditLogRepository;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public void success(String actorType, String actorId, String action, String message) {
        save(actorType, actorId, action, "SUCCESS", message);
    }

    public void fail(String actorType, String actorId, String action, String message) {
        save(actorType, actorId, action, "FAIL", message);
    }

    private void save(String actorType, String actorId, String action, String result, String message) {
        AuditLog log = new AuditLog();
        log.setActorType(actorType);
        log.setActorId(actorId);
        log.setAction(action);
        log.setResult(result);
        log.setMessage(message);
        auditLogRepository.save(log);
    }
}
