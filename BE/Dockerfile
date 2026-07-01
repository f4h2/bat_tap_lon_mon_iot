# syntax=docker/dockerfile:1

# ---- Build stage: biên dịch bằng Maven + JDK 21 (không cần cài Maven/JDK trên máy) ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Tải dependency trước để tận dụng cache Docker layer (chỉ chạy lại khi pom.xml đổi).
COPY pom.xml .
RUN mvn -B -q -DskipTests dependency:go-offline

# Biên dịch & đóng gói jar.
COPY src ./src
RUN mvn -B -q -DskipTests clean package

# ---- Runtime stage: chỉ cần JRE để chạy ----
FROM eclipse-temurin:21-jre
WORKDIR /app

# Copy đúng jar thực thi (bỏ qua jar *.original nếu có).
COPY --from=build /build/target/*.jar /app/app.jar

# Thư mục lưu sổ neo toàn vẹn (mount volume để tồn tại qua các lần chạy).
RUN mkdir -p /app/data
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
