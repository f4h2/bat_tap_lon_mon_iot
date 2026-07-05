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
  // Nhãn thời gian ngắn cho trục X biểu đồ. withDate=true khi khoảng thời gian vượt 1 ngày.
  function fmtClock(sec, withDate) {
    if (sec == null) return "";
    const d = new Date(Number(sec) * 1000);
    const p = (n) => String(n).padStart(2, "0");
    const hm = p(d.getHours()) + ":" + p(d.getMinutes());
    return withDate ? p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + hm : hm + ":" + p(d.getSeconds());
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

  function btn(label, cls, onClick) {
    const b = h("button", { class: "btn " + cls }, label);
    b.addEventListener("click", () => onClick(b));
    return b;
  }
  function kpiCard(label, value, foot, danger) {
    return h("div", { class: "kpi" }, [
      h("div", { class: "kpi-label" }, label),
      h("div", { class: "kpi-value", style: danger ? "color:#c53030" : "" }, String(value != null ? value : "—")),
      h("div", { class: "kpi-foot" }, foot),
    ]);
  }

  // Modal + QR (dùng thư viện qrcode.min.js vendored, chạy offline).
  function showModal(title, contentNode, opts) {
    const overlay = h("div", { class: "modal-overlay" });
    const close = () => overlay.remove();
    overlay.appendChild(h("div", { class: "modal" + (opts && opts.wide ? " modal-wide" : "") }, [
      h("div", { class: "modal-head" }, [h("div", { class: "panel-title" }, title), h("button", { class: "btn btn-ghost", onclick: close }, "✕")]),
      contentNode,
    ]));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return close;
  }
  function renderQr(el, text, size) {
    el.innerHTML = "";
    if (typeof QRCode === "undefined") { el.textContent = "Thiếu thư viện QR"; return; }
    try { new QRCode(el, { text: String(text), width: size || 180, height: size || 180, correctLevel: QRCode.CorrectLevel.M }); }
    catch (e) { el.textContent = "Không tạo được QR"; }
  }
  function showQrModal(title, text, hint, deepLink) {
    const qrBox = h("div", { class: "qr-box" });
    const codeEl = h("div", { class: "mono", style: "margin-top:12px;font-size:15px;font-weight:800;word-break:break-all" }, text);
    // Mặc định: QR "mở nhanh" (cho ESP32/điện thoại quét mở portal). QR mã chỉ là tùy chọn phụ.
    let mode = deepLink ? "link" : "code";
    const valFor = () => (mode === "link" ? deepLink : text);
    const copyBtn = h("button", { class: "btn btn-ghost", style: "margin-top:10px", onclick: () => { navigator.clipboard && navigator.clipboard.writeText(valFor()); toast("Đã copy.", "ok"); } }, "⧉ Copy");
    const label = h("div", { class: "page-sub", style: "margin-top:8px;font-weight:700" }, "");
    const kids = [qrBox, label, codeEl, copyBtn];
    let toggle = null;
    const apply = () => {
      renderQr(qrBox, valFor(), 200);
      codeEl.textContent = valFor();
      label.textContent = mode === "link" ? "⚡ QR mở nhanh (ESP32 quét để mở portal)" : "🔤 QR mã (để đọc & gõ tay)";
      if (toggle) toggle.textContent = mode === "link" ? "🔤 Đổi sang QR mã (gõ tay)" : "⚡ Đổi sang QR mở nhanh (ESP32)";
    };
    if (deepLink) {
      toggle = h("button", { class: "btn btn-blue", style: "margin-top:10px;margin-left:6px" }, "");
      toggle.addEventListener("click", () => { mode = mode === "link" ? "code" : "link"; apply(); });
      kids.push(toggle);
      kids.push(h("p", { class: "page-sub", style: "margin-top:10px;text-align:left" },
        "• QR mở nhanh (mặc định): điện thoại ĐÃ nối Wi-Fi \"ESP32-IoT-Setup\", quét bằng camera → mở thẳng portal đã điền sẵn mã.\n• QR mã: quét để đọc ra mã rồi gõ tay vào portal."));
    } else {
      kids.push(h("p", { class: "page-sub", style: "margin-top:10px" }, hint || "Quét bằng camera điện thoại để đọc mã, rồi nhập vào portal ESP32."));
    }
    showModal(title, h("div", { style: "text-align:center;white-space:pre-line" }, kids));
    apply();
  }

  // Điều hướng sang màn Giám sát cho 1 đơn ship (đóng modal nếu đang mở).
  function goToMonitor(shipmentCode) {
    document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    monitorState.code = shipmentCode;
    monitorState.shellFor = null;
    location.hash = "#/monitor";
  }

  // Popup toàn màn hình mô phỏng lộ trình di chuyển 3D (map3d) — hiển thị ngay trong màn Giám sát,
  // không điều hướng sang route #/map3d.
  function showMap3DModal(shipmentCode) {
    if (!shipmentCode) return;
    sessionStorage.setItem("m3d_shipment", shipmentCode);
    const host = h("div", { class: "modal-map3d-host" });
    const overlay = h("div", { class: "modal-overlay" });
    const close = () => {
      try { if (window.Map3D) window.Map3D.destroy(); } catch (_) {}
      overlay.remove();
    };
    overlay.appendChild(h("div", { class: "modal modal-full" }, [
      h("div", { class: "modal-head" }, [
        h("div", { class: "panel-title" }, "🚚 Lộ trình di chuyển — " + shipmentCode),
        h("button", { class: "btn btn-ghost", onclick: close }, "✕ Đóng"),
      ]),
      host,
    ]));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);

    if (window.Map3D) {
      // setHeader = no-op: đang ở trong modal nên không đổi tiêu đề trang.
      setTimeout(() => { try { window.Map3D.view(host, function () {}); } catch (_) {} }, 30);
    } else {
      host.appendChild(h("div", { class: "empty" }, "Thiếu js/map3d.js"));
    }
  }

  // Modal chi tiết 1 thiết bị: thông tin + đơn ship đã gắn (nhóm theo trạng thái, phân trang).
  async function showDeviceDetail(deviceId) {
    const body = h("div", { class: "loading" }, "Đang tải…");
    showModal("Chi tiết thiết bị", body, { wide: true });
    try {
      const d = await Api.deviceDetail(deviceId);
      clear(body); body.className = "";
      const row = (label, val) => h("div", { class: "chip" }, [h("span", null, label), h("span", { class: "mono" }, val)]);
      const served = d.shipmentsServed || [];
      body.appendChild(h("div", { class: "chips" }, [
        row("Device ID", d.deviceId),
        row("Trạng thái", d.status),
        row("Đơn ship hiện tại", d.shipmentCode || "Chưa gắn"),
        row("Thuật toán ký", d.signatureAlgorithm || "—"),
        row("Kích hoạt", fmtDateTime(d.activatedAt || d.createdAt)),
        row("Lần cuối online", d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "—"),
        row("Tổng telemetry", String(d.telemetryCount)),
        row("Số đơn đã gắn", String(served.length)),
      ]));

      body.appendChild(h("div", { class: "panel-title", style: "margin-top:14px;font-size:14px" }, ["Đơn ship đã gắn ", h("small", null, served.length + " đơn")]));
      if (!served.length) {
        body.appendChild(h("p", { class: "page-sub" }, "Chưa gắn / gửi telemetry cho đơn ship nào."));
        return;
      }

      // Thống kê theo trạng thái
      const counts = {};
      served.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
      body.appendChild(h("div", { style: "display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 10px" },
        Object.keys(counts).map((st) => h("span", { style: "display:inline-flex;align-items:center;gap:5px" }, [statusBadge(st), h("span", { class: "page-sub" }, "×" + counts[st])]))));

      // Bộ lọc trạng thái + bảng phân trang
      const listHost = h("div");
      let filter = "ALL", page = 0; const pageSize = 6;
      const renderList = () => {
        clear(listHost);
        const rows = served.filter((s) => filter === "ALL" || s.status === filter);
        if (!rows.length) { listHost.appendChild(h("div", { class: "empty" }, "Không có đơn.")); return; }
        const pages = Math.ceil(rows.length / pageSize);
        if (page >= pages) page = pages - 1;
        const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
        listHost.appendChild(h("div", { style: "overflow-x:auto" }, h("table", null, [
          h("thead", null, h("tr", null, ["Đơn ship", "Loại hàng", "Trạng thái", "Bản ghi", ""].map((t) => h("th", null, t)))),
          h("tbody", null, slice.map((s) => h("tr", { class: s.current ? "row-current" : "" }, [
            h("td", null, [h("span", { class: "mono" }, s.shipmentCode), s.current ? h("span", { class: "badge badge-intact", style: "margin-left:6px;font-size:9px;padding:1px 6px" }, "hiện tại") : ""]),
            h("td", null, s.itemType || "—"),
            h("td", null, statusBadge(s.status)),
            h("td", null, String(s.telemetryCount)),
            h("td", null, h("button", { class: "btn btn-ghost", style: "font-size:11px;padding:2px 8px", onclick: () => goToMonitor(s.shipmentCode) }, "🔎 Giám sát")),
          ]))),
        ])));
        if (pages > 1) {
          listHost.appendChild(h("div", { style: "display:flex;align-items:center;justify-content:center;gap:12px;margin-top:8px" }, [
            h("button", { class: "btn btn-ghost", style: "padding:4px 10px", onclick: () => { if (page > 0) { page--; renderList(); } } }, "‹"),
            h("span", { class: "page-sub" }, "Trang " + (page + 1) + "/" + pages),
            h("button", { class: "btn btn-ghost", style: "padding:4px 10px", onclick: () => { if (page < pages - 1) { page++; renderList(); } } }, "›"),
          ]));
        }
      };

      const filters = ["ALL"].concat(Object.keys(counts));
      const fbtns = filters.map((st) => {
        const b = h("button", { class: "tab-btn" + (st === "ALL" ? " active" : "") }, st === "ALL" ? "Tất cả" : st);
        b.addEventListener("click", () => { filter = st; page = 0; fbtns.forEach((x) => x.classList.remove("active")); b.classList.add("active"); renderList(); });
        return b;
      });
      body.appendChild(h("div", { class: "tabs", style: "margin-bottom:10px" }, fbtns));
      body.appendChild(listHost);
      renderList();
    } catch (e) {
      clear(body); body.className = "";
      body.appendChild(h("p", { class: "page-sub" }, e instanceof Api.ApiError ? e.message : "Lỗi tải chi tiết thiết bị"));
    }
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

    // trục thời gian (X) — nhãn giờ tại một số mốc đều nhau
    const tsVals = points.map((p) => p.ts).filter((v) => v != null);
    if (tsVals.length) {
      const withDate = (tsVals[tsVals.length - 1] - tsVals[0]) > 86400;
      const nLabels = Math.min(6, points.length);
      ctx.fillStyle = "#9aa9bb"; ctx.font = "10px Segoe UI"; ctx.textBaseline = "top";
      for (let k = 0; k < nLabels; k++) {
        const i = nLabels === 1 ? 0 : Math.round((k / (nLabels - 1)) * (points.length - 1));
        const p = points[i];
        if (!p || p.ts == null) continue;
        ctx.textAlign = k === 0 ? "left" : (k === nLabels - 1 ? "right" : "center");
        ctx.fillText(fmtClock(p.ts, withDate), x(i), padT + plotH + 6);
      }
    }

    // dải ngưỡng nhiệt độ cho phép (trục trái, xanh lá)
    if (band) {
      ctx.fillStyle = "rgba(31,157,85,.10)";
      const yTop = yT(band.max), yBot = yT(band.min);
      ctx.fillRect(padL, Math.min(yTop, yBot), plotW, Math.abs(yBot - yTop));
      ctx.strokeStyle = "rgba(31,157,85,.45)"; ctx.setLineDash([4, 4]);
      [band.min, band.max].forEach((v) => { const yy = yT(v); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); });
      ctx.setLineDash([]);
    }

    // dải ngưỡng độ ẩm cho phép (trục phải, xanh dương)
    if (band && band.minHum != null && band.maxHum != null) {
      ctx.fillStyle = "rgba(31,111,235,.07)";
      const yTop = yH(band.maxHum), yBot = yH(band.minHum);
      ctx.fillRect(padL, Math.min(yTop, yBot), plotW, Math.abs(yBot - yTop));
      ctx.strokeStyle = "rgba(31,111,235,.38)"; ctx.setLineDash([4, 4]);
      [band.minHum, band.maxHum].forEach((v) => { const yy = yH(v); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); });
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

    // điểm độ ẩm vi phạm ngưỡng -> chấm đỏ (trên đường độ ẩm)
    if (band && band.minHum != null && band.maxHum != null) {
      points.forEach((p, i) => {
        if (p.h != null && (p.h < band.minHum || p.h > band.maxHum)) {
          ctx.fillStyle = "#c53030"; ctx.beginPath(); ctx.arc(x(i), yH(p.h), 3.5, 0, Math.PI * 2); ctx.fill();
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
          h("li", null, "Giai đoạn 3 — Thiết bị gửi telemetry (nhiệt độ, độ ẩm, GPS, pin); xem ở tab Giám sát."),
        ]),
      ]));
    } catch (err) { showError(err); }
  }

  /* ---- Chuyến hàng ---- */
  async function viewShipments() {
    setHeader("Chuyến hàng", "Tạo lô hàng và thiết lập ngưỡng nhiệt độ / độ ẩm cho phép.");
    setLoading();
    try {
      const [list, devices, histMap] = await Promise.all([Api.listShipments(), Api.listDevices(), Api.shipmentDeviceMap()]);
      clear(view);

      // map: shipmentCode -> [{deviceId, current}] — gộp thiết bị ĐANG gắn + LỊCH SỬ (từ telemetry),
      // để đơn đã bỏ gắn / hoàn thành vẫn thấy từng gắn thiết bị nào.
      const devMap = {};
      const addDev = (sc, id, cur) => {
        if (!sc || !id) return;
        const arr = devMap[sc] = devMap[sc] || [];
        let e = arr.find((x) => x.deviceId === id);
        if (!e) { e = { deviceId: id, current: false }; arr.push(e); }
        if (cur) e.current = true;
      };
      Object.keys(histMap || {}).forEach((sc) => (histMap[sc] || []).forEach((id) => addDev(sc, id, false)));
      devices.forEach((d) => addDev(d.shipmentCode, d.deviceId, true));

      const tableHost = h("div");
      const count = h("small", null, list.length + " lô");
      const render = (q) => {
        const rows = list.filter((s) => matches([s.shipmentCode, s.itemType, s.status], q));
        count.textContent = (q ? rows.length + "/" + list.length : list.length) + " lô";
        clear(tableHost); tableHost.appendChild(shipmentsTable(rows, devMap));
      };

      view.appendChild(h("div", { class: "panel" }, [
        h("div", { class: "panel-head" }, [
          h("div", { class: "panel-title" }, ["Danh sách chuyến hàng ", count]),
          h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap" }, [
            searchBox("Tìm mã / loại hàng / trạng thái…", render),
            h("button", { class: "btn btn-primary", onclick: () => showCreateShipmentModal(() => viewShipments()) }, "➕ Tạo chuyến hàng"),
          ]),
        ]),
        tableHost,
      ]));
      render("");
    } catch (err) { showError(err); }
  }

  function shipmentsTable(list, devMap) {
    devMap = devMap || {};
    if (!list.length) return h("div", { class: "empty" }, "Chưa có chuyến hàng nào.");
    return h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Mã", "Loại hàng", "Nhiệt độ (°C)", "Độ ẩm (%)", "Thiết bị gắn", "Trạng thái", "Tạo lúc", "Hành động"].map((t) => h("th", null, t)))),
      h("tbody", null, list.map((s) => h("tr", null, [
        h("td", null, h("span", { class: "mono link", title: "Xem giám sát", onclick: () => goToMonitor(s.shipmentCode) }, s.shipmentCode)),
        h("td", null, s.itemType),
        h("td", null, `${num(s.minTemperature)} ÷ ${num(s.maxTemperature)}`),
        h("td", null, `${num(s.minHumidity)} ÷ ${num(s.maxHumidity)}`),
        h("td", null, (devMap[s.shipmentCode] && devMap[s.shipmentCode].length)
          ? h("div", { style: "display:flex;flex-direction:column;gap:3px" }, devMap[s.shipmentCode].map((e) =>
              h("span", { class: "mono link", style: "font-size:12px", title: e.current ? "Đang gắn — xem chi tiết thiết bị" : "Đã gắn (lịch sử) — xem chi tiết", onclick: () => showDeviceDetail(e.deviceId) }, [
                short(e.deviceId, 14),
                e.current ? h("span", { class: "badge badge-intact", style: "margin-left:5px;font-size:9px;padding:1px 6px" }, "hiện tại") : "",
              ])))
          : h("span", { class: "badge badge-muted" }, "Chưa có")),
        h("td", null, statusBadge(s.status)),
        h("td", null, fmtDateTime(s.createdAt)),
        h("td", null, [
          h("button", {
            class: "btn btn-blue", style: "font-size:11px;padding:2px 8px;margin-right:6px",
            onclick: () => goToMonitor(s.shipmentCode),
          }, "🔎 Giám sát"),
          h("button", {
            class: "btn btn-ghost", style: "font-size:11px;padding:2px 8px;margin-right:6px",
            onclick: () => showQrModal("QR đơn ship " + s.shipmentCode, s.shipmentCode, null, "http://192.168.4.1/monitor?ship=" + encodeURIComponent(s.shipmentCode)),
          }, "QR gắn đơn"),
          s.status === 'ACTIVE' ? h("button", {
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
        }, "Kết thúc") : "",
        ]),
      ]))),
    ]));
  }

  // Loại hàng cố định để chọn nhanh (kèm ngưỡng gợi ý °C / %).
  const ITEM_CATEGORIES = [
    { name: "Vaccine", t: [2, 8], h: [40, 70] },
    { name: "Thực phẩm đông lạnh", t: [-22, -18], h: [40, 80] },
    { name: "Hải sản tươi", t: [0, 4], h: [80, 95] },
    { name: "Sữa & chế phẩm", t: [2, 6], h: [45, 70] },
    { name: "Thịt tươi", t: [0, 4], h: [80, 90] },
    { name: "Trái cây", t: [4, 12], h: [85, 95] },
    { name: "Rau củ", t: [2, 8], h: [90, 98] },
    { name: "Dược phẩm", t: [15, 25], h: [35, 60] },
  ];
  function genShipCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let r = "";
    for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return "SHIP-" + r;
  }

  // Modal tạo chuyến hàng: mã tự sinh + chọn loại hàng theo category (tự điền ngưỡng gợi ý).
  function showCreateShipmentModal(reload) {
    const codeInput = h("input", { name: "shipmentCode", placeholder: "VD: SHIP-XXXX", required: "required", maxlength: "64" });
    codeInput.value = genShipCode();
    const genBtn = h("button", { type: "button", class: "btn btn-ghost", style: "white-space:nowrap" }, "🎲 Tự sinh");
    genBtn.addEventListener("click", () => { codeInput.value = genShipCode(); });

    const itemInput = h("input", { name: "itemType", placeholder: "Chọn nhanh hoặc tự nhập", required: "required", maxlength: "255" });
    const tMin = h("input", { name: "minTemperature", type: "number", step: "0.1", value: "-22", required: "required" });
    const tMax = h("input", { name: "maxTemperature", type: "number", step: "0.1", value: "-18", required: "required" });
    const hMin = h("input", { name: "minHumidity", type: "number", step: "0.1", min: "0", max: "100", value: "40", required: "required" });
    const hMax = h("input", { name: "maxHumidity", type: "number", step: "0.1", min: "0", max: "100", value: "80", required: "required" });
    const catSelect = h("select", null, [
      h("option", { value: "" }, "— chọn nhanh loại hàng —"),
      ...ITEM_CATEGORIES.map((c, i) => h("option", { value: String(i) }, c.name)),
      h("option", { value: "__other" }, "Khác (tự nhập)…"),
    ]);
    catSelect.addEventListener("change", () => {
      if (catSelect.value === "" || catSelect.value === "__other") { if (catSelect.value === "__other") { itemInput.value = ""; itemInput.focus(); } return; }
      const c = ITEM_CATEGORIES[Number(catSelect.value)];
      itemInput.value = c.name;
      tMin.value = c.t[0]; tMax.value = c.t[1]; hMin.value = c.h[0]; hMax.value = c.h[1];  // điền ngưỡng gợi ý
    });

    const field = (label, node) => h("div", { class: "field" }, [h("label", null, label), node]);
    const form = h("form", null, [
      h("div", { class: "form-grid" }, [
        h("div", { class: "field full" }, [h("label", null, "Mã chuyến hàng *"), h("div", { style: "display:flex;gap:8px" }, [codeInput, genBtn])]),
        h("div", { class: "field full" }, [h("label", null, "Loại hàng *"), h("div", { style: "display:flex;flex-direction:column;gap:8px" }, [catSelect, itemInput])]),
        field("Nhiệt độ tối thiểu (°C)", tMin),
        field("Nhiệt độ tối đa (°C)", tMax),
        field("Độ ẩm tối thiểu (%)", hMin),
        field("Độ ẩm tối đa (%)", hMax),
      ]),
      h("div", { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px" }, [
        h("button", { type: "submit", class: "btn btn-primary" }, "Tạo đơn"),
      ]),
    ]);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const payload = {
        shipmentCode: codeInput.value.trim(),
        itemType: itemInput.value.trim(),
        minTemperature: Number(tMin.value), maxTemperature: Number(tMax.value),
        minHumidity: Number(hMin.value), maxHumidity: Number(hMax.value),
      };
      if (!payload.shipmentCode) { toast("Nhập hoặc tự sinh mã chuyến hàng.", "err"); return; }
      if (!payload.itemType) { toast("Chọn hoặc nhập loại hàng.", "err"); return; }
      if (payload.minTemperature > payload.maxTemperature) { toast("Nhiệt độ tối thiểu phải ≤ tối đa.", "err"); return; }
      if (payload.minHumidity > payload.maxHumidity) { toast("Độ ẩm tối thiểu phải ≤ tối đa.", "err"); return; }
      btn.disabled = true;
      try {
        await Api.createShipment(payload);
        toast("Đã tạo chuyến hàng " + payload.shipmentCode, "ok");
        document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
        reload();
      } catch (err) {
        toast(err instanceof Api.ApiError ? err.message : "Tạo thất bại", "err");
        btn.disabled = false;
      }
    });
    showModal("Tạo chuyến hàng mới", form);
  }

  /* ---- Mã kích hoạt ---- */
  async function viewCodes() {
    setHeader("Mã kích hoạt thiết bị", "Sinh mã để ESP32 đăng ký (kích hoạt) vào hệ thống — Pha 1, không thuộc đơn ship.");
    setLoading();
    try {
      const codes = await Api.listVerifyCodes();
      clear(view);

      const resultBox = h("div");

      // ----- danh sách mã kích hoạt (phải) -----
      let codesData = codes, curQuery = "", curStatus = "ALL";
      const listHost = h("div");
      const count = h("small", null, codes.length + " mã");
      const renderList = () => {
        const rows = codesData.filter((c) =>
          (curStatus === "ALL" || codeDisplayStatus(c) === curStatus) &&
          matches([c.verifyCode, codeDisplayStatus(c), c.usedByDeviceId], curQuery));
        count.textContent = (curQuery || curStatus !== "ALL" ? rows.length + "/" + codesData.length : codesData.length) + " mã";
        clear(listHost); listHost.appendChild(verifyCodesTable(rows));
      };
      const reload = async () => { try { codesData = await Api.listVerifyCodes(); renderList(); } catch (_) {} };

      const filterBtns = ["ALL", "UNUSED", "USED", "EXPIRED"].map((st) => {
        const b = h("button", { class: "tab-btn" + (st === "ALL" ? " active" : "") }, st === "ALL" ? "Tất cả" : st);
        b.addEventListener("click", () => { curStatus = st; filterBtns.forEach((x) => x.classList.remove("active")); b.classList.add("active"); renderList(); });
        return b;
      });

      // ----- form sinh mã kích hoạt (trái) -----
      const form = h("form", null, [
        h("div", { class: "form-grid" }, [
          h("div", { class: "field" }, [h("label", null, "Hết hạn sau (ngày)"), h("input", { name: "expiresInDays", type: "number", min: "1", value: "30" }), h("span", { class: "hint" }, "Mặc định 30 ngày.")]),
        ]),
        h("div", { class: "form-actions" }, [h("button", { type: "submit", class: "btn btn-blue" }, "⌗ Sinh mã kích hoạt")]),
      ]);
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const payload = {};
        if (data.expiresInDays) payload.expiresInDays = Number(data.expiresInDays);
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
          const vc = await Api.generateCode(payload);
          renderCodeResult(resultBox, vc);
          toast("Đã sinh mã kích hoạt " + vc.verifyCode, "ok");
          await reload();
        } catch (err) {
          toast(err instanceof Api.ApiError ? err.message : "Sinh mã thất bại", "err");
        } finally { btn.disabled = false; }
      });

      view.appendChild(h("div", { class: "grid-2" }, [
        h("div", { class: "panel" }, [
          h("div", { class: "panel-title" }, "Sinh mã kích hoạt mới"),
          form,
          resultBox,
          h("p", { class: "page-sub", style: "margin-top:12px" }, "ESP32 nhập/quét mã này ở bước Kích hoạt để gia nhập hệ thống. Gắn đơn ship là bước riêng (QR đơn ship ở tab Chuyến hàng)."),
        ]),
        h("div", { class: "panel" }, [
          h("div", { class: "panel-head" }, [
            h("div", { class: "panel-title" }, ["Danh sách mã kích hoạt ", count]),
            searchBox("Tìm mã / thiết bị…", (q) => { curQuery = q; renderList(); }),
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
      h("thead", null, h("tr", null, ["Mã kích hoạt", "Trạng thái", "Hết hạn", "Dùng bởi", "QR"].map((t) => h("th", null, t)))),
      h("tbody", null, list.map((c) => h("tr", null, [
        h("td", null, h("span", { class: "mono" }, c.verifyCode)),
        h("td", null, statusBadge(codeDisplayStatus(c))),
        h("td", null, fmtDateTime(c.expiresAt)),
        h("td", null, c.usedByDeviceId ? h("span", { class: "mono" }, short(c.usedByDeviceId, 14)) : "—"),
        h("td", null, codeDisplayStatus(c) === "UNUSED"
          ? h("button", { class: "btn btn-ghost", style: "font-size:11px;padding:2px 8px", onclick: () => showQrModal("QR mã kích hoạt", c.verifyCode, null, "http://192.168.4.1/?vcode=" + encodeURIComponent(c.verifyCode)) }, "QR")
          : "—"),
      ]))),
    ]));
  }

  function renderCodeResult(box, vc) {
    clear(box);
    const qrBox = h("div", { class: "qr-box" });
    box.appendChild(h("div", { class: "code-result" }, [
      h("div", { class: "meta" }, "Mã kích hoạt thiết bị"),
      h("div", { class: "code" }, vc.verifyCode),
      h("div", { class: "meta" }, "Trạng thái: " + (vc.status || "UNUSED") + " · Hết hạn: " + fmtDateTime(vc.expiresAt)),
      h("div", { class: "meta", style: "margin-top:8px" }, "⚡ QR mở nhanh — ESP32 (đã nối Wi-Fi) quét để mở portal điền sẵn mã"),
      h("div", { style: "display:flex;justify-content:center;margin-top:8px" }, qrBox),
      h("button", {
        class: "btn btn-ghost", style: "margin-top:12px",
        onclick: () => { navigator.clipboard && navigator.clipboard.writeText(vc.verifyCode); toast("Đã copy mã.", "ok"); },
      }, "⧉ Copy mã"),
    ]));
    renderQr(qrBox, "http://192.168.4.1/?vcode=" + encodeURIComponent(vc.verifyCode), 150);
  }

  /* ---- Thiết bị ---- */
  async function viewDevices() {
    setHeader("Thiết bị", "Thiết bị đã kích hoạt (Pha 1) và đơn ship đang gắn (Pha 2).");
    setLoading();
    try {
      const [list, shipments] = await Promise.all([Api.listDevices(), Api.listShipments()]);
      clear(view);

      const bound = list.filter((d) => d.shipmentCode).length;
      view.appendChild(h("div", { class: "kpi-grid", style: "grid-template-columns:repeat(3,1fr);margin-bottom:16px" }, [
        kpiCard("Tổng thiết bị", list.length, "Đã kích hoạt vào hệ thống"),
        kpiCard("Đang gắn đơn ship", bound, "Có đơn ship hiện tại"),
        kpiCard("Chưa gắn", list.length - bound, "Chờ gắn đơn ship"),
      ]));

      const tableHost = h("div");
      const count = h("small", null, list.length + " thiết bị");
      const reload = () => viewDevices();
      // Tập đơn ship ĐANG được gắn (để loại khỏi danh sách gắn mới).
      const boundSet = new Set(list.filter((d) => d.shipmentCode).map((d) => d.shipmentCode));
      const render = (q) => {
        const rows = list.filter((d) => matches([d.deviceId, d.shipmentCode, d.status, d.signatureAlgorithm], q));
        count.textContent = (q ? rows.length + "/" + list.length : list.length) + " thiết bị";
        clear(tableHost); tableHost.appendChild(devicesTable(rows, shipments, boundSet, reload));
      };
      view.appendChild(h("div", { class: "panel" }, [
        h("div", { class: "panel-head" }, [
          h("div", { class: "panel-title" }, ["Thiết bị đã kích hoạt ", count]),
          searchBox("Tìm device id / đơn ship / trạng thái…", render),
        ]),
        tableHost,
      ]));
      render("");
    } catch (err) { showError(err); }
  }

  function devicesTable(list, shipments, boundSet, reload) {
    if (!list.length) return h("div", { class: "empty" }, "Chưa có thiết bị nào kích hoạt. (Nạp firmware ESP32 + nhập mã kích hoạt.)");
    return h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Device ID", "Đơn ship hiện tại", "Thuật toán ký", "Trạng thái", "Kích hoạt", "Lần cuối online", "Gắn đơn ship"].map((t) => h("th", null, t)))),
      h("tbody", null, list.map((d) => h("tr", null, [
        h("td", null, h("span", { class: "mono link", title: "Xem chi tiết", onclick: () => showDeviceDetail(d.deviceId) }, d.deviceId)),
        h("td", null, d.shipmentCode ? h("span", { class: "mono link", title: "Xem giám sát", onclick: () => goToMonitor(d.shipmentCode) }, d.shipmentCode) : h("span", { class: "badge badge-muted" }, "Chưa gắn")),
        h("td", null, h("span", { class: "badge badge-info" }, d.signatureAlgorithm || "—")),
        h("td", null, statusBadge(d.status)),
        h("td", null, fmtDateTime(d.activatedAt || d.createdAt)),
        h("td", null, [relTime(d.lastSeenAt), h("div", { class: "page-sub", style: "font-size:11px" }, d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : "")]),
        h("td", null, deviceBindControl(d, shipments, boundSet, reload)),
      ]))),
    ]));
  }

  function deviceBindControl(d, shipments, boundSet, reload) {
    const bindBtn = h("button", { class: "btn btn-ghost", style: "font-size:11px;padding:3px 10px" }, d.shipmentCode ? "Đổi đơn" : "Gắn đơn ship");
    bindBtn.addEventListener("click", () => showBindModal(d.deviceId, shipments, boundSet, reload));
    const kids = [bindBtn];
    if (d.shipmentCode) {
      const unbind = h("button", { class: "btn btn-ghost", style: "font-size:11px;padding:3px 10px" }, "Bỏ gắn");
      unbind.addEventListener("click", async () => {
        unbind.disabled = true;
        try { await Api.bindDevice(d.deviceId, null); toast("Đã bỏ gắn " + d.deviceId, "ok"); reload(); }
        catch (e) { toast(e instanceof Api.ApiError ? e.message : "Lỗi", "err"); unbind.disabled = false; }
      });
      kids.push(unbind);
    }
    return h("div", { style: "display:flex;align-items:center;flex-wrap:wrap;gap:4px" }, kids);
  }

  // Modal chọn đơn ship (ACTIVE + chưa gắn thiết bị nào) để gắn — search + phân trang + chọn 1.
  function showBindModal(deviceId, shipments, boundSet, reload) {
    const available = (shipments || []).filter((s) => s.status === "ACTIVE" && !(boundSet && boundSet.has(s.shipmentCode)));
    let selected = null, query = "", page = 0; const pageSize = 6;
    const listHost = h("div");
    const confirmBtn = h("button", { class: "btn btn-primary", disabled: "disabled" }, "Xác nhận gắn");
    const render = () => {
      clear(listHost);
      const rows = available.filter((s) => matches([s.shipmentCode, s.itemType], query));
      if (!rows.length) {
        listHost.appendChild(h("div", { class: "empty" }, available.length ? "Không tìm thấy đơn phù hợp." : "Không có đơn ACTIVE nào đang trống (chưa gắn thiết bị)."));
        return;
      }
      const pages = Math.ceil(rows.length / pageSize);
      if (page >= pages) page = pages - 1;
      const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
      listHost.appendChild(h("div", { style: "overflow-x:auto" }, h("table", null, [
        h("thead", null, h("tr", null, ["", "Mã", "Loại hàng", "Nhiệt độ (°C)"].map((t) => h("th", null, t)))),
        h("tbody", null, slice.map((s) => {
          const radio = h("input", { type: "radio", name: "bindsel" });
          if (selected === s.shipmentCode) radio.checked = true;
          const tr = h("tr", { class: selected === s.shipmentCode ? "row-current" : "", style: "cursor:pointer" }, [
            h("td", null, radio),
            h("td", null, h("span", { class: "mono" }, s.shipmentCode)),
            h("td", null, s.itemType),
            h("td", null, `${num(s.minTemperature)} ÷ ${num(s.maxTemperature)}`),
          ]);
          tr.addEventListener("click", () => { selected = s.shipmentCode; confirmBtn.disabled = false; render(); });
          return tr;
        })),
      ])));
      if (pages > 1) {
        listHost.appendChild(h("div", { style: "display:flex;align-items:center;justify-content:center;gap:12px;margin-top:8px" }, [
          h("button", { class: "btn btn-ghost", style: "padding:4px 10px", onclick: () => { if (page > 0) { page--; render(); } } }, "‹"),
          h("span", { class: "page-sub" }, "Trang " + (page + 1) + "/" + pages),
          h("button", { class: "btn btn-ghost", style: "padding:4px 10px", onclick: () => { if (page < pages - 1) { page++; render(); } } }, "›"),
        ]));
      }
    };
    confirmBtn.addEventListener("click", async () => {
      if (!selected) return;
      confirmBtn.disabled = true;
      try {
        await Api.bindDevice(deviceId, selected);
        toast("Đã gắn " + deviceId + " → " + selected, "ok");
        document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
        reload();
      } catch (e) { toast(e instanceof Api.ApiError ? e.message : "Gắn thất bại", "err"); confirmBtn.disabled = false; }
    });
    showModal("Gắn đơn ship cho " + deviceId, h("div", null, [
      h("p", { class: "page-sub", style: "margin:0 0 10px" }, "Chọn 1 đơn ship (ACTIVE, chưa gắn thiết bị nào)."),
      searchBox("Tìm mã / tên chuyến hàng…", (q) => { query = q; page = 0; render(); }),
      h("div", { style: "margin-top:12px" }, listHost),
      h("div", { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px" }, [confirmBtn]),
    ]));
    render();
  }

  /* ---- Giám sát (telemetry + GPS + cảnh báo) ---- */
  let monitorState = { code: null, shellFor: null, refs: null, gpsTab: "map", gpsMap: null, gpsRouteLayer: null, lastCoords: [], gpsFitted: false, roadRoute: null, roadRouteKey: null, roadRouteFetching: null, chartRange: "all" };

  // Cửa sổ thời gian cho biểu đồ nhiệt độ & độ ẩm (tính từ bản ghi mới nhất trở về trước).
  const CHART_RANGES = [
    { key: "1m", label: "1m", sec: 60 },
    { key: "15m", label: "15m", sec: 900 },
    { key: "1h", label: "1h", sec: 3600 },
    { key: "1d", label: "1d", sec: 86400 },
    { key: "all", label: "Tất cả", sec: null },
  ];
  function chartRangeSec() {
    const r = CHART_RANGES.find((x) => x.key === monitorState.chartRange);
    return r ? r.sec : null;
  }
  // Telemetry đã lọc theo cửa sổ thời gian, trả mảng ASC theo thời gian (device_timestamp epoch giây).
  function chartPointsAsc() {
    const asc = (monitorState.lastTele || []).slice().reverse();
    const sec = chartRangeSec();
    if (!sec || !asc.length) return asc;
    const latestTs = asc[asc.length - 1].device_timestamp;
    if (latestTs == null) return asc;
    return asc.filter((t) => t.device_timestamp != null && t.device_timestamp >= latestTs - sec);
  }
  function chartSeries() {
    return chartPointsAsc().map((t) => ({ t: t.temperature != null ? Number(t.temperature) : null, h: t.humidity != null ? Number(t.humidity) : null, bad: !!t.tampered, ts: t.device_timestamp != null ? Number(t.device_timestamp) : null }));
  }

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
  // Thanh phân trang dùng chung cho danh sách Cảnh báo / bảng telemetry.
  function pagerBar(page, totalItems, perPage, onChange) {
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const cur = Math.min(page, totalPages - 1);
    const mk = (label, target, disabled) => {
      const b = h("button", { class: "btn btn-ghost pager-btn" }, label);
      if (disabled) b.disabled = true;
      else b.addEventListener("click", () => onChange(target));
      return b;
    };
    return h("div", { class: "pager" }, [
      mk("‹ Trước", cur - 1, cur <= 0),
      h("span", { class: "pager-info" }, `Trang ${cur + 1}/${totalPages}`),
      mk("Sau ›", cur + 1, cur >= totalPages - 1),
    ]);
  }

  function buildMonitorShell(body, ship) {
    clear(body);
    monitorState.alertsPage = 0;
    monitorState.telePage = 0;
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
    const rangeBar = h("div", { class: "tabs" });
    const renderRangeBar = () => {
      clear(rangeBar);
      CHART_RANGES.forEach((rg) => {
        const b = h("button", { class: "tab-btn" + (monitorState.chartRange === rg.key ? " active" : "") }, rg.label);
        b.addEventListener("click", () => {
          if (monitorState.chartRange === rg.key) return;
          monitorState.chartRange = rg.key;
          monitorState.hoveredIndex = null;
          hideTooltip();
          renderRangeBar();
          drawTimeSeries(chartCanvas, chartSeries(), band, null);
        });
        rangeBar.appendChild(b);
      });
    };
    renderRangeBar();
    const chartPanel = h("div", { class: "panel", style: "margin-top:16px;box-shadow:none;border-color:#eef2f7" }, [
      h("div", { class: "panel-head" }, [
        h("div", { class: "panel-title" }, ["Biểu đồ nhiệt độ & độ ẩm ", h("small", null, band ? `ngưỡng: ${band.min}÷${band.max}°C · độ ẩm ${band.minHum != null ? band.minHum + "÷" + band.maxHum + "%" : "—"}` : "")]),
        rangeBar,
      ]),
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
      h("div", { class: "panel-head" }, [h("div", { class: "panel-title" }, "Lộ trình GPS"), h("div", { class: "tabs" }, [tabMapBtn, tabCanvasBtn])]),
      mapPane, canvasPane, dirBtnHost,
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
      const points = chartPointsAsc(); // ASC order, đã lọc theo cửa sổ thời gian
      if (!points.length) return;
      if (mouseX >= padL && mouseX <= W - padR) {
        const hoveredIdx = Math.round(((mouseX - padL) * (points.length - 1)) / plotW);
        if (hoveredIdx >= 0 && hoveredIdx < points.length) {
          monitorState.hoveredIndex = hoveredIdx;
          drawTimeSeries(chartCanvas, chartSeries(), band, hoveredIdx);
          showTooltip(e, points[hoveredIdx], rect);
          return;
        }
      }
      hideTooltip();
      drawTimeSeries(chartCanvas, chartSeries(), band, null);
    });

    chartCanvas.addEventListener("mouseleave", () => {
      monitorState.hoveredIndex = null;
      hideTooltip();
      if (chartPointsAsc().length) drawTimeSeries(chartCanvas, chartSeries(), band, null);
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
             (t.battery != null && t.battery < 20);
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

    // chart (đánh dấu điểm bị sửa đổi) — lọc theo cửa sổ thời gian đang chọn
    requestAnimationFrame(() => drawTimeSeries(r.chartCanvas, chartSeries(), band, monitorState.hoveredIndex));

    // GPS: canvas + leaflet + nút Google
    const coords = asc.map((t) => ({ lat: t.lat != null ? Number(t.lat) : null, lng: t.lng != null ? Number(t.lng) : null }));
    monitorState.lastCoords = coords;
    requestAnimationFrame(() => drawGpsTrack(r.canvasMapEl, coords));
    updateGpsMap();
    clear(r.dirBtnHost);
    const valid = coords.filter((c) => c.lat != null && c.lng != null);
    if (valid.length >= 2) {
      // Mở trang "Lộ trình di chuyển" (bản đồ 3D) gắn với chuyến hàng đang giám sát.
      const btn3d = h("button", { class: "btn btn-primary", style: "margin-top:10px; margin-right:8px", onclick: () => showMap3DModal(monitorState.code) }, "🚚 Xem lộ trình di chuyển");
      r.dirBtnHost.appendChild(btn3d);
    }
    if (valid.length) r.dirBtnHost.appendChild(h("a", { href: googleDirUrl(valid), target: "_blank", rel: "noopener", class: "btn btn-ghost", style: "margin-top:10px" }, "🌍 Mở lộ trình trên Google Maps"));

    // alerts (phân trang 10 mục / trang)
    const ALERTS_PER_PAGE = 10;
    const renderAlerts = () => {
      clear(r.alertsHost);
      r.alertsCount.textContent = alerts.length + " mục";
      if (!alerts.length) {
        r.alertsHost.appendChild(h("div", { class: "empty" }, "Không có cảnh báo. Dữ liệu trong ngưỡng an toàn ✔"));
        return;
      }
      const page = Math.min(monitorState.alertsPage || 0, Math.ceil(alerts.length / ALERTS_PER_PAGE) - 1);
      monitorState.alertsPage = page;
      alerts.slice(page * ALERTS_PER_PAGE, (page + 1) * ALERTS_PER_PAGE).forEach((a) => r.alertsHost.appendChild(h("div", { class: "alert-item" }, [
        h("div", { class: "alert-ico" }, a.level === "HIGH" ? "🔴" : a.level === "WARNING" ? "🟠" : "🔵"),
        h("div", { class: "alert-body" }, [
          h("div", { class: "alert-msg" }, a.message),
          h("div", { class: "alert-meta" }, [a.type, " · ", a.deviceId || "—", " · ", fmtDateTime(a.createdAt)]),
        ]),
        levelBadge(a.level),
      ])));
      if (alerts.length > ALERTS_PER_PAGE) r.alertsHost.appendChild(pagerBar(page, alerts.length, ALERTS_PER_PAGE, (p) => { monitorState.alertsPage = p; renderAlerts(); }));
    };
    renderAlerts();

    // bảng telemetry + hash chain (phân trang 20 bản ghi / trang)
    const TELE_PER_PAGE = 20;
    const renderTeleTable = () => {
    clear(r.tableHost);
    r.tableCount.textContent = tele.length + " bản ghi · hash chain chống sửa đổi";
    const telePage = tele.length ? Math.min(monitorState.telePage || 0, Math.ceil(tele.length / TELE_PER_PAGE) - 1) : 0;
    monitorState.telePage = telePage;
    if (tele.length) r.tableHost.appendChild(h("div", { style: "overflow-x:auto" }, h("table", null, [
      h("thead", null, h("tr", null, ["Thời gian", "Device", "Nhiệt độ", "Độ ẩm", "Pin", "GPS", "Record hash", "Toàn vẹn"].map((t) => h("th", null, t)))),
      h("tbody", null, tele.slice(telePage * TELE_PER_PAGE, (telePage + 1) * TELE_PER_PAGE).map((t) => h("tr", { class: t.tampered ? "row-tampered" : "" }, [
        h("td", null, fmtEpoch(t.device_timestamp)),
        h("td", null, h("span", { class: "mono" }, short(t.device_id, 10))),
        h("td", null, num(t.temperature) + "°C"),
        h("td", null, num(t.humidity) + "%"),
        h("td", null, num(t.battery, 0) + "%"),
        h("td", null, h("span", { class: "mono" }, `${num(t.lat, 4)}, ${num(t.lng, 4)}`)),
        h("td", null, h("span", { class: "mono hash", title: t.record_hash }, short(t.record_hash, 14))),
        h("td", null, t.tampered
          ? h("span", { class: "badge badge-tamper", title: tamperTitle(t.integrity_issues) }, "⚠ Đã sửa")
          : h("span", { class: "badge badge-intact" }, "✔ OK")),
      ]))),
    ])));
    else r.tableHost.appendChild(h("div", { class: "empty" }, "Chưa có telemetry. Thiết bị sẽ gửi dữ liệu sau khi provisioning."));
    if (tele.length > TELE_PER_PAGE) r.tableHost.appendChild(pagerBar(telePage, tele.length, TELE_PER_PAGE, (p) => { monitorState.telePage = p; renderTeleTable(); }));
    };
    renderTeleTable();
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

  /* ---- Toàn vẹn dữ liệu (integrity / notary) ---- */
  async function viewIntegrity() {
    setHeader("Toàn vẹn dữ liệu", "Kiểm chứng hash chain (HMAC khóa server) và đối chiếu các điểm đối soát đã công bố.");
    setLoading();
    try {
      const report = await Api.integrityStatus();
      renderIntegrity(report);
    } catch (err) { showError(err); }
  }

  function renderIntegrity(report) {
    clear(view);

    view.appendChild(h("div", { class: "toolbar", style: "margin-bottom:16px" }, [
      btn("⛨ Tạo điểm đối soát", "btn-primary", async (b) => {
        b.disabled = true;
        try { const a = await Api.createAnchor(); toast("Đã tạo & công bố điểm đối soát (" + a.recordCount + " bản ghi)", "ok"); viewIntegrity(); }
        catch (e) { toast(e instanceof Api.ApiError ? e.message : "Lỗi tạo điểm đối soát", "err"); b.disabled = false; }
      }),
      btn("⟳ Kiểm tra lại", "btn-ghost", () => viewIntegrity()),
    ]));

    view.appendChild(h("div", { class: report.ok ? "ok-banner" : "tamper-banner" }, [
      h("span", null, report.ok ? "✔" : "⚠"),
      h("span", null, report.message),
    ]));

    view.appendChild(h("div", { class: "kpi-grid" }, [
      kpiCard("Bản ghi", report.totalRecords, "Tổng telemetry"),
      kpiCard("Bản ghi bị sửa", report.tamperedRecords, "record_hash / chuỗi không khớp", report.tamperedRecords > 0),
      kpiCard("Điểm đối soát", report.totalAnchors, "Đã tạo & công bố"),
      kpiCard("Đối soát sai / mất", report.invalidAnchors + report.missingFromDbAnchors, "Bị giả mạo hoặc xoá", (report.invalidAnchors + report.missingFromDbAnchors) > 0),
    ]));

    view.appendChild(h("div", { class: "panel" }, [
      h("div", { class: "panel-title" }, ["Sổ đối soát (append-only) ", h("small", null, report.anchors.length + " điểm")]),
      report.anchors.length ? h("div", { style: "overflow-x:auto" }, h("table", null, [
        h("thead", null, h("tr", null, ["Thời điểm", "Số bản ghi", "Head hash", "Trạng thái"].map((t) => h("th", null, t)))),
        h("tbody", null, report.anchors.slice().reverse().map((a) => h("tr", { class: a.valid ? "" : "row-tampered" }, [
          h("td", null, fmtDateTime(a.createdAt)),
          h("td", null, String(a.recordCount)),
          h("td", null, h("span", { class: "mono hash", title: a.headHash }, short(a.headHash, 16))),
          h("td", null, a.valid
            ? h("span", { class: "badge badge-intact" }, "✔ Hợp lệ")
            : h("span", { class: "badge badge-tamper", title: a.note }, "⚠ " + a.note)),
        ]))),
      ])) : h("div", { class: "empty" }, "Chưa có điểm đối soát. Bấm \"Tạo điểm đối soát\" để công bố trạng thái hiện tại rồi thử sửa DB và kiểm tra lại."),
    ]));

    view.appendChild(h("div", { class: "panel" }, [
      h("div", { class: "panel-title" }, "Cơ chế chống sửa đổi"),
      h("ul", { style: "margin:8px 0 0;padding-left:18px;color:#355a79;font-size:13px;line-height:1.9" }, [
        h("li", null, "record_hash = HMAC-SHA256(khóa server, …). Khóa đặt ngoài DB → người chỉ có quyền DB không tính lại được hash hợp lệ."),
        h("li", null, "Mỗi \"điểm đối soát\" công bố head của hash chain ra sổ append-only + file ngoài DB; các điểm tự liên kết và được HMAC."),
        h("li", null, "Khi kiểm tra: tính lại toàn chuỗi và đối chiếu các điểm đối soát đã công bố → mọi sửa/xoá lịch sử đều làm lệch điểm đối soát."),
      ]),
    ]));
  }

  /* ============================================================
   *  Router
   * ============================================================ */
  // Trang "Lộ trình di chuyển" (bản đồ 3D) tách riêng trong js/map3d.js.
  function viewMap3D() {
    if (window.Map3D) window.Map3D.view(view, setHeader);
    else { setHeader("Lộ trình di chuyển", ""); view.innerHTML = ""; view.appendChild(h("div", { class: "empty" }, "Thiếu js/map3d.js")); }
  }

  const routes = {
    overview: viewOverview,
    shipments: viewShipments,
    codes: viewCodes,
    devices: viewDevices,
    monitor: viewMonitor,
    map3d: viewMap3D,
    integrity: viewIntegrity,
  };

  function setHeader(title, sub) { pageTitle.textContent = title; pageSub.textContent = sub; }

  function currentRoute() {
    const hash = (location.hash || "#/overview").replace(/^#\//, "");
    return routes[hash] ? hash : "overview";
  }

  function navTo() {
    clearInterval(monitorTimer); monitorTimer = null;
    if (window.Map3D) window.Map3D.destroy(); // dừng animation/map khi rời trang 3D
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
