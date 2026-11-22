// VeriPulse — MAIN World Geolocation Spoofer (runs at document_start)
// Overrides navigator.geolocation & navigator.permissions cleanly with zero external requests.

(() => {
  if (window.__veripulseGeoSpoofInstalled) return;
  window.__veripulseGeoSpoofInstalled = true;

  const nativeGeo = navigator.geolocation;
  if (!nativeGeo) return;

  const nativeGetCurrent = nativeGeo.getCurrentPosition.bind(nativeGeo);
  const nativeWatchPosition = nativeGeo.watchPosition.bind(nativeGeo);
  const nativeClearWatch = nativeGeo.clearWatch.bind(nativeGeo);

  let currentConfig = null;
  let configResolved = false;
  const pendingBootCallbacks = [];

  const activeWatches = new Map();
  let nextWatchId = 91000;

  function toRadians(deg) {
    return (deg * Math.PI) / 180;
  }

  function computeBearing(lat1, lng1, lat2, lng2) {
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const dLambda = toRadians(lng2 - lng1);
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }

  function buildGeoPosition(cfg, overrideCoords) {
    const lat = Number(overrideCoords?.latitude ?? cfg.latitude) || 0;
    const lng = Number(overrideCoords?.longitude ?? cfg.longitude) || 0;
    const acc = Math.max(1, Number(cfg.accuracy) || 15);
    const alt =
      cfg.altitude === null || cfg.altitude === undefined || cfg.altitude === ''
        ? null
        : Number(cfg.altitude);
    const heading =
      overrideCoords?.heading !== undefined
        ? overrideCoords.heading
        : cfg.heading === null || cfg.heading === undefined || cfg.heading === ''
          ? null
          : Number(cfg.heading);
    const speed =
      overrideCoords?.speed !== undefined
        ? overrideCoords.speed
        : cfg.speed === null || cfg.speed === undefined || cfg.speed === ''
          ? null
          : Number(cfg.speed);

    const coords = {
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      altitude: Number.isFinite(alt) ? alt : null,
      altitudeAccuracy: Number.isFinite(alt) ? 5 : null,
      heading: Number.isFinite(heading) ? heading : null,
      speed: Number.isFinite(speed) ? speed : null,
      toJSON() {
        return {
          latitude: this.latitude,
          longitude: this.longitude,
          accuracy: this.accuracy,
          altitude: this.altitude,
          altitudeAccuracy: this.altitudeAccuracy,
          heading: this.heading,
          speed: this.speed,
        };
      },
    };

    const pos = {
      coords,
      timestamp: Date.now(),
      __veripulseSpoofed: true,
      toJSON() {
        return {
          coords: coords.toJSON(),
          timestamp: this.timestamp,
        };
      },
    };
    return pos;
  }

  function withResolvedConfig(fn) {
    if (configResolved) {
      fn();
      return;
    }
    pendingBootCallbacks.push(fn);
  }

  function flushPendingBoot() {
    if (configResolved) return;
    configResolved = true;
    while (pendingBootCallbacks.length > 0) {
      const fn = pendingBootCallbacks.shift();
      try {
        fn();
      } catch {
        // Ignore callback error
      }
    }
  }

  // Fallback timer in case content script hasn't answered within 120ms
  setTimeout(flushPendingBoot, 120);

  function computeWatchPosition(entry) {
    const cfg = currentConfig;
    if (!cfg || !cfg.enabled) return null;

    if (!cfg.simulateMovement) {
      return buildGeoPosition(cfg);
    }

    const startLat = Number(cfg.latitude) || 0;
    const startLng = Number(cfg.longitude) || 0;
    const endLat = Number(cfg.routeEndLat);
    const endLng = Number(cfg.routeEndLng);
    if (!Number.isFinite(endLat) || !Number.isFinite(endLng)) {
      return buildGeoPosition(cfg);
    }

    // Ping-pong interpolation from Point A to Point B across 20 steps
    const totalSteps = 20;
    const cycle = entry.step % (totalSteps * 2);
    const t = cycle <= totalSteps ? cycle / totalSteps : (totalSteps * 2 - cycle) / totalSteps;
    const forward = cycle <= totalSteps;

    const lat = startLat + (endLat - startLat) * t;
    const lng = startLng + (endLng - startLng) * t;
    const heading = forward
      ? computeBearing(startLat, startLng, endLat, endLng)
      : computeBearing(endLat, endLng, startLat, startLng);

    entry.step += 1;
    return buildGeoPosition(cfg, {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      heading: Math.round(heading),
      speed: Number(cfg.speed) > 0 ? Number(cfg.speed) : 8.5,
    });
  }

  function refreshActiveWatches() {
    for (const [id, entry] of activeWatches.entries()) {
      if (currentConfig && currentConfig.enabled) {
        // Switching to spoofed mode: clear any native watch first
        if (entry.nativeId !== null) {
          try {
            nativeClearWatch(entry.nativeId);
          } catch {
            // Ignore
          }
          entry.nativeId = null;
        }
        if (entry.timerId) {
          clearInterval(entry.timerId);
        }
        const pos = computeWatchPosition(entry);
        if (pos) {
          try {
            entry.success(pos);
          } catch {
            // Ignore subscriber error
          }
        }
        const intervalMs = Math.max(
          1000,
          (Number(currentConfig.routeIntervalSec) || 3) * 1000
        );
        entry.timerId = setInterval(() => {
          if (!activeWatches.has(id) || !currentConfig?.enabled) return;
          const nextPos = computeWatchPosition(entry);
          if (nextPos) {
            try {
              entry.success(nextPos);
            } catch {
              // Ignore subscriber error
            }
          }
        }, intervalMs);
      } else {
        // Spoof disabled: stop synthetic interval
        if (entry.timerId) {
          clearInterval(entry.timerId);
          entry.timerId = null;
        }
        if (entry.nativeId === null) {
          entry.nativeId = nativeWatchPosition(
            entry.success,
            entry.error,
            entry.options
          );
        }
      }
    }
  }

  const spoofedGetCurrentPosition = function (success, error, options) {
    if (typeof success !== 'function') return;
    withResolvedConfig(() => {
      if (currentConfig && currentConfig.enabled) {
        const pos = buildGeoPosition(currentConfig);
        setTimeout(() => {
          try {
            success(pos);
          } catch {
            // Ignore user callback error
          }
        }, 12);
        return;
      }
      nativeGetCurrent(success, error, options);
    });
  };

  const spoofedWatchPosition = function (success, error, options) {
    const id = nextWatchId++;
    const entry = {
      id,
      success,
      error,
      options,
      timerId: null,
      nativeId: null,
      step: 0,
    };
    activeWatches.set(id, entry);

    withResolvedConfig(() => {
      if (!activeWatches.has(id)) return;
      if (currentConfig && currentConfig.enabled) {
        const pos = computeWatchPosition(entry);
        if (pos) {
          setTimeout(() => {
            if (activeWatches.has(id)) {
              try {
                success(pos);
              } catch {
                // Ignore
              }
            }
          }, 12);
        }
        const intervalMs = Math.max(
          1000,
          (Number(currentConfig.routeIntervalSec) || 3) * 1000
        );
        entry.timerId = setInterval(() => {
          if (!activeWatches.has(id) || !currentConfig?.enabled) return;
          const nextPos = computeWatchPosition(entry);
          if (nextPos) {
            try {
              success(nextPos);
            } catch {
              // Ignore
            }
          }
        }, intervalMs);
      } else {
        entry.nativeId = nativeWatchPosition(success, error, options);
      }
    });

    return id;
  };

  const spoofedClearWatch = function (watchId) {
    const entry = activeWatches.get(watchId);
    if (entry) {
      if (entry.timerId) clearInterval(entry.timerId);
      if (entry.nativeId !== null) {
        try {
          nativeClearWatch(entry.nativeId);
        } catch {
          // Ignore
        }
      }
      activeWatches.delete(watchId);
      return;
    }
    try {
      nativeClearWatch(watchId);
    } catch {
      // Ignore
    }
  };

  try {
    Object.defineProperty(nativeGeo, 'getCurrentPosition', {
      value: spoofedGetCurrentPosition,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(nativeGeo, 'watchPosition', {
      value: spoofedWatchPosition,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(nativeGeo, 'clearWatch', {
      value: spoofedClearWatch,
      configurable: true,
      writable: true,
    });
  } catch {
    nativeGeo.getCurrentPosition = spoofedGetCurrentPosition;
    nativeGeo.watchPosition = spoofedWatchPosition;
    nativeGeo.clearWatch = spoofedClearWatch;
  }

  // Ensure Permissions API reports "granted" when Fake GPS spoofing is ON
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    const nativePermQuery = navigator.permissions.query.bind(navigator.permissions);
    const patchedPermQuery = function (desc) {
      if (
        desc &&
        desc.name === 'geolocation' &&
        currentConfig &&
        currentConfig.enabled
      ) {
        return Promise.resolve({
          name: 'geolocation',
          state: 'granted',
          status: 'granted',
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        });
      }
      return nativePermQuery(desc);
    };
    try {
      Object.defineProperty(navigator.permissions, 'query', {
        value: patchedPermQuery,
        configurable: true,
        writable: true,
      });
    } catch {
      navigator.permissions.query = patchedPermQuery;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === 'VERIPULSE_GPS_CONFIG') {
      currentConfig = event.data.config || null;
      flushPendingBoot();
      refreshActiveWatches();
    } else if (event.data.source === 'VERIPULSE_PROBE_GEO_REQ') {
      const requestId = event.data.requestId;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.postMessage(
            {
              source: 'VERIPULSE_PROBE_GEO_RES',
              requestId,
              ok: true,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
              timestamp: pos.timestamp,
              spoofed: Boolean(pos.__veripulseSpoofed),
            },
            '*'
          );
        },
        (err) => {
          window.postMessage(
            {
              source: 'VERIPULSE_PROBE_GEO_RES',
              requestId,
              ok: false,
              error: err.message || 'Geolocation blocked or unavailable.',
            },
            '*'
          );
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
      );
    }
  });

  // Request initial config immediately in case content script already loaded
  window.postMessage({ source: 'VERIPULSE_GPS_REQUEST_CONFIG' }, '*');
})();
