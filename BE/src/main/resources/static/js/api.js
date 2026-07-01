/* Thin REST client cho backend Cold Chain. Cùng origin nên không cần CORS. */
(function (global) {
  "use strict";

  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (networkErr) {
      throw new ApiError("NETWORK", "Không kết nối được backend (kiểm tra server đã chạy chưa).", 0);
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = text; }
    }

    if (data && Array.isArray(data.content) && typeof data.totalPages === 'number') {
      data = data.content;
    }

    if (!res.ok) {
      const code = (data && data.code) || "HTTP_" + res.status;
      const msg = (data && data.message) || ("Lỗi HTTP " + res.status);
      throw new ApiError(code, msg, res.status, data && data.details);
    }
    return data;
  }

  class ApiError extends Error {
    constructor(code, message, status, details) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details || {};
    }
  }

  const Api = {
    ApiError,
    // Dashboard
    stats: () => request("GET", "/api/admin/dashboard/stats"),
    // Shipments
    listShipments: () => request("GET", "/api/admin/shipments?size=100"),
    createShipment: (payload) => request("POST", "/api/admin/shipments", payload),
    updateShipmentStatus: (code, status) => request("PUT", "/api/admin/shipments/" + encodeURIComponent(code) + "/status", { status }),
    // Devices
    listDevices: () => request("GET", "/api/admin/devices?size=100"),
    // Verify codes
    listVerifyCodes: () => request("GET", "/api/admin/verify-codes?size=100"),
    generateCode: (payload) => request("POST", "/api/admin/devices/generate-code", payload),
    // Per-shipment monitoring
    telemetry: (code) => request("GET", "/api/shipments/" + encodeURIComponent(code) + "/telemetry?size=500"),
    alerts: (code) => request("GET", "/api/shipments/" + encodeURIComponent(code) + "/alerts?size=100"),
    // Integrity / notary
    integrityStatus: () => request("GET", "/api/admin/integrity/status"),
    createAnchor: () => request("POST", "/api/admin/integrity/anchor"),
  };

  global.Api = Api;
})(window);
