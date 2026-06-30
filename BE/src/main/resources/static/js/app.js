/* Cold Chain Admin Dashboard — SPA thuần, không build, không framework. */
(function () {
  "use strict";

  const view = document.getElementById("view");
  const pageTitle = document.getElementById("pageTitle");
  const pageSub = document.getElementById("pageSub");
  const refreshBtn = document.getElementById("refreshBtn");
  const toastEl = document.getElementById("toast");

  let monitorTimer = null; // auto-refresh cho màn Giám sát

  /* ---------------- helpers ---------------- */
  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      }
    }
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach((c) => {
      if (c == null) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = "toast " + (kind || "ok");
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString("vi-VN", { hour12: false });
  }
  function fmtEpoch(sec) {
    if (sec == null) return "—";
    return new Date(Number(sec) * 1000).toLocaleString("vi-VN", { hour12: false });
  }
  function relTime(iso) {
    if (!iso) return "chưa kết nối";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(diff)) return "—";
    if (diff < 60) return Math.floor(diff) + " giây trước";
    if (diff < 3600) return Math.floor(diff / 60) + " phút trước";
    if (diff < 86400) return Math.floor(diff / 3600) + " giờ trước";
    return Math.floor(diff / 86400) + " ngày trước";
  }
  const num = (v, digits) => (v == null || v === "" ? "—" : Number(v).toFixed(digits == null ? 1 : digits));
  const short = (s, n) => (s && s.length > (n || 12) ? s.slice(0, n || 12) + "…" : s || "—");

  function searchBox(placeholder, onChange) {
    const input = h("input", { type: "search", placeholder: placeholder, autocomplete: "off" });
    input.addEventListener("input", () => onChange(input.value.trim().toLowerCase()));
    return h("div", { class: "search" }, input);
  }
  function matches(parts, q) {
    if (!q) return true;
    return parts.filter(Boolean).join(" ").toLowerCase().includes(q);
  }

  // Diễn giải mã lỗi toàn vẹn (tamper) sang tiếng Việt cho tooltip.
  const TAMPER_LABELS = {
    PAYLOAD_HASH_MISMATCH: "payload_hash ≠ SHA256(raw_payload)",
    RECORD_HASH_MISMATCH: "record_hash tính lại không khớp",
    CHAIN_BROKEN: "Liên kết hash chain bị đứt (bản ghi trước bị sửa/xoá)",
    CANONICAL_MISMATCH: "Canonical request không khớp các trường",
    SIGNATURE_INVALID: "Chữ ký số ECDSA không hợp lệ",
    DEVICE_MISSING: "Không tìm thấy thiết bị để xác thực chữ ký",
    PAYLOAD_UNPARSEABLE: "raw_payload không đọc được (JSON hỏng)",
  };
  function tamperLabel(code) {
    if (code.indexOf("COLUMN_MISMATCH:") === 0) return "Cột '" + code.split(":")[1] + "' khác giá trị trong raw_payload";
    return TAMPER_LABELS[code] || code;
  }
  function tamperTitle(issues) {
    return "Phát hiện sửa đổi:\n• " + (issues || []).map(tamperLabel).join("\n• ");
  }

  /* Các điểm chủ quyền Việt Nam ghi đè lên bản đồ (OSM thiếu nhãn 2 quần đảo này). */
  const VN_ISLANDS = [
    { name: "Quần đảo Hoàng Sa (Việt Nam)", lat: 16.5, lng: 112.0 },
    { name: "Quần đảo Trường Sa (Việt Nam)", lat: 9.0, lng: 113.0 },
  ];

  /* Lazy-load Leaflet (bản đồ OpenStreetMap, miễn phí, không cần API key). */
  let leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => resolve(window.L);
      s.onerror = () => reject(new Error("Không tải được Leaflet (cần internet)."));
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  function statusBadge(status) {
    const s = String(status || "").toUpperCase();
    const map = {
      ACTIVE: "badge-ok", ACTIVE_: "badge-ok", USED: "badge-muted", UNUSED: "badge-info",
      EXPIRED: "badge-err", REVOKED: "badge-err", COMPLETED: "badge-info", CANCELLED: "badge-muted",
      INACTIVE: "badge-warn",
    };
    return h("span", { class: "badge " + (map[s] || "badge-muted") }, s || "—");
  }
  function levelBadge(level) {
    const s = String(level || "").toUpperCase();
    const map = { HIGH: "badge-err", WARNING: "badge-warn", INFO: "badge-info" };
    return h("span", { class: "badge " + (map[s] || "badge-muted") }, s || "—");
  }

  function setLoading() {
    clear(view);
    view.appendChild(h("div", { class: "loading" }, "Đang tải dữ liệu…"));
  }
  function showError(err) {
    clear(view);
    const msg = err instanceof Api.ApiError ? `[${err.code}] ${err.message}` : String(err && err.message || err);
    view.appendChild(h("div", { class: "panel" }, [
      h("div", { class: "panel-title" }, "Không tải được dữ liệu"),
      h("p", { class: "page-sub", style: "margin-top:8px" }, msg),
      h("p", { class: "page-sub" }, "Hãy chắc chắn backend đang chạy tại http://localhost:8080 (mvn spring-boot:run)."),
    ]));
  }

  /* ---------------- Canvas: line chart nhiệt độ / độ ẩm ---------------- */
  function drawTimeSeries(canvas, points, band, hoveredIdx) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padL = 42, padR = 42, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    if (!points.length) {
      ctx.fillStyle = "#6b829c"; ctx.font = "13px Segoe UI"; ctx.textAlign = "center";
      ctx.fillText("Chưa có dữ liệu telemetry.", W / 2, H / 2);
      return;
    }

    const temps = points.map((p) => p.t).filter((v) => v != null);
    const hums = points.map((p) => p.h).filter((v) => v != null);
    let tMin = Math.min.apply(null, temps), tMax = Math.max.apply(null, temps);
    if (band) { tMin = Math.min(tMin, band.min); tMax = Math.max(tMax, band.max); }
    if (tMin === tMax) { tMin -= 1; tMax += 1; }
    const tPad = (tMax - tMin) * 0.15; tMin -= tPad; tMax += tPad;
    let hMin = 0, hMax = 100;

    const x = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yT = (v) => padT + plotH - ((v - tMin) / (tMax - tMin)) * plotH;
    const yH = (v) => padT + plotH - ((v - hMin) / (hMax - hMin)) * plotH;

    // grid + trục nhiệt độ (trái)
    ctx.strokeStyle = "#eef2f7"; ctx.fillStyle = "#9aa9bb"; ctx.font = "10px Segoe UI"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let g = 0; g <= 4; g++) {
      const v = tMin + (g / 4) * (tMax - tMin);
      const yy = yT(v);
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
      ctx.fillStyle = "#e65f2b"; ctx.fillText(v.toFixed(1), padL - 6, yy);
    }
    // trục độ ẩm (phải)
    ctx.textAlign = "left"; ctx.fillStyle = "#1f6feb";
    for (let g = 0; g <= 4; g++) {
      const v = hMin + (g / 4) * (hMax - hMin);
      ctx.fillText(v.toFixed(0) + "%", W - padR + 6, yH(v));
    }

    // dải ngưỡng nhiệt độ cho phép
    if (band) {
      ctx.fillStyle = "rgba(31,157,85,.10)";
      const yTop = yT(band.max), yBot = yT(band.min);
      ctx.fillRect(padL, Math.min(yTop, yBot), plotW, Math.abs(yBot - yTop));
      ctx.strokeStyle = "rgba(31,157,85,.45)"; ctx.setLineDash([4, 4]);
      [band.min, band.max].forEach((v) => { const yy = yT(v); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); });
      ctx.setLineDash([]);
    }

    // vạch dọc đỏ tại các điểm bị sửa đổi (tamper) — vẽ trước để nằm dưới đường
    points.forEach((p, i) => {
      if (p.bad) {
        ctx.strokeStyle = "rgba(197,48,48,.18)"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x(i), padT); ctx.lineTo(x(i), padT + plotH); ctx.stroke();
      }
    });

    // line độ ẩm
    drawLine(ctx, points, x, yH, (p) => p.h, "#1f6feb");
    // line nhiệt độ (vẽ sau để nổi)
    drawLine(ctx, points, x, yT, (p) => p.t, "#e65f2b");

    // điểm nhiệt độ vi phạm ngưỡng -> chấm đỏ
    if (band) {
      points.forEach((p, i) => {
        if (p.t != null && (p.t < band.min || p.t > band.max)) {
          ctx.fillStyle = "#c53030"; ctx.beginPath(); ctx.arc(x(i), yT(p.t), 3.5, 0, Math.PI * 2); ctx.fill();
        }
      });
    }

    // điểm bị sửa đổi -> vòng tròn rỗng đỏ trên cả 2 đường
    points.forEach((p, i) => {
      if (!p.bad) return;
      ctx.strokeStyle = "#c53030"; ctx.lineWidth = 2;
      if (p.t != null) { ctx.beginPath(); ctx.arc(x(i), yT(p.t), 6, 0, Math.PI * 2); ctx.stroke(); }
      if (p.h != null) { ctx.beginPath(); ctx.arc(x(i), yH(p.h), 6, 0, Math.PI * 2); ctx.stroke(); }
    });

    // vẽ đường gióng đứng khi hover
    if (hoveredIdx != null && hoveredIdx >= 0 && hoveredIdx < points.length) {
      const hx = x(hoveredIdx);
      ctx.strokeStyle = "rgba(53, 90, 121, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      const p = points[hoveredIdx];
      if (p.t != null) {
        ctx.fillStyle = "#e65f2b";
        ctx.beginPath(); ctx.arc(hx, yT(p.t), 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (p.h != null) {
        ctx.fillStyle = "#1f6feb";
        ctx.beginPath(); ctx.arc(hx, yH(p.h), 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }
  function showTooltip(e, item, canvasRect) {
    let tooltipEl = document.getElementById("chartTooltip");
    if (!tooltipEl) {
      tooltipEl = h("div", { id: "chartTooltip", class: "chart-tooltip" });
      document.body.appendChild(tooltipEl);
    }
    clear(tooltipEl);
    const timeStr = fmtEpoch(item.device_timestamp);
    const tempVal = num(item.temperature) + "°C";
    const humVal = num(item.humidity) + "%";
    const batVal = num(item.battery, 0) + "%";
    const rssiVal = num(item.rssi, 0) + " dBm";
    const statusText = item.tampered ? "Bị sửa đổi ⚠" : "Toàn vẹn ✔";
    const statusClass = item.tampered ? "t-err" : "t-ok";
    
    tooltipEl.appendChild(h("div", { class: "tooltip-time" }, timeStr));
    tooltipEl.appendChild(h("div", { class: "tooltip-row" }, [
      h("span", null, "Nhiệt độ:"), h("span", { class: "tooltip-val temp-val" }, tempVal)
    ]));
    tooltipEl.appendChild(h("div", { class: "tooltip-row" }, [
      h("span", null, "Độ ẩm:"), h("span", { class: "tooltip-val hum-val" }, humVal)
    ]));
    tooltipEl.appendChild(h("div", { class: "tooltip-row" }, [
      h("span", null, "Pin:"), h("span", { class: "tooltip-val" }, batVal)
    ]));
    tooltipEl.appendChild(h("div", { class: "tooltip-row" }, [
      h("span", null, "Tín hiệu:"), h("span", { class: "tooltip-val" }, rssiVal)
    ]));
    tooltipEl.appendChild(h("div", { class: "tooltip-row" }, [
      h("span", null, "Trạng thái:"), h("span", { class: "tooltip-val " + statusClass }, statusText)
    ]));

    if (item.tampered && item.integrity_issues && item.integrity_issues.length) {
      const issueList = item.integrity_issues.map(tamperLabel).join(", ");
      tooltipEl.appendChild(h("div", { class: "tooltip-issues" }, "Lỗi: " + issueList));
    }

    tooltipEl.style.display = "block";
    const tooltipW = tooltipEl.offsetWidth;
    const tooltipH = tooltipEl.offsetHeight;
    
    let left = window.scrollX + e.clientX + 15;
    let top = window.scrollY + e.clientY - tooltipH / 2;
    
    if (left + tooltipW > window.innerWidth + window.scrollX) {
      left = window.scrollX + e.clientX - tooltipW - 15;
    }
    if (top < window.scrollY) {
      top = window.scrollY + 10;
    } else if (top + tooltipH > window.scrollY + window.innerHeight) {
      top = window.scrollY + window.innerHeight - tooltipH - 10;
    }
    
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
  }

  function hideTooltip() {
    const tooltipEl = document.getElementById("chartTooltip");
    if (tooltipEl) {
      tooltipEl.style.display = "none";
    }
  }

  function drawLine(ctx, points, x, y, pick, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round";
    ctx.beginPath();
    let started = false;
    points.forEach((p, i) => {
      const v = pick(p);
      if (v == null) return;
      const px = x(i), py = y(v);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  /* ---------------- Canvas: bản đồ lộ trình GPS (offline) ---------------- */
  function drawGpsTrack(canvas, coords) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#eef4fb"; ctx.fillRect(0, 0, W, H);

    const pts = coords.filter((c) => c.lat != null && c.lng != null);
    if (!pts.length) {
      ctx.fillStyle = "#6b829c"; ctx.font = "13px Segoe UI"; ctx.textAlign = "center";
      ctx.fillText("Chưa có dữ liệu vị trí GPS.", W / 2, H / 2);
      return;
    }
    const pad = 26;
    let latMin = Math.min.apply(null, pts.map((p) => p.lat)), latMax = Math.max.apply(null, pts.map((p) => p.lat));
    let lngMin = Math.min.apply(null, pts.map((p) => p.lng)), lngMax = Math.max.apply(null, pts.map((p) => p.lng));
    if (latMin === latMax) { latMin -= 0.002; latMax += 0.002; }
    if (lngMin === lngMax) { lngMin -= 0.002; lngMax += 0.002; }
    const X = (lng) => pad + ((lng - lngMin) / (lngMax - lngMin)) * (W - 2 * pad);
    // lat tăng -> lên trên (đảo trục y)
    const Y = (lat) => pad + (1 - (lat - latMin) / (latMax - latMin)) * (H - 2 * pad);

    // lưới mờ
    ctx.strokeStyle = "#dbe6f2"; ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      const gx = pad + (g / 4) * (W - 2 * pad), gy = pad + (g / 4) * (H - 2 * pad);
      ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, H - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
    }

    // đường lộ trình
    ctx.strokeStyle = "#1d6f8d"; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((p, i) => { const px = X(p.lng), py = Y(p.lat); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();

    // các điểm
    pts.forEach((p) => { ctx.fillStyle = "rgba(29,111,141,.5)"; ctx.beginPath(); ctx.arc(X(p.lng), Y(p.lat), 2.5, 0, Math.PI * 2); ctx.fill(); });

    // điểm đầu (xanh) và điểm hiện tại (cam, pin)
    const first = pts[0], last = pts[pts.length - 1];
    ctx.fillStyle = "#1f9d55"; ctx.beginPath(); ctx.arc(X(first.lng), Y(first.lat), 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e65f2b";
    ctx.beginPath(); ctx.arc(X(last.lng), Y(last.lat), 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
  }

  /* ---------------- Canvas: biểu đồ phân tích nguy cơ (Doughnut Chart) ---------------- */
  function drawDoughnutChart(canvas, data) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const centerX = W / 2;
    const centerY = H / 2;
    const radius = Math.min(W, H) / 2 - 12;
    const innerRadius = radius * 0.65;

    const total = data.reduce((acc, d) => acc + d.value, 0);
    if (total === 0) {
      // Draw empty state circle (safe)
      ctx.strokeStyle = "#e3f6ec";
      ctx.lineWidth = radius - innerRadius;
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius + innerRadius) / 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#1f9d55";
      ctx.font = "bold 13px Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AN TOÀN", centerX, centerY - 6);
      ctx.fillStyle = "#6b829c";
      ctx.font = "10px Segoe UI";
      ctx.fillText("0 nguy cơ", centerX, centerY + 8);
      return;
    }

    let startAngle = -Math.PI / 2;
    data.forEach((d) => {
      if (d.value === 0) return;
      const sliceAngle = (d.value / total) * Math.PI * 2;
      
      ctx.strokeStyle = d.color;
      ctx.lineWidth = radius - innerRadius;
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius + innerRadius) / 2, startAngle, startAngle + sliceAngle);
      ctx.stroke();

      startAngle += sliceAngle;
    });

    // Draw center text
    const highVal = (data.find(d => d.name === "Nguy cơ cao") || { value: 0 }).value;
    const warnVal = (data.find(d => d.name === "Cảnh báo") || { value: 0 }).value;
    
    let label = "AN TOÀN";
    let color = "#1f9d55";
    if (highVal > 0) {
      label = "NGUY HIỂM";
      color = "#c53030";
    } else if (warnVal > 0) {
      label = "CẢNH BÁO";
      color = "#d97706";
    }
    
    ctx.fillStyle = color;
    ctx.font = "bold 13px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, centerY - 7);
    
    ctx.fillStyle = "#6b829c";
    ctx.font = "10px Segoe UI";
    ctx.fillText(`${total} sự cố`, centerX, centerY + 8);
  }

  /* ============================================================
   *  VIEWS
   * ============================================================ */

  /* ---- Tổng quan ---- */
  async function viewOverview() {
    setHeader("Tổng quan", "Số liệu tổng hợp toàn hệ thống chuỗi lạnh.");
    setLoading();
    try {
      const s = await Api.stats();
      clear(view);
      const cards = [
        { label: "Chuyến hàng", value: s.totalShipments, ico: "▣", foot: "Tổng số lô hàng đang quản lý", accent: false },
        { label: "Thiết bị hoạt động", value: s.activeDevices, ico: "▤", foot: "ESP32 đã provisioning & ACTIVE", accent: true },
        { label: "Mã kích hoạt chưa dùng", value: s.unusedVerifyCodes, ico: "⌗", foot: "Verify code còn hiệu lực", accent: false },
        { label: "Cảnh báo", value: s.totalAlerts, ico: "⚠", foot: "Tổng số alert đã ghi nhận", accent: false },
      ];
      view.appendChild(h("div", { class: "kpi-grid" }, cards.map((c) =>
        h("div", { class: "kpi" + (c.accent ? " accent" : "") }, [
          h("span", { class: "kpi-ico" }, c.ico),
          h("div", { class: "kpi-label" }, c.label),
          h("div", { class: "kpi-value" }, String(c.value != null ? c.value : "—")),
          h("div", { class: "kpi-foot" }, c.foot),
        ])
      )));

      view.appendChild(h("div", { class: "panel" }, [
        h("div", { class: "panel-title" }, "Luồng nghiệp vụ"),
        h("p", { class: "page-sub", style: "margin-top:10px;line-height:1.7" }, ""),
        h("ol", { style: "margin:0;padding-left:18px;color:#355a79;font-size:14px;line-height:1.9" }, [
          h("li", null, "Giai đoạn 1 — Tạo chuyến hàng & sinh mã kích hoạt (tab Chuyến hàng, Mã kích hoạt)."),
          h("li", null, "Giai đoạn 2 — ESP32 dùng verify code để provisioning, xuất hiện ở tab Thiết bị."),
          h("li", null, "Giai đoạn 3 — Thiết bị gửi telemetry (nhiệt độ, độ ẩm, GPS, pin, RSSI); xem ở tab Giám sát."),
        ]),
      ]));
    } catch (err) { showError(err); }
  }

  /* ---- Chuyến hàng ---- */
  async function viewShipments() {
    setHeader("Chuyến hàng", "Tạo lô hàng và thiết lập ngưỡng nhiệt độ / độ ẩm cho phép.");
    setLoading();
    try {
      const list = await Api.listShipments();
      clear(view);

      const tableHost = h("div");
      const count = h("small", null, list.length + " lô");
      const render = (q) => {
        const rows = list.filter((s) => matches([s.shipmentCode, s.itemType, s.status], q));
        count.textContent = (q ? rows.length + "/" + list.length : list.length) + " lô";
        clear(tableHost); tableHost.appendChild(shipmentsTable(rows));
      };

      view.appendChild(h("div", { class: "grid-2" }, [
        // bảng danh sách
        h("div", { class: "panel" }, [
          h("div", { class: "panel-head" }, [
            h("div", { class: "panel-title" }, ["Danh sách chuyến hàng ", count]),
            searchBox("Tìm mã / loại hàng / trạng thái…", render),
          ]),
          tableHost,
        ]),
        // form tạo
        h("div", { class: "panel" }, [
          h("div", { class: "panel-title" }, "Tạo chuyến hàng mới"),
          shipmentForm(),
        ]),
      ]));
      render("");
    } catch (err) { showError(err); }
  }

  function shipmentsTable(list) {
    if (!list.length) return h("div", { class: "empty" }, "Chưa có chuyến hàng nào.");
    return h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Mã", "Loại hàng", "Nhiệt độ (°C)", "Độ ẩm (%)", "Trạng thái", "Tạo lúc", "Hành động"].map((t) => h("th", null, t)))),
      h("tbody", null, list.map((s) => h("tr", null, [
        h("td", null, h("span", { class: "mono" }, s.shipmentCode)),
        h("td", null, s.itemType),
        h("td", null, `${num(s.minTemperature)} ÷ ${num(s.maxTemperature)}`),
        h("td", null, `${num(s.minHumidity)} ÷ ${num(s.maxHumidity)}`),
        h("td", null, statusBadge(s.status)),
        h("td", null, fmtDateTime(s.createdAt)),
        h("td", null, s.status === 'ACTIVE' ? h("button", {
            class: "btn btn-ghost",
            style: "font-size: 11px; padding: 2px 6px;",
            onclick: async () => {
                if (confirm("Chắc chắn kết thúc chuyến hàng " + s.shipmentCode + "? Thiết bị sẽ không thể gửi thêm dữ liệu.")) {
                    try {
                        await Api.updateShipmentStatus(s.shipmentCode, "COMPLETED");
                        toast("Đã kết thúc chuyến hàng", "ok");
                        viewShipments();
                    } catch (err) {
                        toast("Lỗi: " + (err.message || err), "err");
                    }
                }
            }
        }, "Kết thúc") : "")
      ]))),
    ]));
  }

  function shipmentForm() {
    const f = (name, label, attrs) => h("div", { class: "field" }, [
      h("label", null, label),
      h("input", Object.assign({ name }, attrs)),
    ]);
    const form = h("form", { class: "" }, [
      h("div", { class: "form-grid" }, [
        h("div", { class: "field full" }, [h("label", null, "Mã chuyến hàng *"), h("input", { name: "shipmentCode", placeholder: "VD: SHIP-456", required: "required", maxlength: "64" })]),
        h("div", { class: "field full" }, [h("label", null, "Loại hàng *"), h("input", { name: "itemType", placeholder: "VD: Vaccine COVID-19", required: "required", maxlength: "255" })]),
        f("minTemperature", "Nhiệt độ tối thiểu (°C)", { type: "number", step: "0.1", value: "-22", required: "required" }),
        f("maxTemperature", "Nhiệt độ tối đa (°C)", { type: "number", step: "0.1", value: "-18", required: "required" }),
        f("minHumidity", "Độ ẩm tối thiểu (%)", { type: "number", step: "0.1", min: "0", max: "100", value: "40", required: "required" }),
        f("maxHumidity", "Độ ẩm tối đa (%)", { type: "number", step: "0.1", min: "0", max: "100", value: "80", required: "required" }),
      ]),
      h("div", { class: "form-actions" }, [
        h("button", { type: "submit", class: "btn btn-primary" }, "Tạo chuyến hàng"),
      ]),
    ]);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const data = Object.fromEntries(new FormData(form).entries());
      const payload = {
        shipmentCode: data.shipmentCode.trim(),
        itemType: data.itemType.trim(),
        minTemperature: Number(data.minTemperature),
        maxTemperature: Number(data.maxTemperature),
        minHumidity: Number(data.minHumidity),
        maxHumidity: Number(data.maxHumidity),
      };
      if (payload.minTemperature > payload.maxTemperature) { toast("Nhiệt độ tối thiểu phải ≤ tối đa.", "err"); return; }
      if (payload.minHumidity > payload.maxHumidity) { toast("Độ ẩm tối thiểu phải ≤ tối đa.", "err"); return; }
      btn.disabled = true;
      try {
        await Api.createShipment(payload);
        toast("Đã tạo chuyến hàng " + payload.shipmentCode, "ok");
        viewShipments();
      } catch (err) {
        toast(err instanceof Api.ApiError ? err.message : "Tạo thất bại", "err");
        btn.disabled = false;
      }
    });
    return form;
  }

  /* ---- Mã kích hoạt ---- */
  async function viewCodes() {
    setHeader("Mã kích hoạt", "Sinh & quản lý verify code cấp cho thiết bị ESP32 (Giai đoạn 1).");
    setLoading();
    try {
      const [shipments, codes] = await Promise.all([Api.listShipments(), Api.listVerifyCodes()]);
      clear(view);

      const resultBox = h("div");

      // ----- danh sách verify code (phải) -----
      let codesData = codes, curQuery = "", curStatus = "ALL";
      const listHost = h("div");
      const count = h("small", null, codes.length + " mã");
      const renderList = () => {
        const rows = codesData.filter((c) =>
          (curStatus === "ALL" || codeDisplayStatus(c) === curStatus) &&
          matches([c.verifyCode, c.shipmentCode, codeDisplayStatus(c), c.usedByDeviceId], curQuery));
        count.textContent = (curQuery || curStatus !== "ALL" ? rows.length + "/" + codesData.length : codesData.length) + " mã";
        clear(listHost); listHost.appendChild(verifyCodesTable(rows));
      };
      const reload = async () => { try { codesData = await Api.listVerifyCodes(); renderList(); } catch (_) {} };

      const filterBtns = ["ALL", "UNUSED", "USED", "EXPIRED"].map((st) => {
        const b = h("button", { class: "tab-btn" + (st === "ALL" ? " active" : "") }, st === "ALL" ? "Tất cả" : st);
        b.addEventListener("click", () => { curStatus = st; filterBtns.forEach((x) => x.classList.remove("active")); b.classList.add("active"); renderList(); });
        return b;
      });

      // ----- form sinh mã (trái) -----
      const select = h("select", { name: "shipmentCode", required: "required" },
        shipments.length
          ? shipments.map((s) => h("option", { value: s.shipmentCode }, `${s.shipmentCode} — ${s.itemType}`))
          : [h("option", { value: "" }, "(chưa có chuyến hàng)")]);

      const form = h("form", null, [
        h("div", { class: "form-grid" }, [
          h("div", { class: "field full" }, [h("label", null, "Chuyến hàng *"), select]),
          h("div", { class: "field" }, [h("label", null, "Hết hạn sau (ngày)"), h("input", { name: "expiresInDays", type: "number", min: "1", value: "7" }), h("span", { class: "hint" }, "Mặc định 7 ngày nếu để trống.")]),
        ]),
        h("div", { class: "form-actions" }, [h("button", { type: "submit", class: "btn btn-blue" }, "⌗ Sinh mã kích hoạt")]),
      ]);
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.shipmentCode) { toast("Hãy tạo chuyến hàng trước.", "err"); return; }
        const payload = { shipmentCode: data.shipmentCode };
        if (data.expiresInDays) payload.expiresInDays = Number(data.expiresInDays);
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
          const vc = await Api.generateCode(payload);
          renderCodeResult(resultBox, vc);
          toast("Đã sinh mã " + vc.verifyCode, "ok");
          await reload();
        } catch (err) {
          toast(err instanceof Api.ApiError ? err.message : "Sinh mã thất bại", "err");
        } finally { btn.disabled = false; }
      });

      view.appendChild(h("div", { class: "grid-2" }, [
        h("div", { class: "panel" }, [
          h("div", { class: "panel-title" }, "Sinh mã mới"),
          form,
          resultBox,
          h("p", { class: "page-sub", style: "margin-top:12px" }, "Nhập mã vào Web Portal của ESP32 (bước Verify) để hoàn tất provisioning."),
        ]),
        h("div", { class: "panel" }, [
          h("div", { class: "panel-head" }, [
            h("div", { class: "panel-title" }, ["Danh sách mã kích hoạt ", count]),
            searchBox("Tìm mã / chuyến hàng / thiết bị…", (q) => { curQuery = q; renderList(); }),
          ]),
          h("div", { class: "tabs", style: "margin-bottom:12px" }, filterBtns),
          listHost,
        ]),
      ]));
      renderList();
    } catch (err) { showError(err); }
  }

  // UNUSED nhưng đã quá hạn -> hiển thị EXPIRED cho đúng thực tế.
  function codeDisplayStatus(c) {
    if (c.status === "UNUSED" && c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return "EXPIRED";
    return c.status;
  }

  function verifyCodesTable(list) {
    if (!list.length) return h("div", { class: "empty" }, "Không có mã phù hợp.");
    return h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Mã", "Chuyến hàng", "Trạng thái", "Hết hạn", "Dùng bởi"].map((t) => h("th", null, t)))),
      h("tbody", null, list.map((c) => h("tr", null, [
        h("td", null, h("span", { class: "mono" }, c.verifyCode)),
        h("td", null, h("span", { class: "mono" }, c.shipmentCode)),
        h("td", null, statusBadge(codeDisplayStatus(c))),
        h("td", null, fmtDateTime(c.expiresAt)),
        h("td", null, c.usedByDeviceId ? h("span", { class: "mono" }, short(c.usedByDeviceId, 14)) : "—"),
      ]))),
    ]));
  }

  function renderCodeResult(box, vc) {
    clear(box);
    box.appendChild(h("div", { class: "code-result" }, [
      h("div", { class: "meta" }, "Mã kích hoạt cho " + vc.shipmentCode),
      h("div", { class: "code" }, vc.verifyCode),
      h("div", { class: "meta" }, "Trạng thái: " + (vc.status || "UNUSED") + " · Hết hạn: " + fmtDateTime(vc.expiresAt)),
      h("button", {
        class: "btn btn-ghost", style: "margin-top:12px",
        onclick: () => { navigator.clipboard && navigator.clipboard.writeText(vc.verifyCode); toast("Đã copy mã.", "ok"); },
      }, "⧉ Copy mã"),
    ]));
  }

  /* ---- Thiết bị ---- */
  async function viewDevices() {
    setHeader("Thiết bị", "Các ESP32 đã provisioning thành công (Giai đoạn 2).");
    setLoading();
    try {
      const list = await Api.listDevices();
      clear(view);
      const tableHost = h("div");
      const count = h("small", null, list.length + " thiết bị");
      const render = (q) => {
        const rows = list.filter((d) => matches([d.deviceId, d.shipmentCode, d.status, d.signatureAlgorithm], q));
        count.textContent = (q ? rows.length + "/" + list.length : list.length) + " thiết bị";
        clear(tableHost); tableHost.appendChild(devicesTable(rows));
      };
      view.appendChild(h("div", { class: "panel" }, [
        h("div", { class: "panel-head" }, [
          h("div", { class: "panel-title" }, ["Thiết bị đã đăng ký ", count]),
          searchBox("Tìm device id / chuyến hàng / trạng thái…", render),
        ]),
        tableHost,
      ]));
      render("");
    } catch (err) { showError(err); }
  }

  function devicesTable(list) {
    if (!list.length) return h("div", { class: "empty" }, "Không có thiết bị phù hợp. (Nạp firmware ESP32 + nhập verify code để provisioning.)");
    return h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Device ID", "Chuyến hàng", "Thuật toán ký", "Trạng thái", "Đăng ký", "Lần cuối online"].map((t) => h("th", null, t)))),
      h("tbody", null, list.map((d) => h("tr", null, [
        h("td", null, h("span", { class: "mono" }, d.deviceId)),
        h("td", null, h("span", { class: "mono" }, d.shipmentCode)),
        h("td", null, h("span", { class: "badge badge-info" }, d.signatureAlgorithm || "—")),
        h("td", null, statusBadge(d.status)),
        h("td", null, fmtDateTime(d.createdAt)),
        h("td", null, [relTime(d.lastSeenAt), h("div", { class: "page-sub", style: "font-size:11px" }, d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "")]),
      ]))),
    ]));
  }

  /* ---- Giám sát (telemetry + GPS + cảnh báo) ---- */
  let monitorState = { code: null, shellFor: null, refs: null, gpsTab: "canvas", gpsMap: null, gpsRouteLayer: null, lastCoords: [], gpsFitted: false, roadRoute: null, roadRouteKey: null, roadRouteFetching: null };

  async function viewMonitor() {
    setHeader("Giám sát", "Telemetry thời gian thực: nhiệt độ, độ ẩm, định vị GPS, pin, tín hiệu & cảnh báo.");
    setLoading();
    let shipments;
    try { shipments = await Api.listShipments(); }
    catch (err) { showError(err); return; }

    if (!shipments.length) {
      clear(view);
      view.appendChild(h("div", { class: "empty panel" }, "Chưa có chuyến hàng để giám sát. Hãy tạo ở tab Chuyến hàng."));
      return;
    }
    if (!monitorState.code || !shipments.some((s) => s.shipmentCode === monitorState.code)) {
      monitorState.code = shipments[0].shipmentCode;
    }
    monitorState.shellFor = null; // dựng lại shell khi vào màn

    clear(view);
    const select = h("select", null, []);
    const fillOptions = (q) => {
      const opts = shipments.filter((s) => matches([s.shipmentCode, s.itemType], q));
      const list = opts.length ? opts : shipments;
      clear(select);
      list.forEach((s) => select.appendChild(h("option", { value: s.shipmentCode }, `${s.shipmentCode} — ${s.itemType}`)));
      if (!list.some((s) => s.shipmentCode === monitorState.code)) {
        monitorState.code = list[0].shipmentCode;
        monitorState.shellFor = null;
        loadMonitorData(shipments);
      }
      select.value = monitorState.code;
    };
    fillOptions("");
    select.addEventListener("change", () => { monitorState.code = select.value; monitorState.shellFor = null; loadMonitorData(shipments); });

    view.appendChild(h("div", { class: "panel" }, [
      h("div", { class: "panel-head" }, [
        h("div", { class: "toolbar" }, [
          h("label", { style: "font-weight:700;color:#355a79;font-size:13px" }, "Chuyến hàng:"),
          select,
          searchBox("Lọc chuyến hàng…", fillOptions),
        ]),
        h("span", { class: "auto-tag" }, [h("span", { class: "pulse" }), "Tự động làm mới mỗi 5 giây"]),
      ]),
      h("div", { id: "monitorBody" }, h("div", { class: "loading" }, "Đang tải telemetry…")),
    ]));

    loadMonitorData(shipments);
    clearInterval(monitorTimer);
    monitorTimer = setInterval(() => loadMonitorData(shipments, true), 5000);
  }

  async function loadMonitorData(shipments, silent) {
    const code = monitorState.code;
    const body = document.getElementById("monitorBody");
    if (!body) return;
    const ship = shipments.find((s) => s.shipmentCode === code) || {};
    try {
      const [tele, alerts] = await Promise.all([Api.telemetry(code), Api.alerts(code)]);
      if (monitorState.shellFor !== code) { buildMonitorShell(body, ship); monitorState.shellFor = code; }
      updateMonitorData(ship, tele, alerts);
    } catch (err) {
      if (!silent) { clear(body); monitorState.shellFor = null; body.appendChild(h("div", { class: "empty" }, err instanceof Api.ApiError ? err.message : "Lỗi tải dữ liệu")); }
    }
  }

  // Dựng khung 1 lần / chuyến hàng để tab Bản đồ & lựa chọn tab không bị reset mỗi 5 giây.
  function buildMonitorShell(body, ship) {
    clear(body);
    if (monitorState.gpsMap) { try { monitorState.gpsMap.remove(); } catch (_) {} }
    monitorState.gpsMap = null; monitorState.gpsRouteLayer = null; monitorState.gpsFitted = false;
    monitorState.roadRoute = null; monitorState.roadRouteKey = null; monitorState.roadRouteFetching = null;
    monitorState.hoveredIndex = null;

    const band = (ship.minTemperature != null && ship.maxTemperature != null)
      ? {
          min: Number(ship.minTemperature),
          max: Number(ship.maxTemperature),
          minHum: ship.minHumidity != null ? Number(ship.minHumidity) : null,
          maxHum: ship.maxHumidity != null ? Number(ship.maxHumidity) : null
        } : null;

    const warnHost = h("div");
    const metricsHost = h("div", { class: "metric-row" });

    const chartCanvas = h("canvas");
    const chartPanel = h("div", { class: "panel", style: "margin-top:16px;box-shadow:none;border-color:#eef2f7" }, [
      h("div", { class: "panel-title" }, ["Biểu đồ nhiệt độ & độ ẩm ", h("small", null, band ? `ngưỡng cho phép ${band.min}÷${band.max}°C` : "")]),
      h("div", { class: "chart-wrap" }, chartCanvas),
      h("div", { class: "legend" }, [h("span", { class: "l-temp" }, "Nhiệt độ (°C)"), h("span", { class: "l-hum" }, "Độ ẩm (%)"), h("span", { style: "color:#c53030" }, "● Vi phạm ngưỡng"), h("span", { style: "color:#c53030" }, "◯ Bị sửa đổi")]),
    ]);

    // GPS panel: 2 tab (Sơ đồ offline / Bản đồ OpenStreetMap)
    const canvasMapEl = h("canvas");
    const leafletEl = h("div", { class: "map-leaflet" });
    const dirBtnHost = h("div");
    const canvasPane = h("div", { class: "tab-pane" + (monitorState.gpsTab === "canvas" ? " active" : "") }, [h("div", { class: "chart-wrap", style: "height:440px" }, canvasMapEl)]);
    const mapPane = h("div", { class: "tab-pane" + (monitorState.gpsTab === "map" ? " active" : "") }, [leafletEl, h("div", { class: "map-note" }, "Bản đồ OpenStreetMap — lộ trình bám đường thật (OSRM). Đường nét đứt = nối thẳng tạm khi chưa định tuyến xong / offline.")]);

    const tabCanvasBtn = h("button", { class: "tab-btn" + (monitorState.gpsTab === "canvas" ? " active" : "") }, "Sơ đồ");
    const tabMapBtn = h("button", { class: "tab-btn" + (monitorState.gpsTab === "map" ? " active" : "") }, "Bản đồ");
    const setTab = (t) => {
      monitorState.gpsTab = t;
      tabCanvasBtn.classList.toggle("active", t === "canvas");
      tabMapBtn.classList.toggle("active", t === "map");
      canvasPane.classList.toggle("active", t === "canvas");
      mapPane.classList.toggle("active", t === "map");
      if (t === "map") ensureLeafletMap(leafletEl);
    };
    tabCanvasBtn.addEventListener("click", () => setTab("canvas"));
    tabMapBtn.addEventListener("click", () => setTab("map"));

    const gpsPanel = h("div", { class: "panel", style: "box-shadow:none;border-color:#eef2f7" }, [
      h("div", { class: "panel-head" }, [h("div", { class: "panel-title" }, "Lộ trình GPS"), h("div", { class: "tabs" }, [tabCanvasBtn, tabMapBtn])]),
      canvasPane, mapPane, dirBtnHost,
    ]);

    // Risk Panel
    const riskCanvas = h("canvas");
    const riskPanel = h("div", { class: "panel", style: "box-shadow:none;border-color:#eef2f7;margin-top:0;" }, [
      h("div", { class: "panel-title" }, "Phân tích nguy cơ"),
      h("div", { class: "chart-wrap", style: "height:140px; margin-top:8px;" }, riskCanvas),
      h("div", { class: "legend", style: "justify-content:center; margin-top:8px;" }, [
        h("span", { class: "l-high-risk" }, "Nguy cơ cao"),
        h("span", { class: "l-warn-risk" }, "Cảnh báo"),
        h("span", { class: "l-ok-risk" }, "An toàn"),
      ])
    ]);

    const alertsCount = h("small", null, "0 mục");
    const alertsHost = h("div");
    const alertsPanel = h("div", { class: "panel", style: "box-shadow:none;border-color:#eef2f7;margin-top:0;" }, [
      h("div", { class: "panel-title" }, ["Cảnh báo ", alertsCount]), alertsHost,
    ]);

    const tableCount = h("small", null, "0 bản ghi");
    const tableHost = h("div");
    const tablePanel = h("div", { class: "panel", style: "margin-top:16px;box-shadow:none;border-color:#eef2f7" }, [
      h("div", { class: "panel-title" }, ["Bản ghi telemetry ", tableCount]), tableHost,
    ]);

    // Thêm mousemove listener cho chart
    chartCanvas.addEventListener("mousemove", (e) => {
      const rect = chartCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const W = chartCanvas.clientWidth;
      const padL = 42, padR = 42;
      const plotW = W - padL - padR;
      const curTele = monitorState.lastTele || [];
      if (!curTele.length) return;
      const points = curTele.slice().reverse(); // ASC order
      if (mouseX >= padL && mouseX <= W - padR) {
        const hoveredIdx = Math.round(((mouseX - padL) * (points.length - 1)) / plotW);
        if (hoveredIdx >= 0 && hoveredIdx < points.length) {
          monitorState.hoveredIndex = hoveredIdx;
          const series = points.map((t) => ({ t: t.temperature != null ? Number(t.temperature) : null, h: t.humidity != null ? Number(t.humidity) : null, bad: !!t.tampered }));
          drawTimeSeries(chartCanvas, series, band, hoveredIdx);
          showTooltip(e, points[hoveredIdx], rect);
          return;
        }
      }
      hideTooltip();
      const series = points.map((t) => ({ t: t.temperature != null ? Number(t.temperature) : null, h: t.humidity != null ? Number(t.humidity) : null, bad: !!t.tampered }));
      drawTimeSeries(chartCanvas, series, band, null);
    });

    chartCanvas.addEventListener("mouseleave", () => {
      monitorState.hoveredIndex = null;
      hideTooltip();
      const curTele = monitorState.lastTele || [];
      if (curTele.length) {
        const points = curTele.slice().reverse();
        const series = points.map((t) => ({ t: t.temperature != null ? Number(t.temperature) : null, h: t.humidity != null ? Number(t.humidity) : null, bad: !!t.tampered }));
        drawTimeSeries(chartCanvas, series, band, null);
      }
    });

    body.appendChild(warnHost);
    body.appendChild(metricsHost);
    body.appendChild(chartPanel);

    const rightCol = h("div", { style: "display:flex; flex-direction:column; gap:16px;" }, [riskPanel, alertsPanel]);
    body.appendChild(h("div", { class: "grid-2", style: "margin-top:16px" }, [gpsPanel, rightCol]));
    body.appendChild(tablePanel);

    monitorState.refs = { band, warnHost, metricsHost, chartCanvas, canvasMapEl, leafletEl, dirBtnHost, alertsHost, alertsCount, tableHost, tableCount, riskCanvas };
    if (monitorState.gpsTab === "map") ensureLeafletMap(leafletEl);
  }

  function updateMonitorData(ship, tele, alerts) {
    const r = monitorState.refs; if (!r) return;
    monitorState.lastTele = tele;
    const asc = tele.slice().reverse(); // DESC -> ASC theo thời gian
    const latest = tele[0];
    const band = r.band;

    // Phân tích nguy cơ
    const totalRecords = tele.length;
    const highRisk = tele.filter(t => t.tampered || (band && (t.temperature < band.min || t.temperature > band.max))).length;
    const warnRisk = tele.filter(t => {
      if (t.tampered || (band && (t.temperature < band.min || t.temperature > band.max))) return false;
      return (band && (band.minHum != null && band.maxHum != null && (t.humidity < band.minHum || t.humidity > band.maxHum))) ||
             (t.battery != null && t.battery < 20) ||
             (t.rssi != null && t.rssi < -85);
    }).length;
    const safeRecords = Math.max(0, totalRecords - highRisk - warnRisk);

    const riskData = [
      { name: "Nguy cơ cao", value: highRisk, color: "#c53030" },
      { name: "Cảnh báo", value: warnRisk, color: "#d97706" },
      { name: "An toàn", value: safeRecords, color: "#1f9d55" }
    ];

    if (r.riskCanvas) {
      requestAnimationFrame(() => drawDoughnutChart(r.riskCanvas, riskData));
    }

    // metrics
    clear(r.metricsHost);
    const tempDanger = latest && band && (Number(latest.temperature) < band.min || Number(latest.temperature) > band.max);
    const m = (label, value, unit, danger) => h("div", { class: "metric" }, [
      h("div", { class: "m-label" }, label),
      h("div", { class: "m-value", style: danger ? "color:#c53030" : "" }, [String(value), unit ? h("span", { class: "m-unit" }, " " + unit) : null]),
    ]);
    [
      m("Nhiệt độ", latest ? num(latest.temperature) : "—", "°C", tempDanger),
      m("Độ ẩm", latest ? num(latest.humidity) : "—", "%"),
      m("Pin", latest ? num(latest.battery, 0) : "—", "%"),
      m("Tín hiệu", latest ? num(latest.rssi, 0) : "—", "dBm"),
      m("Vị trí", latest ? `${num(latest.lat, 4)}, ${num(latest.lng, 4)}` : "—", ""),
    ].forEach((x) => r.metricsHost.appendChild(x));

    // banner cảnh báo sửa đổi
    const tamperedCount = tele.filter((t) => t.tampered).length;
    clear(r.warnHost);
    if (tamperedCount > 0) {
      r.warnHost.appendChild(h("div", { class: "tamper-banner" }, [
        h("span", null, "⚠"),
        h("span", null, `Phát hiện ${tamperedCount}/${tele.length} bản ghi telemetry bị sửa đổi — hash/chữ ký tính lại không khớp. Các điểm và dòng tương ứng được tô đỏ.`),
      ]));
    }

    // chart (đánh dấu điểm bị sửa đổi)
    const series = asc.map((t) => ({ t: t.temperature != null ? Number(t.temperature) : null, h: t.humidity != null ? Number(t.humidity) : null, bad: !!t.tampered }));
    requestAnimationFrame(() => drawTimeSeries(r.chartCanvas, series, band, monitorState.hoveredIndex));

    // GPS: canvas + leaflet + nút Google
    const coords = asc.map((t) => ({ lat: t.lat != null ? Number(t.lat) : null, lng: t.lng != null ? Number(t.lng) : null }));
    monitorState.lastCoords = coords;
    requestAnimationFrame(() => drawGpsTrack(r.canvasMapEl, coords));
    updateGpsMap();
    clear(r.dirBtnHost);
    const valid = coords.filter((c) => c.lat != null && c.lng != null);
    if (valid.length) r.dirBtnHost.appendChild(h("a", { href: googleDirUrl(valid), target: "_blank", rel: "noopener", class: "btn btn-ghost", style: "margin-top:10px" }, "🌍 Mở lộ trình trên Google Maps"));

    // alerts
    clear(r.alertsHost);
    r.alertsCount.textContent = alerts.length + " mục";
    if (alerts.length) alerts.slice(0, 12).forEach((a) => r.alertsHost.appendChild(h("div", { class: "alert-item" }, [
      h("div", { class: "alert-ico" }, a.level === "HIGH" ? "🔴" : a.level === "WARNING" ? "🟠" : "🔵"),
      h("div", { class: "alert-body" }, [
        h("div", { class: "alert-msg" }, a.message),
        h("div", { class: "alert-meta" }, [a.type, " · ", a.deviceId || "—", " · ", fmtDateTime(a.createdAt)]),
      ]),
      levelBadge(a.level),
    ])));
    else r.alertsHost.appendChild(h("div", { class: "empty" }, "Không có cảnh báo. Dữ liệu trong ngưỡng an toàn ✔"));

    // bảng telemetry + hash chain
    clear(r.tableHost);
    r.tableCount.textContent = tele.length + " bản ghi · hash chain chống sửa đổi";
    if (tele.length) r.tableHost.appendChild(h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Thời gian", "Device", "Nhiệt độ", "Độ ẩm", "Pin", "RSSI", "GPS", "Record hash", "Toàn vẹn"].map((t) => h("th", null, t)))),
      h("tbody", null, tele.slice(0, 30).map((t) => h("tr", { class: t.tampered ? "row-tampered" : "" }, [
        h("td", null, fmtEpoch(t.device_timestamp)),
        h("td", null, h("span", { class: "mono" }, short(t.device_id, 10))),
        h("td", null, num(t.temperature) + "°C"),
        h("td", null, num(t.humidity) + "%"),
        h("td", null, num(t.battery, 0) + "%"),
        h("td", null, num(t.rssi, 0)),
        h("td", null, h("span", { class: "mono" }, `${num(t.lat, 4)}, ${num(t.lng, 4)}`)),
        h("td", null, h("span", { class: "mono hash", title: t.record_hash }, short(t.record_hash, 14))),
        h("td", null, t.tampered
          ? h("span", { class: "badge badge-tamper", title: tamperTitle(t.integrity_issues) }, "⚠ Đã sửa")
          : h("span", { class: "badge badge-intact" }, "✔ OK")),
      ]))),
    ])));
    else r.tableHost.appendChild(h("div", { class: "empty" }, "Chưa có telemetry. Thiết bị sẽ gửi dữ liệu sau khi provisioning."));
  }

  // Khởi tạo bản đồ Leaflet 1 lần rồi tái sử dụng (cập nhật lộ trình qua updateGpsMap).
  function ensureLeafletMap(el) {
    if (monitorState.gpsMap) { setTimeout(() => { try { monitorState.gpsMap.invalidateSize(); } catch (_) {} }, 60); updateGpsMap(); return; }
    loadLeaflet().then((L) => {
      if (monitorState.refs && monitorState.refs.leafletEl !== el) return; // shell đã đổi
      const map = L.map(el).setView([10.7769, 106.7009], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      // Ghi đè nhãn 2 quần đảo Hoàng Sa, Trường Sa của Việt Nam.
      VN_ISLANDS.forEach((isl) => {
        L.marker([isl.lat, isl.lng], { icon: L.divIcon({ className: "", html: "🇻🇳", iconSize: [22, 22] }) })
          .addTo(map)
          .bindTooltip(isl.name, { permanent: true, direction: "top", className: "vn-island-label", offset: [0, -6] });
      });
      monitorState.gpsMap = map;
      monitorState.gpsRouteLayer = L.layerGroup().addTo(map);
      monitorState.gpsFitted = false; // fit khung 1 lần cho dataset hiện tại
      setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 60);
      updateGpsMap();
    }).catch(() => {
      el.innerHTML = "";
      el.appendChild(h("div", { class: "map-fallback" }, "Không tải được bản đồ trực tuyến (cần internet). Hãy dùng tab \"Sơ đồ\" để xem lộ trình offline, hoặc nút Google Maps bên dưới."));
    });
  }

  function updateGpsMap() {
    const map = monitorState.gpsMap, L = window.L, layer = monitorState.gpsRouteLayer;
    if (!map || !L || !layer) return;
    const coords = (monitorState.lastCoords || []).filter((c) => c.lat != null && c.lng != null);
    layer.clearLayers();
    if (!coords.length) return;
    const latlngs = coords.map((c) => [c.lat, c.lng]);

    // Key theo (số điểm + điểm đầu + điểm cuối) để chỉ gọi định tuyến lại khi lộ trình đổi.
    const key = coords.length + ":" + latlngs[0].join(",") + ":" + latlngs[latlngs.length - 1].join(",");
    if (monitorState.roadRouteKey === key && monitorState.roadRoute) {
      // Lộ trình bám đường thật (OSRM).
      L.polyline(monitorState.roadRoute, { color: "#1d6f8d", weight: 5, opacity: 0.9 }).addTo(layer);
    } else {
      // Chưa có route: vẽ tạm đường nối thẳng (nét đứt) và gọi OSRM 1 lần cho key này.
      L.polyline(latlngs, { color: "#1d6f8d", weight: 3, opacity: 0.45, dashArray: "6 7" }).addTo(layer);
      if (monitorState.roadRouteFetching !== key) {
        monitorState.roadRouteFetching = key;
        fetchRoadRoute(coords)
          .then((route) => {
            monitorState.roadRoute = route; monitorState.roadRouteKey = key; monitorState.roadRouteFetching = null;
            updateGpsMap();
          })
          .catch(() => { monitorState.roadRouteFetching = null; /* giữ đường thẳng làm fallback */ });
      }
    }

    L.circleMarker(latlngs[0], { radius: 6, color: "#1f9d55", fillColor: "#1f9d55", fillOpacity: 1, weight: 2 }).bindTooltip("Xuất phát").addTo(layer);
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 8, color: "#fff", weight: 2, fillColor: "#e65f2b", fillOpacity: 1 }).bindTooltip("Vị trí hiện tại").addTo(layer);

    // Chỉ tự căn khung 1 lần; sau đó giữ nguyên zoom/pan của người dùng khi auto-refresh.
    if (!monitorState.gpsFitted) {
      try { map.fitBounds(L.latLngBounds(latlngs).pad(0.25)); monitorState.gpsFitted = true; } catch (_) {}
    }
  }

  // Gọi OSRM (định tuyến mở, miễn phí, không cần key) để lấy lộ trình bám đường thật.
  async function fetchRoadRoute(coords) {
    const MAX = 25; // OSRM demo: giới hạn waypoint -> lấy mẫu đều, luôn giữ điểm đầu/cuối.
    let pts = coords;
    if (coords.length > MAX) {
      pts = [];
      const step = (coords.length - 1) / (MAX - 1);
      for (let i = 0; i < MAX; i++) pts.push(coords[Math.round(i * step)]);
    }
    const coordStr = pts.map((c) => `${c.lng},${c.lat}`).join(";"); // OSRM dùng thứ tự lng,lat
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM " + res.status);
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error("no route");
    return data.routes[0].geometry.coordinates.map((p) => [p[1], p[0]]); // [lng,lat] -> [lat,lng]
  }

  // Tạo URL chỉ đường Google Maps qua các waypoint (lấy tối đa ~10 điểm để vẽ lộ trình).
  function googleDirUrl(coords) {
    let pts = coords;
    if (coords.length > 10) {
      pts = [];
      const step = (coords.length - 1) / 9;
      for (let i = 0; i < 10; i++) pts.push(coords[Math.round(i * step)]);
    }
    return "https://www.google.com/maps/dir/" + pts.map((c) => `${c.lat},${c.lng}`).join("/");
  }

  /* ============================================================
   *  Router
   * ============================================================ */
  const routes = {
    overview: viewOverview,
    shipments: viewShipments,
    codes: viewCodes,
    devices: viewDevices,
    monitor: viewMonitor,
  };

  function setHeader(title, sub) { pageTitle.textContent = title; pageSub.textContent = sub; }

  function currentRoute() {
    const hash = (location.hash || "#/overview").replace(/^#\//, "");
    return routes[hash] ? hash : "overview";
  }

  function navTo() {
    clearInterval(monitorTimer); monitorTimer = null;
    const route = currentRoute();
    document.querySelectorAll(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
    routes[route]();
  }

  refreshBtn.addEventListener("click", navTo);
  window.addEventListener("hashchange", navTo);

  /* ---- backend status ping ---- */
  async function pingBackend() {
    const dot = document.querySelector("#beStatus .dot");
    const txt = document.getElementById("beStatusText");
    try {
      await Api.stats();
      dot.className = "dot dot-ok"; txt.textContent = "Backend kết nối OK";
    } catch (_) {
      dot.className = "dot dot-err"; txt.textContent = "Mất kết nối backend";
    }
  }

  // init
  if (!location.hash) location.hash = "#/overview";
  navTo();
  pingBackend();
  setInterval(pingBackend, 15000);
})();
