/* Trang "Bản đồ 3D": xe tải 3D chạy theo lộ trình OSRM thật (Trại Mát -> Nhà máy AgriSense)
 * trên nền tile OpenStreetMap nghiêng 3D (MapLibre GL + Three.js, tải lười từ CDN).
 * Mất mạng OSRM -> tự chuyển sang lộ trình mô phỏng nội suy qua các waypoint dựng sẵn. */
(function (global) {
  "use strict";

  /* ---- Cấu hình tuyến & mô phỏng ---- */
  const ORIGIN = { name: "Trại Mát (Đà Lạt)", lng: 108.5060, lat: 11.9200 };
  const DEST = { name: "Nhà máy AgriSense", lng: 108.4419, lat: 11.9404 };
  // Waypoint dự phòng bám hướng QL20 / Trần Hưng Đạo khi không gọi được OSRM.
  const FALLBACK_WAYPOINTS = [
    [108.5060, 11.9200], [108.4980, 11.9235], [108.4890, 11.9218],
    [108.4790, 11.9262], [108.4700, 11.9310], [108.4610, 11.9330],
    [108.4520, 11.9370], [108.4419, 11.9404],
  ];
  const TRUCK_SPEED_KMH = 40;          // tốc độ giả định của xe để tính ETA
  const SIM_DURATION_S = 90;           // thời gian chạy hết tuyến ở tốc độ 1x (giây thực)
  const SENSOR_INTERVAL_MS = 2000;     // chu kỳ cập nhật cảm biến khoang lạnh
  const TEMP_ALERT_C = 8;              // ngưỡng cảnh báo nhiệt độ khoang lạnh
  const TEMP_BASE_C = 4.5;
  const HUM_BASE_PCT = 82;
  const FOLLOW_ZOOM = 16;
  const FOLLOW_PITCH = 62;
  const CDN = {
    maplibreJs: "https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js",
    maplibreCss: "https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css",
    threeJs: "https://unpkg.com/three@0.152.2/build/three.min.js",
  };

  /* ---- Tải thư viện từ CDN (1 lần) ---- */
  let libsPromise = null;
  function loadLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = CDN.maplibreCss;
      document.head.appendChild(css);
      loadScript(CDN.maplibreJs)
        .then(() => loadScript(CDN.threeJs))
        .then(() => resolve({ maplibregl: global.maplibregl, THREE: global.THREE }))
        .catch(reject);
    });
    libsPromise.catch(() => { libsPromise = null; });
    return libsPromise;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Không tải được " + src));
      document.head.appendChild(s);
    });
  }

  /* ---- Hình học ---- */
  const toRad = (d) => (d * Math.PI) / 180;
  function haversineM(a, b) {
    const R = 6371000;
    const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function bearingDeg(a, b) {
    const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
    const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
      Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
    return (Math.atan2(y, x) * 180) / Math.PI;
  }
  // Nội suy Catmull-Rom qua các waypoint dự phòng cho đường cong mượt giống đường thật.
  function smoothWaypoints(pts, perSeg) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < perSeg; j++) {
        const t = j / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) =>
          0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  // Chuẩn bị mảng khoảng cách cộng dồn để tra vị trí theo quãng đường đã đi.
  function buildTrack(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineM(coords[i - 1], coords[i]));
    return { coords, cum, totalM: cum[cum.length - 1] };
  }
  function pointAt(track, distM) {
    const { coords, cum } = track;
    const d = Math.min(Math.max(distM, 0), track.totalM);
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo);
    const segLen = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / segLen;
    const a = coords[i - 1], b = coords[i];
    return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, bearing: bearingDeg(a, b) };
  }

  /* ---- Lấy lộ trình: OSRM thật, lỗi -> mô phỏng ---- */
  async function fetchRoute() {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${ORIGIN.lng},${ORIGIN.lat};${DEST.lng},${DEST.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
      if (!res.ok) throw new Error("OSRM " + res.status);
      const data = await res.json();
      if (!data.routes || !data.routes.length) throw new Error("OSRM không trả về tuyến");
      return { coords: data.routes[0].geometry.coordinates, source: "osrm" };
    } catch (_) {
      return { coords: smoothWaypoints(FALLBACK_WAYPOINTS, 24), source: "fallback" };
    }
  }

  /* ---- Xe tải 3D dựng từ khối hộp (không cần model ngoài) ---- */
  function buildTruck(THREE) {
    const truck = new THREE.Group();
    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const box = (w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      truck.add(m);
      return m;
    };
    // Trục: X = ngang, Y = cao, Z = dọc thân xe (mũi xe hướng +Z).
    box(2.3, 2.6, 5.2, 0xffffff, 0, 2.0, -1.2);          // thùng lạnh
    box(2.31, 0.9, 5.21, 0x1d6f8d, 0, 2.9, -1.2);        // sọc xanh trên thùng
    box(2.1, 1.6, 1.7, 0x1d6f8d, 0, 1.45, 2.4);          // cabin
    box(1.9, 0.7, 0.1, 0x9fd7ea, 0, 1.85, 3.26);         // kính lái
    box(2.2, 0.35, 7.0, 0x333844, 0, 0.55, 0);           // gầm
    const wheel = (x, z) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14), mat(0x1b1e26));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.55, z);
      truck.add(w);
    };
    [[1.05, 2.4], [-1.05, 2.4], [1.05, -0.6], [-1.05, -0.6], [1.05, -2.2], [-1.05, -2.2]].forEach((p) => wheel(p[0], p[1]));
    return truck;
  }

  // Custom layer MapLibre render Three.js; vị trí/hướng xe cập nhật mỗi frame qua state.
  function createTruckLayer(maplibregl, THREE, state) {
    let camera, scene, renderer;
    return {
      id: "truck-3d", type: "custom", renderingMode: "3d",
      onAdd(map, gl) {
        camera = new THREE.Camera();
        scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(30, 80, 40);
        scene.add(sun);
        scene.add(buildTruck(THREE));
        renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        state.map = map;
      },
      render(gl, matrix) {
        const merc = maplibregl.MercatorCoordinate.fromLngLat([state.lng, state.lat], 0);
        const s = merc.meterInMercatorCoordinateUnits() * 2.2; // phóng to cho dễ nhìn
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z)
          .scale(new THREE.Vector3(s, -s, s))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI - toRad(state.bearing)));
        camera.projectionMatrix = m.multiply(l);
        renderer.resetState();
        renderer.render(scene, camera);
      },
    };
  }

  /* ---- Trang ---- */
  const el = (tag, attrs, children) => {
    const n = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (k === "class") n.className = v; else n.setAttribute(k, v); });
    (Array.isArray(children) ? children : children != null ? [children] : [])
      .forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  };
  const fmtClock = () => new Date().toLocaleTimeString("vi-VN");
  const fmtDur = (sec) => {
    if (!isFinite(sec) || sec < 0) return "—";
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m > 0 ? `${m} phút ${String(s).padStart(2, "0")} giây` : `${s} giây`;
  };

  let session = null; // phiên đang chạy; hủy khi rời trang

  function destroySession() {
    if (!session) return;
    session.alive = false;
    if (session.raf) cancelAnimationFrame(session.raf);
    clearInterval(session.sensorTimer);
    try { if (session.mapObj) session.mapObj.remove(); } catch (_) {}
    session = null;
  }

  async function view(viewHost, setHeader) {
    destroySession();
    setHeader("Bản đồ 3D", `Mô phỏng xe lạnh chạy ${ORIGIN.name} → ${DEST.name} trên bản đồ OpenStreetMap 3D.`);
    viewHost.innerHTML = "";

    const s = {
      alive: true, playing: false, distM: 0, speedMul: 1,
      lng: ORIGIN.lng, lat: ORIGIN.lat, bearing: 90,
      follow: true, temp: TEMP_BASE_C, hum: HUM_BASE_PCT,
      doorOpenUntil: 0, alertActive: false, lastTs: null,
      milestones: new Set(), arrived: false,
    };
    session = s;

    /* -- khung giao diện -- */
    const mapEl = el("div", { class: "m3d-map", id: "m3dMap" });
    const banner = el("div", { class: "m3d-banner", hidden: "hidden" });

    const btnPlay = el("button", { class: "btn btn-primary" }, "▶ Phát");
    const btnRestart = el("button", { class: "btn btn-ghost" }, "↺ Chạy lại");
    const btnFollow = el("button", { class: "btn btn-ghost m3d-active" }, "🎥 Camera bám xe");
    const selSpeed = el("select", { class: "m3d-speed" });
    [1, 2, 4].forEach((x) => selSpeed.appendChild(el("option", { value: x }, x + "×")));
    const routeTag = el("span", { class: "badge" }, "Đang tải lộ trình…");

    const progFill = el("div", { class: "m3d-prog-fill" });
    const progWrap = el("div", { class: "m3d-prog" }, progFill);
    const statHost = el("div", { class: "m3d-stats" });
    const stat = (label) => {
      const v = el("div", { class: "m-value" }, "—");
      statHost.appendChild(el("div", { class: "metric" }, [el("div", { class: "m-label" }, label), v]));
      return v;
    };
    const vProg = stat("Tiến độ"), vEta = stat("ETA"), vGps = stat("GPS trực tiếp"),
      vTemp = stat("Nhiệt độ khoang"), vHum = stat("Độ ẩm khoang");

    const logHost = el("div", { class: "m3d-log" });
    const logPanel = el("div", { class: "panel" }, [
      el("div", { class: "panel-title" }, "Nhật ký hành trình"), logHost,
    ]);

    const controls = el("div", { class: "panel m3d-controls" }, [
      el("div", { class: "toolbar" }, [btnPlay, btnRestart, btnFollow, selSpeed, routeTag]),
      progWrap, statHost,
    ]);

    viewHost.appendChild(el("div", { class: "m3d-wrap" }, [
      el("div", { class: "panel m3d-map-panel" }, [banner, mapEl]),
      el("div", { class: "m3d-side" }, [controls, logPanel]),
    ]));

    const addLog = (msg, level) => {
      logHost.prepend(el("div", { class: "m3d-log-item" + (level === "err" ? " m3d-log-err" : "") }, [
        el("span", { class: "m3d-log-time" }, fmtClock()), el("span", null, msg),
      ]));
      while (logHost.children.length > 60) logHost.removeChild(logHost.lastChild);
    };

    /* -- tải thư viện + lộ trình song song -- */
    let libs, routeRes;
    try {
      [libs, routeRes] = await Promise.all([loadLibs(), fetchRoute()]);
    } catch (err) {
      mapEl.appendChild(el("div", { class: "map-fallback" },
        "Không tải được thư viện bản đồ (cần internet lần đầu). Kiểm tra kết nối rồi bấm Làm mới."));
      return;
    }
    if (!s.alive) return;
    const { maplibregl, THREE } = libs;
    const track = buildTrack(routeRes.coords);
    routeTag.textContent = routeRes.source === "osrm"
      ? "Lộ trình OSRM (đường thật)" : "Lộ trình mô phỏng (mất mạng OSRM)";
    routeTag.className = "badge " + (routeRes.source === "osrm" ? "badge-intact" : "badge-tamper");
    addLog(routeRes.source === "osrm"
      ? `Đã lấy lộ trình bám đường thật từ OSRM (${(track.totalM / 1000).toFixed(1)} km).`
      : "Không gọi được OSRM — dùng lộ trình mô phỏng dựng sẵn.");

    /* -- khởi tạo bản đồ -- */
    const map = new maplibregl.Map({
      container: mapEl,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [ORIGIN.lng, ORIGIN.lat],
      zoom: 14.5, pitch: FOLLOW_PITCH, bearing: 0, antialias: true,
    });
    s.mapObj = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    // Người dùng tự kéo bản đồ -> tạm tắt camera bám xe.
    map.on("dragstart", () => setFollow(false));

    map.on("load", () => {
      if (!s.alive) return;
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: track.coords } },
      });
      map.addLayer({
        id: "route-casing", type: "line", source: "route",
        paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        paint: { "line-color": "#1d6f8d", "line-width": 5 },
      });
      map.addLayer(createTruckLayer(maplibregl, THREE, s));
      new maplibregl.Marker({ color: "#1f9d55" }).setLngLat([ORIGIN.lng, ORIGIN.lat])
        .setPopup(new maplibregl.Popup().setText(ORIGIN.name)).addTo(map);
      new maplibregl.Marker({ color: "#e65f2b" }).setLngLat([DEST.lng, DEST.lat])
        .setPopup(new maplibregl.Popup().setText(DEST.name)).addTo(map);
      const b = track.coords.reduce(
        (acc, c) => acc.extend(c),
        new maplibregl.LngLatBounds(track.coords[0], track.coords[0]));
      map.fitBounds(b, { padding: 70, pitch: 45, duration: 900 });
      addLog("Bản đồ 3D sẵn sàng — kéo để xoay, cuộn để thu phóng, giữ chuột phải để nghiêng.");
    });

    /* -- điều khiển -- */
    function setFollow(on) {
      s.follow = on;
      btnFollow.classList.toggle("m3d-active", on);
    }
    function setPlaying(on) {
      s.playing = on;
      s.lastTs = null;
      btnPlay.textContent = on ? "⏸ Tạm dừng" : "▶ Phát";
      btnPlay.className = "btn " + (on ? "btn-ghost" : "btn-primary");
    }
    btnPlay.addEventListener("click", () => {
      if (s.arrived) return;
      setPlaying(!s.playing);
      addLog(s.playing ? "Bắt đầu / tiếp tục hành trình." : "Tạm dừng hành trình.");
      if (s.playing) setFollow(true);
    });
    btnRestart.addEventListener("click", () => {
      s.distM = 0; s.arrived = false; s.milestones.clear();
      setPlaying(false);
      setFollow(true);
      applyPosition();
      addLog("Đặt lại hành trình về điểm xuất phát " + ORIGIN.name + ".");
    });
    btnFollow.addEventListener("click", () => setFollow(!s.follow));
    selSpeed.addEventListener("change", () => { s.speedMul = Number(selSpeed.value) || 1; });

    /* -- cập nhật vị trí + HUD -- */
    const simSpeedMps = track.totalM / SIM_DURATION_S; // m/s theo thời gian thực ở 1x
    function applyPosition() {
      const p = pointAt(track, s.distM);
      s.lng = p.lng; s.lat = p.lat;
      // làm mượt hướng xe để không giật khi qua khúc cua
      let diff = ((p.bearing - s.bearing + 540) % 360) - 180;
      s.bearing += diff * 0.25;

      const frac = track.totalM ? s.distM / track.totalM : 0;
      progFill.style.width = (frac * 100).toFixed(1) + "%";
      vProg.textContent = (frac * 100).toFixed(0) + "% · " + (s.distM / 1000).toFixed(2) + "/" + (track.totalM / 1000).toFixed(2) + " km";
      const remainS = (track.totalM - s.distM) / (TRUCK_SPEED_KMH / 3.6);
      vEta.textContent = s.arrived ? "Đã đến nơi" : fmtDur(remainS) + ` (xe ${TRUCK_SPEED_KMH} km/h)`;
      vGps.textContent = p.lat.toFixed(5) + ", " + p.lng.toFixed(5);

      [25, 50, 75].forEach((ms) => {
        if (frac * 100 >= ms && !s.milestones.has(ms)) {
          s.milestones.add(ms);
          addLog(`Đã đi được ${ms}% quãng đường (${(s.distM / 1000).toFixed(1)} km).`);
        }
      });
      if (s.follow && s.mapObj) {
        s.mapObj.jumpTo({ center: [s.lng, s.lat], bearing: s.bearing, pitch: FOLLOW_PITCH, zoom: FOLLOW_ZOOM });
      } else if (s.mapObj) {
        s.mapObj.triggerRepaint();
      }
    }

    function frame(ts) {
      if (!s.alive) return;
      s.raf = requestAnimationFrame(frame);
      if (!s.playing) { s.lastTs = null; return; }
      if (s.lastTs == null) { s.lastTs = ts; return; }
      const dt = Math.min((ts - s.lastTs) / 1000, 0.25);
      s.lastTs = ts;
      s.distM += simSpeedMps * s.speedMul * dt;
      if (s.distM >= track.totalM) {
        s.distM = track.totalM;
        s.arrived = true;
        setPlaying(false);
        addLog("🏁 Xe đã đến " + DEST.name + ". Hành trình hoàn tất.");
      }
      applyPosition();
    }
    s.raf = requestAnimationFrame(frame);
    applyPosition();

    /* -- cảm biến khoang lạnh (mô phỏng realtime) -- */
    function sensorTick() {
      if (!s.alive) return;
      const now = Date.now();
      // Thỉnh thoảng "mở cửa khoang" khi đang chạy -> nhiệt tăng vượt ngưỡng để demo cảnh báo.
      if (s.playing && s.doorOpenUntil < now && Math.random() < 0.06) {
        s.doorOpenUntil = now + 10000;
        addLog("Cửa khoang lạnh mở — nhiệt độ bắt đầu tăng.");
      }
      const target = s.doorOpenUntil > now ? TEMP_ALERT_C + 1.8 : TEMP_BASE_C;
      s.temp += (target - s.temp) * 0.3 + (Math.random() - 0.5) * 0.4;
      s.hum += ((HUM_BASE_PCT - s.hum) * 0.2) + (Math.random() - 0.5) * 1.6;

      const isAlert = s.temp > TEMP_ALERT_C;
      vTemp.textContent = s.temp.toFixed(1) + " °C";
      vTemp.style.color = isAlert ? "#c53030" : "";
      vHum.textContent = s.hum.toFixed(0) + " %";
      if (isAlert && !s.alertActive) {
        s.alertActive = true;
        banner.hidden = false;
        banner.textContent = `⚠ CẢNH BÁO: nhiệt độ khoang lạnh ${s.temp.toFixed(1)}°C vượt ngưỡng ${TEMP_ALERT_C}°C!`;
        addLog(`Nhiệt độ ${s.temp.toFixed(1)}°C vượt ngưỡng ${TEMP_ALERT_C}°C.`, "err");
      } else if (!isAlert && s.alertActive) {
        s.alertActive = false;
        banner.hidden = true;
        addLog("Nhiệt độ khoang lạnh trở lại ngưỡng an toàn (" + s.temp.toFixed(1) + "°C).");
      } else if (isAlert) {
        banner.textContent = `⚠ CẢNH BÁO: nhiệt độ khoang lạnh ${s.temp.toFixed(1)}°C vượt ngưỡng ${TEMP_ALERT_C}°C!`;
      }
    }
    s.sensorTimer = setInterval(sensorTick, SENSOR_INTERVAL_MS);
    sensorTick();
    addLog("Kết nối cảm biến khoang lạnh (nhiệt độ / độ ẩm, chu kỳ 2 giây).");
  }

  global.Map3D = { view, destroy: destroySession };
})(window);
