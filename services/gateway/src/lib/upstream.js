// One place for every call the gateway makes to another service.

class UpstreamError extends Error {
  constructor(service, cause) {
    super(`${service} unavailable: ${cause.message}`);
    this.service = service;
    this.status = cause.name === "TimeoutError" ? 504 : 502;
  }
}

/**
 * Calls a service and returns { ok, status, data }. Network failures and
 * timeouts throw an UpstreamError; HTTP error statuses are returned as-is so
 * the caller can pass them through.
 */
async function call(service, baseUrl, path, { method = "GET", body, timeoutMs }) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    throw new UpstreamError(service, err);
  }
}

/** Sends a service's answer to the client unchanged (status and body). */
function passThrough(res, service, result) {
  if (result.data === null) {
    return res.status(502).json({ error: `unexpected response from ${service}` });
  }
  return res.status(result.status).json(result.data);
}

module.exports = { call, passThrough, UpstreamError };
