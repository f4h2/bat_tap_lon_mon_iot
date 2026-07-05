package com.example.coldchain.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Ghi log mọi request tới /api/** : method, path, mã trạng thái, thời gian, device-id.
 * Giúp truy vết vì sao thiết bị bị "Post Fail" (401 sai chữ ký, 403 chưa gắn đơn, 400...).
 * Xem log bằng: docker compose logs -f backend
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger("API");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String uri = req.getRequestURI();
        if (!uri.startsWith("/api/")) {
            chain.doFilter(req, res);
            return;
        }
        long start = System.currentTimeMillis();
        try {
            chain.doFilter(req, res);
        } finally {
            long ms = System.currentTimeMillis() - start;
            String dev = req.getHeader("X-Device-Id");
            int status = res.getStatus();
            String flag = status >= 400 ? " <-- LỖI" : "";
            log.info("{} {} -> {} ({}ms){}{}",
                    req.getMethod(), uri, status, ms,
                    dev != null ? " device=" + dev : "",
                    flag);
        }
    }
}
