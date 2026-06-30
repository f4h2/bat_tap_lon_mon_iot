package com.example.coldchain.config;

import com.example.coldchain.exception.ApiException;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    private Bucket createNewBucket() {
        // Limit: 12 requests per minute (1 request per 5 seconds on average)
        Bandwidth limit = Bandwidth.classic(12, Refill.greedy(12, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String deviceId = request.getHeader("X-Device-Id");
        if (deviceId == null || deviceId.isBlank()) {
            return true; // Let the controller handle missing header error
        }

        Bucket bucket = buckets.computeIfAbsent(deviceId, k -> createNewBucket());
        if (bucket.tryConsume(1)) {
            return true;
        } else {
            response.setStatus(429);
            response.getWriter().write("{\"status\":\"error\",\"message\":\"Too Many Requests\"}");
            response.setContentType("application/json");
            return false;
        }
    }
}
