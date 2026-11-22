import React, { useMemo, useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  Crosshair,
  Globe2,
  MapPin,
  Navigation,
  Play,
  Plus,
  Power,
  Radar,
  Route,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { pickLang } from '../i18n/translations';
import {
  BD_BOUNDS,
  BD_DIVISIONS,
  BD_LOCATIONS,
  BD_OUTLINE_COORDS,
  BD_RIVER_COORDS,
  BD_ROUTE_PRESETS,
  BdDivision,
  BdLocationPin,
  BdRoutePreset,
  detectNearestBdLocation,
  DHAKA_METRO_BOUNDS,
  projectLatLngToSvg,
  unprojectSvgToLatLng,
} from '../data/bangladeshLocations';
import {
  AppLanguage,
  FakeGpsConfig,
  ProjectWorkspace,
  SavedGpsLocation,
} from '../types/flowguard';
import {
  isChromeExtensionContext,
  probeActiveTabGeolocation,
} from '../utils/extensionBridge';

interface FakeGpsViewProps {
  project: ProjectWorkspace;
  lang: AppLanguage;
  config: FakeGpsConfig;
  onUpdateConfig: (next: FakeGpsConfig) => void;
  onUpdateProject: (next: ProjectWorkspace) => void;
  onNotify?: (message: string) => void;
}

type MapViewMode = 'bd' | 'dhaka' | 'world';

// Simplified offline continent polygon silhouettes (Equirectangular 0..360 x 0..180)
const WORLD_SILHOUETTES = [
  'M 32,26 L 88,20 L 116,38 L 96,62 L 82,78 L 76,66 L 56,56 L 40,42 Z',
  'M 96,86 L 122,94 L 136,112 L 120,144 L 106,156 L 98,128 L 92,102 Z',
  'M 166,24 L 208,22 L 214,42 L 194,50 L 172,48 L 164,38 Z',
  'M 168,56 L 208,56 L 226,78 L 214,116 L 198,136 L 184,118 L 174,88 L 160,74 Z',
  'M 212,24 L 308,26 L 326,48 L 304,76 L 274,88 L 246,84 L 222,70 L 212,48 Z',
  'M 288,116 L 326,114 L 332,140 L 300,144 L 284,132 Z',
];

function clampLat(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(-90, Math.min(90, Number(val.toFixed(6))));
}

function clampLng(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(-180, Math.min(180, Number(val.toFixed(6))));
}

function parseCoordinateInput(raw: string): { lat: number; lng: number } | null {
  const txt = raw.trim();
  if (!txt) return null;

  // Match Google Maps @lat,lng
  const atMatch = txt.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  // Match ?q=lat,lng or !3dlat!4dlng
  const dMatch = txt.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (dMatch) {
    const lat = Number(dMatch[1]);
    const lng = Number(dMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  // Generic "lat, lng" or "lat lng"
  const pairMatch = txt.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (pairMatch) {
    const lat = Number(pairMatch[1]);
    const lng = Number(pairMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const FakeGpsView: React.FC<FakeGpsViewProps> = ({
  project,
  lang,
  config,
  onUpdateConfig,
  onUpdateProject,
  onNotify,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileNote, setProfileNote] = useState('');
  const [pickTarget, setPickTarget] = useState<'start' | 'end'>('start');
  const [codegenLang, setCodegenLang] = useState<'playwright_ts' | 'playwright_py'>(
    'playwright_ts'
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    ok: boolean;
    source?: 'active_tab' | 'studio_preview';
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    spoofed?: boolean;
    error?: string;
    checkedAt: string;
  } | null>(null);

  // Geofence / Delivery Zone Boundary Tester state
  const [geoHubLat, setGeoHubLat] = useState<number>(23.7925);
  const [geoHubLng, setGeoHubLng] = useState<number>(90.4078);
  const [geoRadiusM, setGeoRadiusM] = useState<number>(500);

  // Bangladesh-first Interactive Map state
  const [mapMode, setMapMode] = useState<MapViewMode>('bd');
  const [bdDivisionFilter, setBdDivisionFilter] = useState<'All' | BdDivision>('All');
  const [bdSearch, setBdSearch] = useState('');

  const savedLocations = project.savedGpsLocations || [];
  const extActive = isChromeExtensionContext();

  const nearestBd = useMemo(
    () => detectNearestBdLocation(config.latitude, config.longitude),
    [config.latitude, config.longitude]
  );

  const filteredBdLocations = useMemo(() => {
    const q = bdSearch.trim().toLowerCase();
    return BD_LOCATIONS.filter((loc) => {
      if (bdDivisionFilter !== 'All' && loc.division !== bdDivisionFilter) return false;
      if (
        q &&
        !loc.nameEn.toLowerCase().includes(q) &&
        !loc.nameBn.toLowerCase().includes(q) &&
        !loc.division.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [bdDivisionFilter, bdSearch]);

  const geofenceDistanceM = useMemo(
    () => Math.round(haversineKm(geoHubLat, geoHubLng, config.latitude, config.longitude) * 1000),
    [geoHubLat, geoHubLng, config.latitude, config.longitude]
  );
  const isInsideGeofence = geofenceDistanceM <= geoRadiusM;

  const handleSetHubToCurrentPin = () => {
    setGeoHubLat(config.latitude);
    setGeoHubLng(config.longitude);
    onNotify?.(
      pickLang(
        lang,
        'Geofence hub centered on current pin.',
        'জিওফেন্স হাব বর্তমান পিনে সেট হয়েছে।'
      )
    );
  };

  const handleJumpGeofenceBoundary = (target: 'inside' | 'outside') => {
    const safeRadius = Math.max(50, geoRadiusM);
    const targetMeters = target === 'inside' ? Math.max(10, safeRadius - 30) : safeRadius + 50;
    // 1 degree latitude ~ 111,320 meters
    const deltaLat = targetMeters / 111320;
    const nextLat = clampLat(geoHubLat + deltaLat);
    onUpdateConfig({
      ...config,
      latitude: nextLat,
      longitude: clampLng(geoHubLng),
      locationLabel:
        target === 'inside'
          ? `Geofence Inside (${targetMeters}m)`
          : `Geofence Outside (${targetMeters}m)`,
      updatedAt: new Date().toISOString(),
    });
    onNotify?.(
      pickLang(
        lang,
        `Moved spoofed pin ${target === 'inside' ? 'inside' : 'outside'} geofence (~${targetMeters}m from hub).`,
        `পিন জিওফেন্সের ${target === 'inside' ? 'ভিতরে' : 'বাইরে'} নেওয়া হয়েছে (~${targetMeters}মি.)।`
      )
    );
  };

  const handleToggleEnabled = () => {
    const nextEnabled = !config.enabled;
    onUpdateConfig({
      ...config,
      enabled: nextEnabled,
      updatedAt: new Date().toISOString(),
    });
    onNotify?.(
      nextEnabled
        ? pickLang(
            lang,
            `Fake GPS activated (${config.latitude.toFixed(4)}, ${config.longitude.toFixed(4)}).`,
            `ফেইক জিপিএস চালু হয়েছে (${config.latitude.toFixed(4)}, ${config.longitude.toFixed(4)})।`
          )
        : pickLang(
            lang,
            'Fake GPS disabled — real browser location restored.',
            'ফেইক জিপিএস বন্ধ করা হয়েছে — আসল লোকেশন চালু আছে।'
          )
    );
  };

  const handleApplyBdLocation = (loc: BdLocationPin) => {
    const displayLabel = lang === 'bn' ? loc.nameBn : loc.nameEn;
    if (pickTarget === 'end' && config.simulateMovement) {
      onUpdateConfig({
        ...config,
        routeEndLat: loc.lat,
        routeEndLng: loc.lng,
        updatedAt: new Date().toISOString(),
      });
      onNotify?.(
        pickLang(
          lang,
          `Route Point B set to ${loc.nameEn}.`,
          `রুট Point B সেট করা হয়েছে: ${loc.nameBn}`
        )
      );
      return;
    }

    onUpdateConfig({
      ...config,
      latitude: loc.lat,
      longitude: loc.lng,
      accuracy: loc.accuracy,
      altitude: loc.altitude,
      locationLabel: displayLabel,
      updatedAt: new Date().toISOString(),
    });
    onNotify?.(
      pickLang(
        lang,
        `Coordinates set to ${loc.nameEn}.`,
        `কো-অর্ডিনেট সেট করা হয়েছে: ${loc.nameBn}`
      )
    );
  };

  const handleApplyBdRoute = (rt: BdRoutePreset) => {
    onUpdateConfig({
      ...config,
      enabled: true,
      latitude: rt.startLat,
      longitude: rt.startLng,
      routeEndLat: rt.endLat,
      routeEndLng: rt.endLng,
      routeIntervalSec: rt.intervalSec,
      simulateMovement: true,
      locationLabel: rt.startLabel,
      updatedAt: new Date().toISOString(),
    });
    onNotify?.(
      pickLang(
        lang,
        `Active BD route: ${rt.labelEn}`,
        `বাংলাদেশ রুট চালু হয়েছে: ${rt.labelBn}`
      )
    );
  };

  const handleSmartPaste = () => {
    const parsed = parseCoordinateInput(pasteText);
    if (!parsed) {
      onNotify?.(
        pickLang(
          lang,
          'Could not detect coordinates. Try "23.8103, 90.4125" or a Google Maps URL.',
          'সঠিক কো-অর্ডিনেট পাওয়া যায়নি। "23.8103, 90.4125" অথবা Google Maps লিংক দিন।'
        )
      );
      return;
    }
    if (pickTarget === 'end' && config.simulateMovement) {
      onUpdateConfig({
        ...config,
        routeEndLat: clampLat(parsed.lat),
        routeEndLng: clampLng(parsed.lng),
        updatedAt: new Date().toISOString(),
      });
    } else {
      onUpdateConfig({
        ...config,
        latitude: clampLat(parsed.lat),
        longitude: clampLng(parsed.lng),
        locationLabel: `Custom (${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)})`,
        updatedAt: new Date().toISOString(),
      });
    }
    setPasteText('');
    onNotify?.(
      pickLang(
        lang,
        `Extracted coordinates: ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}.`,
        `কো-অর্ডিনেট বসানো হয়েছে: ${parsed.lat.toFixed(5)}, ${parsed.lng.toFixed(5)}`
      )
    );
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    let lat = 23.8103;
    let lng = 90.4125;
    if (mapMode === 'bd') {
      const pt = unprojectSvgToLatLng(xRatio * 360, yRatio * 420, BD_BOUNDS, 360, 420);
      lat = clampLat(pt.lat);
      lng = clampLng(pt.lng);
    } else if (mapMode === 'dhaka') {
      const pt = unprojectSvgToLatLng(
        xRatio * 360,
        yRatio * 320,
        DHAKA_METRO_BOUNDS,
        360,
        320
      );
      lat = clampLat(pt.lat);
      lng = clampLng(pt.lng);
    } else {
      lng = clampLng(xRatio * 360 - 180);
      lat = clampLat(90 - yRatio * 180);
    }

    const nearest = detectNearestBdLocation(lat, lng);
    const autoLabel =
      nearest.insideBd && nearest.distanceKm <= 25
        ? `Near ${lang === 'bn' ? nearest.nearest.nameBn : nearest.nearest.nameEn} (${lat.toFixed(3)}, ${lng.toFixed(3)})`
        : `Map Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

    if (pickTarget === 'end' && config.simulateMovement) {
      onUpdateConfig({
        ...config,
        routeEndLat: lat,
        routeEndLng: lng,
        updatedAt: new Date().toISOString(),
      });
    } else {
      onUpdateConfig({
        ...config,
        latitude: lat,
        longitude: lng,
        locationLabel: autoLabel,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const name =
      profileName.trim() ||
      config.locationLabel.trim() ||
      `GPS ${config.latitude.toFixed(3)}, ${config.longitude.toFixed(3)}`;

    const item: SavedGpsLocation = {
      id: `gps_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      latitude: Number(config.latitude) || 0,
      longitude: Number(config.longitude) || 0,
      accuracy: Math.max(1, Number(config.accuracy) || 15),
      altitude: config.altitude,
      heading: config.heading,
      speed: config.speed,
      note: profileNote.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onUpdateProject({
      ...project,
      savedGpsLocations: [item, ...savedLocations],
    });
    setProfileName('');
    setProfileNote('');
    onNotify?.(
      pickLang(
        lang,
        `Saved GPS profile "${item.name}".`,
        `"${item.name}" জিপিএস প্রোফাইল সেভ হয়েছে।`
      )
    );
  };

  const handleApplySavedProfile = (item: SavedGpsLocation) => {
    onUpdateConfig({
      ...config,
      enabled: true,
      latitude: item.latitude,
      longitude: item.longitude,
      accuracy: item.accuracy,
      altitude: item.altitude ?? null,
      heading: item.heading ?? null,
      speed: item.speed ?? null,
      locationLabel: item.name,
      updatedAt: new Date().toISOString(),
    });
    onNotify?.(
      pickLang(
        lang,
        `Applied & activated "${item.name}".`,
        `"${item.name}" লোকেশন চালু করা হয়েছে।`
      )
    );
  };

  const handleDeleteSavedProfile = (id: string) => {
    onUpdateProject({
      ...project,
      savedGpsLocations: savedLocations.filter((x) => x.id !== id),
    });
    // Deletion confirmation + 3-day Recycle Bin toast handled centrally by App.tsx
  };

  const handleProbeGeolocation = async () => {
    setProbing(true);
    const res = await probeActiveTabGeolocation();
    setProbeResult({
      ...res,
      checkedAt: new Date().toLocaleTimeString(),
    });
    setProbing(false);
  };

  const routeDistanceKm = useMemo(() => {
    return haversineKm(
      config.latitude,
      config.longitude,
      config.routeEndLat,
      config.routeEndLng
    );
  }, [config.latitude, config.longitude, config.routeEndLat, config.routeEndLng]);

  const codegenSnippet = useMemo(() => {
    const lat = Number(config.latitude).toFixed(6);
    const lng = Number(config.longitude).toFixed(6);
    const acc = Math.max(1, Number(config.accuracy) || 15);
    if (codegenLang === 'playwright_py') {
      return `import pytest
from playwright.sync_api import sync_playwright

def test_geolocation_${project.activeEnvironment}():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            geolocation={"latitude": ${lat}, "longitude": ${lng}, "accuracy": ${acc}},
            permissions=["geolocation"],
        )
        page = context.new_page()
        page.goto("https://${project.domain}/")
        # Verify geo-dependent UI updates
        browser.close()`;
    }
    return `import { test, expect } from '@playwright/test';

test.use({
  geolocation: { latitude: ${lat}, longitude: ${lng}, accuracy: ${acc} },
  permissions: ['geolocation'],
});

test('verify location behavior on ${project.activeEnvironment}', async ({ page }) => {
  await page.goto('https://${project.domain}/');
  // Assert delivery zone / nearby store / currency detection
});`;
  }, [codegenLang, config.latitude, config.longitude, config.accuracy, project.activeEnvironment, project.domain]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(codegenSnippet);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
      onNotify?.(
        pickLang(lang, 'Copied automation snippet.', 'অটোমেশন কোড কপি হয়েছে।')
      );
    } catch {
      // Ignore clipboard failure
    }
  };

  const worldStartX = ((clampLng(config.longitude) + 180) / 360) * 360;
  const worldStartY = ((90 - clampLat(config.latitude)) / 180) * 180;
  const worldEndX = ((clampLng(config.routeEndLng) + 180) / 360) * 360;
  const worldEndY = ((90 - clampLat(config.routeEndLat)) / 180) * 180;

  const bdOutlinePath = useMemo(() => {
    const pts = BD_OUTLINE_COORDS.map(([lat, lng]) =>
      projectLatLngToSvg(lat, lng, BD_BOUNDS, 360, 420)
    );
    return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z`;
  }, []);

  const bdRiverPaths = useMemo(
    () =>
      BD_RIVER_COORDS.map((river) => {
        const pts = river.points.map(([lat, lng]) =>
          projectLatLngToSvg(lat, lng, BD_BOUNDS, 360, 420)
        );
        return {
          name: river.name,
          d: pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        };
      }),
    []
  );

  return (
    <div className="space-y-5">
      {/* Header & Live Master Override Switch */}
      <div
        className={`rounded-xl border p-5 shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors ${
          config.enabled
            ? 'border-cyan-300 dark:border-cyan-800 bg-gradient-to-r from-cyan-50/90 to-teal-50/70 dark:from-cyan-950/50 dark:to-teal-950/30'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              config.enabled
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Navigation className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pickLang(
                  lang,
                  'Bangladesh Fake GPS & Map Studio',
                  'বাংলাদেশ ফেইক জিপিএস ও ম্যাপ স্টুডিও'
                )}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide ${
                  config.enabled
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {config.enabled
                  ? pickLang(lang, 'Spoofing Active', 'স্পুফিং চালু আছে')
                  : pickLang(lang, 'Real GPS (OFF)', 'বন্ধ (আসল লোকেশন)')}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              {extActive
                ? pickLang(
                    lang,
                    'Intercepts navigator.geolocation & permissions across all open Chrome tabs in MAIN world — zero Chrome debugger warning bars.',
                    'Chrome এক্সটেনশনের সব ট্যাবে সরাসরি navigator.geolocation পরিবর্তন করে — রাইড, ডেলিভারি জোন, ম্যাপ ও লোকেশন-ভিত্তিক ফিচার টেস্ট করুন।'
                  )
                : pickLang(
                    lang,
                    'Configure custom coordinates, simulate moving routes (Point A → B), test browser geolocation response, or load in Chrome Extension to spoof all websites.',
                    'যেকোনো কাস্টম Lat/Lng সেট করুন, Point A থেকে Point B রুট মুভমেন্ট চালান এবং Chrome এক্সটেনশনে লোড করে লাইভ ওয়েবসাইটে ফেইক জিপিএস টেস্ট করুন।'
                  )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showFloatingBadge}
              onChange={(e) =>
                onUpdateConfig({
                  ...config,
                  showFloatingBadge: e.target.checked,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            {pickLang(lang, 'Show page badge', 'পেজে ব্যাজ দেখান')}
          </label>

          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-xs ${
              config.enabled
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-cyan-600 hover:bg-cyan-700 text-white'
            }`}
          >
            <Power className="w-4 h-4" />
            {config.enabled
              ? pickLang(lang, 'Disable Fake GPS', 'ফেইক জিপিএস বন্ধ করুন')
              : pickLang(lang, 'Enable Fake GPS', 'ফেইক জিপিএস চালু করুন')}
          </button>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Coordinates, Smart Paste, Presets & Movement Simulator */}
        <div className="lg:col-span-7 space-y-5">
          {/* Coordinate Editor & Smart Paste */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Crosshair className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {pickLang(
                    lang,
                    'Target GPS Coordinates',
                    'টার্গেট জিপিএস কো-অর্ডিনেট'
                  )}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {config.latitude.toFixed(5)}, {config.longitude.toFixed(5)}
              </span>
            </div>

            {/* Smart Paste Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSmartPaste();
                  }
                }}
                placeholder={pickLang(
                  lang,
                  'Paste "23.8103, 90.4125" or Google Maps URL...',
                  '"23.8103, 90.4125" অথবা Google Maps লিংক পেস্ট করুন...'
                )}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleSmartPaste}
                className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap hover:opacity-90"
              >
                {pickLang(lang, 'Extract Lat/Lng', 'বসিয়ে নিন')}
              </button>
            </div>

            {/* Numeric Inputs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {pickLang(lang, 'Latitude (-90 to 90)', 'অক্ষাংশ (Latitude)')}
                </span>
                <input
                  type="number"
                  step="0.0001"
                  min={-90}
                  max={90}
                  value={config.latitude}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      latitude: clampLat(Number(e.target.value)),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {pickLang(lang, 'Longitude (-180 to 180)', 'দ্রাঘিমাংশ (Longitude)')}
                </span>
                <input
                  type="number"
                  step="0.0001"
                  min={-180}
                  max={180}
                  value={config.longitude}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      longitude: clampLng(Number(e.target.value)),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {pickLang(lang, 'Accuracy (meters)', 'অ্যাকুরেসি (মিটার)')}
                </span>
                <input
                  type="number"
                  min={1}
                  max={50000}
                  value={config.accuracy}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      accuracy: Math.max(1, Number(e.target.value) || 1),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {pickLang(lang, 'Altitude (m)', 'উচ্চতা (মিটার)')}
                </span>
                <input
                  type="number"
                  value={config.altitude ?? ''}
                  placeholder="null"
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      altitude: e.target.value === '' ? null : Number(e.target.value),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {pickLang(lang, 'Heading (0-360°)', 'হেডিং (ডিগ্রি)')}
                </span>
                <input
                  type="number"
                  min={0}
                  max={360}
                  value={config.heading ?? ''}
                  placeholder="null"
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      heading: e.target.value === '' ? null : Number(e.target.value),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  {pickLang(lang, 'Speed (m/s)', 'গতি (মি/সে)')}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={config.speed ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      speed: e.target.value === '' ? null : Number(e.target.value),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                {pickLang(lang, 'Location Label', 'লোকেশনের নাম / লেবেল')}
              </span>
              <input
                type="text"
                value={config.locationLabel}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    locationLabel: e.target.value,
                    updatedAt: new Date().toISOString(),
                  })
                }
                placeholder="e.g. Dhaka — Gulshan 2"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
            </label>

            {/* Searchable Bangladesh Division & City Hubs */}
            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {pickLang(
                    lang,
                    'Bangladesh Locations & Delivery Hubs (All 8 Divisions)',
                    'বাংলাদেশের ৮ বিভাগ ও প্রধান শহর/হাব (ক্লিক করে সেট করুন)'
                  )}
                </div>
                <div className="relative w-full sm:w-52">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bdSearch}
                    onChange={(e) => setBdSearch(e.target.value)}
                    placeholder={pickLang(
                      lang,
                      'Search Dhaka, Sylhet, Cumilla...',
                      'ঢাকা, সিলেট, কুমিল্লা খুঁজুন...'
                    )}
                    className="w-full pl-7 pr-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(['All', ...BD_DIVISIONS.map((d) => d.id)] as Array<'All' | BdDivision>).map(
                  (div) => (
                    <button
                      key={div}
                      type="button"
                      onClick={() => setBdDivisionFilter(div)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer transition-colors ${
                        bdDivisionFilter === div
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {div === 'All'
                        ? pickLang(lang, 'All BD', 'সকল বিভাগ')
                        : lang === 'bn'
                          ? BD_DIVISIONS.find((d) => d.id === div)?.nameBn || div
                          : div}
                    </button>
                  )
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {filteredBdLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => handleApplyBdLocation(loc)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:border-emerald-400 dark:hover:border-emerald-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                  >
                    <span className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono text-[9px] font-bold">
                      {loc.division.slice(0, 3).toUpperCase()}
                    </span>
                    <span>{lang === 'bn' ? loc.nameBn : loc.nameEn}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Bangladesh / Dhaka Metro / Global Map Picker */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Globe2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {mapMode === 'bd'
                    ? pickLang(lang, 'Interactive Bangladesh Map', 'বাংলাদেশ ইন্টারঅ্যাক্টিভ ম্যাপ')
                    : mapMode === 'dhaka'
                      ? pickLang(lang, 'Dhaka Metro Zoom Map', 'ঢাকা মেট্রো জুম ম্যাপ')
                      : pickLang(lang, 'Global Coordinate Grid', 'গ্লোবাল কো-অর্ডিনেট গ্রিড')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setMapMode('bd')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                      mapMode === 'bd'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pickLang(lang, 'Bangladesh', 'বাংলাদেশ')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapMode('dhaka')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                      mapMode === 'dhaka'
                        ? 'bg-cyan-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pickLang(lang, 'Dhaka Zoom', 'ঢাকা জুম')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapMode('world')}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                      mapMode === 'world'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {pickLang(lang, 'World', 'বিশ্ব')}
                  </button>
                </div>

                {config.simulateMovement && (
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPickTarget('start')}
                      className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                        pickTarget === 'start'
                          ? 'bg-cyan-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {pickLang(lang, 'Point A', 'Point A')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickTarget('end')}
                      className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                        pickTarget === 'end'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {pickLang(lang, 'Point B', 'Point B')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive SVG Map Surface */}
            <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-[#071522] overflow-hidden">
              {mapMode === 'bd' && (() => {
                const startPt = projectLatLngToSvg(config.latitude, config.longitude, BD_BOUNDS, 360, 420);
                const endPt = projectLatLngToSvg(config.routeEndLat, config.routeEndLng, BD_BOUNDS, 360, 420);
                const hubPt = projectLatLngToSvg(geoHubLat, geoHubLng, BD_BOUNDS, 360, 420);
                const radiusPx = Math.max(4, Math.min(80, (geoRadiusM / 111320 / (BD_BOUNDS.maxLat - BD_BOUNDS.minLat)) * 420));

                return (
                  <svg
                    viewBox="0 0 360 420"
                    onClick={handleMapClick}
                    className="w-full h-80 cursor-crosshair select-none block"
                    role="img"
                    aria-label="Interactive Bangladesh GPS Map"
                  >
                    {/* Lat/Lng Grid */}
                    {[21, 22, 23, 24, 25, 26].map((latLine) => {
                      const y = projectLatLngToSvg(latLine, 90, BD_BOUNDS, 360, 420).y;
                      return (
                        <g key={`bd_lat_${latLine}`}>
                          <line x1={0} y1={y} x2={360} y2={y} stroke="#11273d" strokeWidth={0.7} strokeDasharray="3 3" />
                          <text x={4} y={y - 2} fill="#476685" fontSize="6.5" fontFamily="monospace">{latLine}°N</text>
                        </g>
                      );
                    })}
                    {[88, 89, 90, 91, 92].map((lngLine) => {
                      const x = projectLatLngToSvg(23, lngLine, BD_BOUNDS, 360, 420).x;
                      return (
                        <g key={`bd_lng_${lngLine}`}>
                          <line x1={x} y1={0} x2={x} y2={420} stroke="#11273d" strokeWidth={0.7} strokeDasharray="3 3" />
                          <text x={x + 2} y={10} fill="#476685" fontSize="6.5" fontFamily="monospace">{lngLine}°E</text>
                        </g>
                      );
                    })}

                    {/* Bay of Bengal label */}
                    <text x={150} y={404} fill="#1d4d73" fontSize="8" fontStyle="italic" letterSpacing="2">
                      BAY OF BENGAL
                    </text>

                    {/* Bangladesh Country Polygon */}
                    <path
                      d={bdOutlinePath}
                      fill="#0f2c3f"
                      stroke="#14b8a6"
                      strokeWidth={1.6}
                      strokeLinejoin="round"
                    />

                    {/* Major Rivers (Padma, Jamuna, Meghna) */}
                    {bdRiverPaths.map((r) => (
                      <path
                        key={r.name}
                        d={r.d}
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth={1.5}
                        strokeOpacity={0.55}
                        strokeLinecap="round"
                      />
                    ))}

                    {/* Division Labels */}
                    {BD_DIVISIONS.map((div) => {
                      const pt = projectLatLngToSvg(div.lat, div.lng, BD_BOUNDS, 360, 420);
                      return (
                        <text
                          key={div.id}
                          x={pt.x}
                          y={pt.y - 7}
                          textAnchor="middle"
                          fill={div.color}
                          fillOpacity={0.75}
                          fontSize="7"
                          fontWeight="700"
                          letterSpacing="0.5"
                        >
                          {div.id.toUpperCase()}
                        </text>
                      );
                    })}

                    {/* Geofence Hub Circle Overlay */}
                    <circle
                      cx={hubPt.x}
                      cy={hubPt.y}
                      r={radiusPx}
                      fill="rgba(16, 185, 129, 0.14)"
                      stroke="#10b981"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />

                    {/* Clickable BD City / District Hub Dots */}
                    {BD_LOCATIONS.filter((l) => l.category !== 'dhaka_metro' || l.id === 'bd_dhk_motijheel').map((loc) => {
                      const pt = projectLatLngToSvg(loc.lat, loc.lng, BD_BOUNDS, 360, 420);
                      return (
                        <g
                          key={loc.id}
                          className="cursor-pointer"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleApplyBdLocation(loc);
                          }}
                        >
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={loc.category === 'division_hq' || loc.id === 'bd_dhk_motijheel' ? 3.2 : 2.3}
                            fill={loc.category === 'division_hq' || loc.id === 'bd_dhk_motijheel' ? '#34d399' : '#94a3b8'}
                            stroke="#06202e"
                            strokeWidth={0.7}
                          />
                          <title>{`${loc.nameEn} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`}</title>
                        </g>
                      );
                    })}

                    {/* Route A -> B Line */}
                    {config.simulateMovement && (
                      <>
                        <line
                          x1={startPt.x}
                          y1={startPt.y}
                          x2={endPt.x}
                          y2={endPt.y}
                          stroke="#fbbf24"
                          strokeWidth={1.6}
                          strokeDasharray="4 3"
                        />
                        <circle cx={endPt.x} cy={endPt.y} r={4.2} fill="#10b981" stroke="#06202e" strokeWidth={1} />
                        <text x={endPt.x + 6} y={endPt.y + 3} fill="#6ee7b7" fontSize="7.5" fontWeight="700" fontFamily="monospace">
                          B
                        </text>
                      </>
                    )}

                    {/* Active GPS Pin inside Bangladesh bounds */}
                    {nearestBd.insideBd && (
                      <>
                        <circle cx={startPt.x} cy={startPt.y} r={10} fill="rgba(34, 211, 238, 0.25)" />
                        <circle cx={startPt.x} cy={startPt.y} r={4.2} fill="#22d3ee" stroke="#083344" strokeWidth={1.1} />
                        <text x={startPt.x + 7} y={startPt.y - 4} fill="#67e8f9" fontSize="7.5" fontWeight="700" fontFamily="monospace">
                          {config.simulateMovement ? 'A' : `${config.latitude.toFixed(2)}, ${config.longitude.toFixed(2)}`}
                        </text>
                      </>
                    )}
                  </svg>
                );
              })()}

              {mapMode === 'dhaka' && (() => {
                const startPt = projectLatLngToSvg(config.latitude, config.longitude, DHAKA_METRO_BOUNDS, 360, 320);
                const endPt = projectLatLngToSvg(config.routeEndLat, config.routeEndLng, DHAKA_METRO_BOUNDS, 360, 320);
                const hubPt = projectLatLngToSvg(geoHubLat, geoHubLng, DHAKA_METRO_BOUNDS, 360, 320);
                const radiusPx = Math.max(6, Math.min(120, (geoRadiusM / 111320 / (DHAKA_METRO_BOUNDS.maxLat - DHAKA_METRO_BOUNDS.minLat)) * 320));
                const dhakaPins = BD_LOCATIONS.filter(
                  (l) =>
                    l.lat >= DHAKA_METRO_BOUNDS.minLat &&
                    l.lat <= DHAKA_METRO_BOUNDS.maxLat &&
                    l.lng >= DHAKA_METRO_BOUNDS.minLng &&
                    l.lng <= DHAKA_METRO_BOUNDS.maxLng
                );

                return (
                  <svg
                    viewBox="0 0 360 320"
                    onClick={handleMapClick}
                    className="w-full h-80 cursor-crosshair select-none block"
                    role="img"
                    aria-label="Interactive Dhaka Metro GPS Map"
                  >
                    {/* Street/Zone Grid */}
                    {[23.65, 23.7, 23.75, 23.8, 23.85, 23.9].map((latLine) => {
                      const y = projectLatLngToSvg(latLine, 90.4, DHAKA_METRO_BOUNDS, 360, 320).y;
                      return (
                        <g key={`dk_lat_${latLine}`}>
                          <line x1={0} y1={y} x2={360} y2={y} stroke="#10253a" strokeWidth={0.7} />
                          <text x={4} y={y - 2} fill="#476685" fontSize="6" fontFamily="monospace">{latLine.toFixed(2)}</text>
                        </g>
                      );
                    })}
                    {[90.25, 90.3, 90.35, 90.4, 90.45, 90.5].map((lngLine) => {
                      const x = projectLatLngToSvg(23.8, lngLine, DHAKA_METRO_BOUNDS, 360, 320).x;
                      return (
                        <g key={`dk_lng_${lngLine}`}>
                          <line x1={x} y1={0} x2={x} y2={320} stroke="#10253a" strokeWidth={0.7} />
                          <text x={x + 2} y={10} fill="#476685" fontSize="6" fontFamily="monospace">{lngLine.toFixed(2)}</text>
                        </g>
                      );
                    })}

                    {/* Stylized Airport Runway / Airport Road / Mirpur Road Corridors */}
                    {(() => {
                      const motijheel = projectLatLngToSvg(23.733, 90.4172, DHAKA_METRO_BOUNDS, 360, 320);
                      const gulshan = projectLatLngToSvg(23.7949, 90.4143, DHAKA_METRO_BOUNDS, 360, 320);
                      const uttara = projectLatLngToSvg(23.8759, 90.3795, DHAKA_METRO_BOUNDS, 360, 320);
                      const dhanmondi = projectLatLngToSvg(23.7549, 90.3764, DHAKA_METRO_BOUNDS, 360, 320);
                      const mirpur = projectLatLngToSvg(23.8069, 90.3687, DHAKA_METRO_BOUNDS, 360, 320);
                      return (
                        <g stroke="#1e3a5f" strokeWidth={2.2} strokeLinecap="round" fill="none">
                          <path d={`M ${motijheel.x},${motijheel.y} L ${gulshan.x},${gulshan.y} L ${uttara.x},${uttara.y}`} />
                          <path d={`M ${motijheel.x},${motijheel.y} L ${dhanmondi.x},${dhanmondi.y} L ${mirpur.x},${mirpur.y} L ${uttara.x},${uttara.y}`} />
                        </g>
                      );
                    })()}

                    {/* Geofence Radius Circle */}
                    <circle
                      cx={hubPt.x}
                      cy={hubPt.y}
                      r={radiusPx}
                      fill="rgba(16, 185, 129, 0.16)"
                      stroke="#10b981"
                      strokeWidth={1.2}
                      strokeDasharray="3 2"
                    />

                    {/* Dhaka Neighborhood Nodes */}
                    {dhakaPins.map((loc) => {
                      const pt = projectLatLngToSvg(loc.lat, loc.lng, DHAKA_METRO_BOUNDS, 360, 320);
                      const shortName = loc.nameEn.replace('Dhaka — ', '').replace(' (DAC)', '');
                      return (
                        <g
                          key={loc.id}
                          className="cursor-pointer"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleApplyBdLocation(loc);
                          }}
                        >
                          <circle cx={pt.x} cy={pt.y} r={3.6} fill="#14b8a6" stroke="#06202e" strokeWidth={0.9} />
                          <text
                            x={pt.x + 5}
                            y={pt.y + 2}
                            fill="#cbd5e1"
                            fontSize="7"
                            fontWeight="600"
                          >
                            {shortName}
                          </text>
                        </g>
                      );
                    })}

                    {/* Route A -> B */}
                    {config.simulateMovement && (
                      <>
                        <line x1={startPt.x} y1={startPt.y} x2={endPt.x} y2={endPt.y} stroke="#fbbf24" strokeWidth={1.8} strokeDasharray="4 3" />
                        <circle cx={endPt.x} cy={endPt.y} r={4.5} fill="#10b981" stroke="#06202e" strokeWidth={1} />
                        <text x={endPt.x + 6} y={endPt.y + 3} fill="#6ee7b7" fontSize="8" fontWeight="700" fontFamily="monospace">B</text>
                      </>
                    )}

                    {/* Active Pin */}
                    <circle cx={startPt.x} cy={startPt.y} r={10} fill="rgba(34, 211, 238, 0.25)" />
                    <circle cx={startPt.x} cy={startPt.y} r={4.5} fill="#22d3ee" stroke="#083344" strokeWidth={1.1} />
                    <text x={startPt.x + 7} y={startPt.y - 5} fill="#67e8f9" fontSize="8" fontWeight="700" fontFamily="monospace">
                      {config.simulateMovement ? 'A' : 'PIN'}
                    </text>
                  </svg>
                );
              })()}

              {mapMode === 'world' && (
                <svg
                  viewBox="0 0 360 180"
                  onClick={handleMapClick}
                  className="w-full h-56 cursor-crosshair select-none block"
                  role="img"
                  aria-label="Global latitude and longitude picker"
                >
                  {[-60, -30, 0, 30, 60].map((latLine) => {
                    const y = ((90 - latLine) / 180) * 180;
                    return (
                      <line
                        key={`lat_${latLine}`}
                        x1={0}
                        y1={y}
                        x2={360}
                        y2={y}
                        stroke={latLine === 0 ? '#1e3a5f' : '#16243d'}
                        strokeWidth={latLine === 0 ? 0.9 : 0.5}
                        strokeDasharray={latLine === 0 ? undefined : '2 2'}
                      />
                    );
                  })}
                  {[-120, -60, 0, 60, 120].map((lngLine) => {
                    const x = ((lngLine + 180) / 360) * 360;
                    return (
                      <line
                        key={`lng_${lngLine}`}
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={180}
                        stroke={lngLine === 0 ? '#1e3a5f' : '#16243d'}
                        strokeWidth={lngLine === 0 ? 0.9 : 0.5}
                        strokeDasharray={lngLine === 0 ? undefined : '2 2'}
                      />
                    );
                  })}

                  {WORLD_SILHOUETTES.map((d, idx) => (
                    <path key={idx} d={d} fill="#162944" stroke="#28466e" strokeWidth={0.7} />
                  ))}

                  {config.simulateMovement && (
                    <>
                      <line x1={worldStartX} y1={worldStartY} x2={worldEndX} y2={worldEndY} stroke="#10b981" strokeWidth={1.3} strokeDasharray="3 2" />
                      <circle cx={worldEndX} cy={worldEndY} r={3.5} fill="#10b981" />
                      <text x={worldEndX + 5} y={worldEndY + 3} fill="#6ee7b7" fontSize="6" fontFamily="monospace">B</text>
                    </>
                  )}

                  <circle cx={worldStartX} cy={worldStartY} r={7} fill="rgba(6, 182, 212, 0.25)" />
                  <circle cx={worldStartX} cy={worldStartY} r={3.2} fill="#22d3ee" stroke="#083344" strokeWidth={0.8} />
                  <text x={worldStartX + 6} y={worldStartY - 3} fill="#67e8f9" fontSize="6" fontFamily="monospace">
                    {config.simulateMovement ? 'A' : `${config.latitude.toFixed(1)}, ${config.longitude.toFixed(1)}`}
                  </text>
                </svg>
              )}
            </div>

            {/* Nearest Bangladesh Area Telemetry Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {nearestBd.insideBd
                    ? pickLang(
                        lang,
                        `Inside Bangladesh · Nearest hub: ${nearestBd.nearest.nameEn} (${nearestBd.distanceKm} km)`,
                        `বাংলাদেশের ভেতরে · নিকটতম হাব: ${nearestBd.nearest.nameBn} (${nearestBd.distanceKm} কিমি)`
                      )
                    : pickLang(
                        lang,
                        `Outside Bangladesh (${nearestBd.distanceKm} km from ${nearestBd.nearest.nameEn})`,
                        `বাংলাদেশের বাইরে (${nearestBd.nearest.nameBn} থেকে ${nearestBd.distanceKm} কিমি)`
                      )}
                </span>
              </div>
              <span className="text-slate-400 font-mono">
                {pickLang(lang, 'Click map or pin to place', 'ম্যাপে ক্লিক করে পিন বসান')}
              </span>
            </div>
          </div>

          {/* Moving Rider / Route Simulation */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Route className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {pickLang(
                    lang,
                    'BD Route & Rider Movement Simulator',
                    'বাংলাদেশ রাইডার / ডেলিভারি রুট সিমুলেটর'
                  )}
                </span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.simulateMovement}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      simulateMovement: e.target.checked,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {pickLang(lang, 'Simulate Route Movement', 'রুট মুভমেন্ট চালু করুন')}
              </label>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pickLang(
                lang,
                'Launch a Bangladesh ride or courier route in 1 click (updates navigator.geolocation.watchPosition live).',
                'এক ক্লিকে বাংলাদেশের যেকোনো রাইড বা কুরিয়ার রুটে লাইভ মুভমেন্ট (Point A → Point B) চালিয়ে টেস্ট করুন।'
              )}
            </p>

            {/* 1-Click BD Route Presets */}
            <div className="flex flex-wrap gap-1.5">
              {BD_ROUTE_PRESETS.map((rt) => (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => handleApplyBdRoute(rt)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 cursor-pointer"
                >
                  <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-emerald-600 text-white">
                    {rt.tag}
                  </span>
                  <span>{lang === 'bn' ? rt.labelBn : rt.labelEn}</span>
                </button>
              ))}
            </div>

            {config.simulateMovement && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {pickLang(lang, 'Point B Latitude', 'Point B Latitude')}
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.routeEndLat}
                    onChange={(e) =>
                      onUpdateConfig({
                        ...config,
                        routeEndLat: clampLat(Number(e.target.value)),
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {pickLang(lang, 'Point B Longitude', 'Point B Longitude')}
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    value={config.routeEndLng}
                    onChange={(e) =>
                      onUpdateConfig({
                        ...config,
                        routeEndLng: clampLng(Number(e.target.value)),
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {pickLang(lang, 'Update Every (sec)', 'আপডেট ইন্টারভ্যাল (সেকেন্ড)')}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={config.routeIntervalSec}
                    onChange={(e) =>
                      onUpdateConfig({
                        ...config,
                        routeIntervalSec: Math.max(1, Number(e.target.value) || 2),
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                </label>
                <div className="sm:col-span-3 flex items-center gap-2 text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                  <Compass className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {pickLang(
                      lang,
                      `Route span: ${routeDistanceKm.toFixed(2)} km`,
                      `মোট দূরত্ব: ${routeDistanceKm.toFixed(2)} কিমি`
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Verification Probe, Saved GPS Profiles & Automation Codegen */}
        <div className="lg:col-span-5 space-y-5">
          {/* Live Geolocation Verification Probe */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Radar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {pickLang(
                    lang,
                    'Live Geolocation Probe',
                    'লাইভ জিপিএস যাচাই প্রোব'
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={handleProbeGeolocation}
                disabled={probing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {probing
                  ? pickLang(lang, 'Checking...', 'চেক হচ্ছে...')
                  : pickLang(lang, 'Test GPS Reading', 'GPS রিডিং চেক করুন')}
              </button>
            </div>

            {probeResult ? (
              probeResult.ok ? (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-emerald-800 dark:text-emerald-300">
                    <span>
                      {probeResult.spoofed
                        ? pickLang(lang, 'Spoofed GPS Verified', 'ফেইক জিপিএস কাজ করছে!')
                        : pickLang(lang, 'Real Browser GPS', 'আসল ব্রাউজার জিপিএস')}
                    </span>
                    <span className="font-mono text-[10px]">
                      {probeResult.source === 'active_tab' ? 'Active Tab' : 'Studio'} ·{' '}
                      {probeResult.checkedAt}
                    </span>
                  </div>
                  <div className="font-mono text-slate-800 dark:text-slate-200">
                    Lat: {Number(probeResult.latitude).toFixed(6)} | Lng:{' '}
                    {Number(probeResult.longitude).toFixed(6)}
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    Accuracy: ±{Math.round(Number(probeResult.accuracy || 0))}m
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                  {probeResult.error}
                </div>
              )
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'Click "Test GPS Reading" to call navigator.geolocation.getCurrentPosition and verify what coordinates your browser or active tab sees.',
                  'ব্রাউজার বা অ্যাক্টিভ ট্যাব এখন কোন লোকেশন রিড করছে তা যাচাই করতে "GPS রিডিং চেক করুন" বাটনে ক্লিক করুন।'
                )}
              </p>
            )}
          </div>

          {/* Delivery / Geofence Radius Boundary Tester */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Crosshair className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {pickLang(
                    lang,
                    'Geofence & Delivery Radius Tester',
                    'জিওফেন্স ও ডেলিভারি রেডিয়াস টেস্টার'
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSetHubToCurrentPin}
                className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                {pickLang(lang, 'Use Current Pin as Hub', 'বর্তমান পিনকে হাব ধরুন')}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">Hub Lat</span>
                <input
                  type="number"
                  step="0.0001"
                  value={geoHubLat}
                  onChange={(e) => setGeoHubLat(clampLat(Number(e.target.value)))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">Hub Lng</span>
                <input
                  type="number"
                  step="0.0001"
                  value={geoHubLng}
                  onChange={(e) => setGeoHubLng(clampLng(Number(e.target.value)))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">
                  {pickLang(lang, 'Radius (m)', 'সীমা (মিটার)')}
                </span>
                <input
                  type="number"
                  min={50}
                  max={50000}
                  step={50}
                  value={geoRadiusM}
                  onChange={(e) => setGeoRadiusM(Math.max(50, Number(e.target.value) || 500))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs"
                />
              </label>
            </div>

            <div
              className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                isInsideGeofence
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                  : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div>
                <div className="font-bold">
                  {isInsideGeofence
                    ? pickLang(lang, 'INSIDE GEOFENCE', 'জিওফেন্সের ভিতরে আছেন')
                    : pickLang(lang, 'OUTSIDE GEOFENCE', 'জিওফেন্সের বাইরে আছেন')}
                </div>
                <div className="text-[11px] font-mono tabular-nums opacity-85">
                  {pickLang(lang, 'Distance:', 'দূরত্ব:')}{' '}
                  {geofenceDistanceM >= 1000
                    ? `${(geofenceDistanceM / 1000).toFixed(2)} km`
                    : `${geofenceDistanceM} m`}{' '}
                  / {geoRadiusM} m
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleJumpGeofenceBoundary('inside')}
                  className="px-2.5 py-1.5 rounded-md border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  {pickLang(lang, 'Edge Inside (-30m)', 'ভিতরের প্রান্ত (-৩০মি)')}
                </button>
                <button
                  type="button"
                  onClick={() => handleJumpGeofenceBoundary('outside')}
                  className="px-2.5 py-1.5 rounded-md border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  {pickLang(lang, 'Edge Outside (+50m)', 'বাইরের প্রান্ত (+৫০মি)')}
                </button>
              </div>
            </div>
          </div>

          {/* Save & Manage GPS Profiles (Protected by 3-Day Recycle Bin) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <MapPin className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {pickLang(lang, 'Saved GPS Profiles', 'সেভ করা জিপিএস প্রোফাইল')}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {savedLocations.length}
              </span>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-2.5">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={pickLang(
                  lang,
                  'Profile name (e.g. Dhaka Zone A Hub)',
                  'প্রোফাইলের নাম (যেমন: ঢাকা জোন এ হাব)'
                )}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={profileNote}
                  onChange={(e) => setProfileNote(e.target.value)}
                  placeholder={pickLang(lang, 'Optional QA note', 'নোট (ঐচ্ছিক)')}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {pickLang(lang, 'Save Pin', 'সেভ করুন')}
                </button>
              </div>
            </form>

            {savedLocations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {pickLang(
                  lang,
                  'No saved GPS profiles yet. Set any coordinate and click "Save Pin".',
                  'কোনো জিপিএস প্রোফাইল সেভ করা নেই। উপরের কো-অর্ডিনেট সেট করে "সেভ করুন" চাপুন।'
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {savedLocations.map((loc) => (
                  <div
                    key={loc.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {loc.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)} (±{loc.accuracy}m)
                      </div>
                      {loc.note && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {loc.note}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApplySavedProfile(loc)}
                        className="px-2.5 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        {pickLang(lang, 'Apply', 'চালু করুন')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedProfile(loc.id)}
                        aria-label={`Delete ${loc.name}`}
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Playwright / Pytest Geolocation Automation Codegen */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Terminal className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>
                  {pickLang(lang, 'Playwright GPS Codegen', 'Playwright GPS কোড')}
                </span>
              </div>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setCodegenLang('playwright_ts')}
                  className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                    codegenLang === 'playwright_ts'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  TS
                </button>
                <button
                  type="button"
                  onClick={() => setCodegenLang('playwright_py')}
                  className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                    codegenLang === 'playwright_py'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Python
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-400">
                <span className="font-mono">
                  {codegenLang === 'playwright_py' ? 'test_geo.py' : 'geo.spec.ts'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 text-slate-200 hover:text-white cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
                {codegenSnippet}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
