export interface VisualDiffResult {
  width: number;
  height: number;
  refWidth: number;
  refHeight: number;
  actualWidth: number;
  actualHeight: number;
  totalPixels: number;
  mismatchedPixels: number;
  matchPct: number;
  diffPct: number;
  diffImageUrl: string;
  hotspots: string[];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/**
 * Compares Reference Image vs Current Screen Image pixel-by-pixel using HTML5 Canvas.
 * Returns Match %, Mismatched Pixels, Zone Hotspots, and a highlighted Diff Heatmap PNG URL.
 */
export async function compareImagesPixelByPixel(
  refSrc: string,
  actualSrc: string,
  toleranceLevel = 22,
  scaleToMatch = true
): Promise<VisualDiffResult> {
  const [refImg, actualImg] = await Promise.all([
    loadImage(refSrc),
    loadImage(actualSrc),
  ]);

  const refW = refImg.naturalWidth || refImg.width;
  const refH = refImg.naturalHeight || refImg.height;
  const actW = actualImg.naturalWidth || actualImg.width;
  const actH = actualImg.naturalHeight || actualImg.height;

  // Cap comparison width at 1200px to keep pixel analysis instant (<50ms)
  const maxDim = 1200;
  const baseW = scaleToMatch ? refW : Math.max(refW, actW);
  const baseH = scaleToMatch ? refH : Math.max(refH, actH);
  const scaleFactor = baseW > maxDim ? maxDim / baseW : 1;

  const width = Math.max(1, Math.round(baseW * scaleFactor));
  const height = Math.max(1, Math.round(baseH * scaleFactor));

  const c1 = document.createElement('canvas');
  c1.width = width;
  c1.height = height;
  const ctx1 = c1.getContext('2d');
  if (!ctx1) throw new Error('Canvas 2D unavailable');

  const c2 = document.createElement('canvas');
  c2.width = width;
  c2.height = height;
  const ctx2 = c2.getContext('2d');
  if (!ctx2) throw new Error('Canvas 2D unavailable');

  ctx1.fillStyle = '#ffffff';
  ctx1.fillRect(0, 0, width, height);
  ctx2.fillStyle = '#ffffff';
  ctx2.fillRect(0, 0, width, height);

  if (scaleToMatch) {
    ctx1.drawImage(refImg, 0, 0, width, height);
    ctx2.drawImage(actualImg, 0, 0, width, height);
  } else {
    ctx1.drawImage(
      refImg,
      0,
      0,
      Math.round(refW * scaleFactor),
      Math.round(refH * scaleFactor)
    );
    ctx2.drawImage(
      actualImg,
      0,
      0,
      Math.round(actW * scaleFactor),
      Math.round(actH * scaleFactor)
    );
  }

  const d1 = ctx1.getImageData(0, 0, width, height).data;
  const d2 = ctx2.getImageData(0, 0, width, height).data;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d');
  if (!diffCtx) throw new Error('Canvas 2D unavailable');

  const out = diffCtx.createImageData(width, height);
  const outData = out.data;

  // 3x3 hotspot grid counters
  const gridCols = 3;
  const gridRows = 3;
  const cellTotal = new Array(gridCols * gridRows).fill(0);
  const cellDiff = new Array(gridCols * gridRows).fill(0);

  let mismatchedPixels = 0;
  const totalPixels = width * height;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
      const gIdx = gy * gridCols + gx;
      const idx = (y * width + x) * 4;

      const r1 = d1[idx];
      const g1 = d1[idx + 1];
      const b1 = d1[idx + 2];

      const r2 = d2[idx];
      const g2 = d2[idx + 1];
      const b2 = d2[idx + 2];

      const maxDelta = Math.max(
        Math.abs(r1 - r2),
        Math.abs(g1 - g2),
        Math.abs(b1 - b2)
      );

      cellTotal[gIdx] += 1;

      if (maxDelta > toleranceLevel) {
        mismatchedPixels += 1;
        cellDiff[gIdx] += 1;
        // Vivid rose-magenta highlight on mismatched pixels
        outData[idx] = 244;
        outData[idx + 1] = 63;
        outData[idx + 2] = 94;
        outData[idx + 3] = 255;
      } else {
        // Dimmed grayscale context for matching areas
        const gray = Math.round(0.299 * r2 + 0.587 * g2 + 0.114 * b2);
        const soft = Math.round(gray * 0.35 + 165);
        outData[idx] = soft;
        outData[idx + 1] = soft;
        outData[idx + 2] = soft;
        outData[idx + 3] = 255;
      }
    }
  }

  diffCtx.putImageData(out, 0, 0);
  const diffImageUrl = diffCanvas.toDataURL('image/png');

  const matchPct =
    totalPixels > 0
      ? Math.round(((totalPixels - mismatchedPixels) / totalPixels) * 10000) / 100
      : 100;
  const diffPct = Math.round((100 - matchPct) * 100) / 100;

  const zoneNames = [
    'Top-Left',
    'Top-Center',
    'Top-Right',
    'Middle-Left',
    'Center',
    'Middle-Right',
    'Bottom-Left',
    'Bottom-Center',
    'Bottom-Right',
  ];

  const hotspots: string[] = [];
  for (let i = 0; i < zoneNames.length; i++) {
    const pct = cellTotal[i] > 0 ? (cellDiff[i] / cellTotal[i]) * 100 : 0;
    if (pct >= 0.8) {
      hotspots.push(`${zoneNames[i]} (${pct.toFixed(1)}% diff)`);
    }
  }

  return {
    width,
    height,
    refWidth: refW,
    refHeight: refH,
    actualWidth: actW,
    actualHeight: actH,
    totalPixels,
    mismatchedPixels,
    matchPct,
    diffPct,
    diffImageUrl,
    hotspots,
  };
}
