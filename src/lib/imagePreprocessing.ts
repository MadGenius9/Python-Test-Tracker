/**
/**
 * Image preprocessing routines for dense / low-contrast / thermal paper barcodes and QR codes.
 * Includes Grayscale, CLAHE (Contrast Limited Adaptive Histogram Equalization),
 * Otsu Threshold Binarization, and Downscaling.
 */

export function toGrayscale(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const outData = output.data;

  for (let i = 0; i < data.length; i += 4) {
    // Luminance formula
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    outData[i] = gray;
    outData[i + 1] = gray;
    outData[i + 2] = gray;
  }

  return output;
}

export function applyCLAHE(
  imageData: ImageData,
  clipLimit: number = 3.0,
  gridX: number = 8,
  gridY: number = 8
): ImageData {
  const { width, height, data } = imageData;
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const outData = output.data;

  // Extract grayscale intensities
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  const tileW = Math.floor(width / gridX);
  const tileH = Math.floor(height / gridY);
  if (tileW < 2 || tileH < 2) return imageData;

  const numPixelsPerTile = tileW * tileH;
  const cdfs: Float32Array[] = [];

  // 1. Compute tile CDFs
  for (let gy = 0; gy < gridY; gy++) {
    for (let gx = 0; gx < gridX; gx++) {
      const hist = new Int32Array(256);

      const startX = gx * tileW;
      const startY = gy * tileH;
      const endX = gx === gridX - 1 ? width : startX + tileW;
      const endY = gy === gridY - 1 ? height : startY + tileH;
      const tilePixelCount = (endX - startX) * (endY - startY);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          hist[gray[y * width + x]]++;
        }
      }

      // Clip histogram
      const clipThreshold = Math.max(1, Math.round((clipLimit * tilePixelCount) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipThreshold) {
          excess += hist[i] - clipThreshold;
          hist[i] = clipThreshold;
        }
      }

      const bump = Math.floor(excess / 256);
      const residual = excess % 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += bump;
      }
      for (let i = 0; i < residual; i++) {
        hist[i]++;
      }

      // Compute CDF
      const cdf = new Float32Array(256);
      let sum = 0;
      for (let i = 0; i < 256; i++) {
        sum += hist[i];
        cdf[i] = sum / tilePixelCount;
      }
      cdfs.push(cdf);
    }
  }

  // 2. Bilinear Interpolation across tiles
  for (let y = 0; y < height; y++) {
    const gy = (y - tileH / 2) / tileH;
    const gy0 = Math.max(0, Math.min(gridY - 1, Math.floor(gy)));
    const gy1 = Math.max(0, Math.min(gridY - 1, gy0 + 1));
    const yWeight = Math.max(0, Math.min(1, gy - gy0));

    for (let x = 0; x < width; x++) {
      const gx = (x - tileW / 2) / tileW;
      const gx0 = Math.max(0, Math.min(gridX - 1, Math.floor(gx)));
      const gx1 = Math.max(0, Math.min(gridX - 1, gx0 + 1));
      const xWeight = Math.max(0, Math.min(1, gx - gx0));

      const val = gray[y * width + x];

      const cdf00 = cdfs[gy0 * gridX + gx0][val];
      const cdf10 = cdfs[gy0 * gridX + gx1][val];
      const cdf01 = cdfs[gy1 * gridX + gx0][val];
      const cdf11 = cdfs[gy1 * gridX + gx1][val];

      const top = cdf00 * (1 - xWeight) + cdf10 * xWeight;
      const bottom = cdf01 * (1 - xWeight) + cdf11 * xWeight;
      const finalVal = Math.round((top * (1 - yWeight) + bottom * yWeight) * 255);

      const idx = (y * width + x) * 4;
      outData[idx] = finalVal;
      outData[idx + 1] = finalVal;
      outData[idx + 2] = finalVal;
    }
  }

  return output;
}

export function applyOtsuThreshold(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const outData = output.data;

  // Compute histogram
  const hist = new Int32Array(256);
  const total = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[gray]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const bw = gray > threshold ? 255 : 0;
    outData[i] = bw;
    outData[i + 1] = bw;
    outData[i + 2] = bw;
  }

  return output;
}

export function downscaleCanvas(
  sourceCanvas: HTMLCanvasElement,
  scale: number = 0.5
): HTMLCanvasElement {
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = Math.max(1, Math.floor(sourceCanvas.width * scale));
  targetCanvas.height = Math.max(1, Math.floor(sourceCanvas.height * scale));
  const ctx = targetCanvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  }
  return targetCanvas;
}
