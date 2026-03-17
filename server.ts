import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Jimp } from 'jimp';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const upload = multer({ storage: multer.memoryStorage() });

  console.log('[STARTUP] Server starting with Jimp processing...');

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), engine: 'jimp' });
  });

  app.post('/api/process', upload.fields([{ name: 'images' }, { name: 'txts' }]), async (req: any, res) => {
    console.log(`[API] Received process request. Images: ${req.files?.['images']?.length || 0}, TXTs: ${req.files?.['txts']?.length || 0}`);
    try {
      const files = req.files as { [fieldname: string]: any[] };
      if (!files || !files['images'] || !files['txts']) {
        return res.status(400).json({ success: false, error: 'Arquivos de imagem ou TXT ausentes.' });
      }

      const images = files['images'];
      const txts = files['txts'];
      const results = [];

      for (const imgFile of images) {
        const baseName = path.parse(imgFile.originalname).name;
        
        const txtFile = txts.find(t => {
          const tName = path.parse(t.originalname).name;
          return tName === baseName || tName.startsWith(baseName) || baseName.startsWith(tName);
        });

        if (!txtFile) continue;

        try {
          const img = await Jimp.read(imgFile.buffer);
          const txtContent = txtFile.buffer.toString('utf-8');
          const polys = parsePolygons(txtContent);

          for (let i = 0; i < polys.length; i++) {
            const poly = polys[i];
            const result = await processSleeper(img, poly, i);
            if (result) {
              results.push({
                baseName,
                ...result
              });
            }
          }
        } catch (imgErr) {
          console.error(`[API] Error processing image ${baseName}:`, imgErr);
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('[API] Global processing error:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

function parsePolygons(content: string) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const polys = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const clsId = parseInt(parts[0]);
    const coords = parts.slice(1).map(Number).filter(n => !isNaN(n));
    if (coords.length < 4) continue;
    
    const pts = [];
    for (let i = 0; i < coords.length - 1; i += 2) {
      pts.push({ x: coords[i], y: coords[i + 1] });
    }
    if (pts.length >= 2) {
      polys.push({ clsId, pts });
    }
  }
  return polys;
}

// Point in Polygon algorithm (Ray Casting)
function isPointInPoly(x: number, y: number, pts: { x: number, y: number }[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

async function processSleeper(img: any, poly: { clsId: number, pts: { x: number, y: number }[] }, index: number) {
  const w = img.width;
  const h = img.height;

  const ptsPx = poly.pts.map(p => ({
    x: Math.round(p.x * w),
    y: Math.round(p.y * h)
  }));

  const minX = Math.max(0, Math.min(...ptsPx.map(p => p.x)));
  const maxX = Math.min(w - 1, Math.max(...ptsPx.map(p => p.x)));
  const minY = Math.max(0, Math.min(...ptsPx.map(p => p.y)));
  const maxY = Math.min(h - 1, Math.max(...ptsPx.map(p => p.y)));

  const roiW = maxX - minX + 1;
  const roiH = maxY - minY + 1;

  if (roiW <= 0 || roiH <= 0) return null;

  // Create ROI images
  const roiImg = img.clone().crop({ x: minX, y: minY, w: roiW, h: roiH });
  const overlayImg = roiImg.clone();

  const LOWER_LIMIT = 140;
  const MARGIN = 6;
  const PIX = 1;
  const CANNY_T1 = 100;
  const CANNY_T2 = 200;

  let horizontalPixels = 0;
  let totalValidPixels = 0;

  // 1. Grayscale
  const grayData = new Float32Array(roiW * roiH);
  for (let y = 0; y < roiH; y++) {
    for (let x = 0; x < roiW; x++) {
      const idx = y * roiW + x;
      const color = roiImg.getPixelColor(x, y);
      const r = (color >> 24) & 0xFF;
      const g = (color >> 16) & 0xFF;
      const b = (color >> 8) & 0xFF;
      const gray = (r + g + b) / 3;
      grayData[idx] = gray;
    }
  }

  // 2. Simple Gaussian Blur (3x3) to reduce noise
  const blurred = new Float32Array(roiW * roiH);
  const kernel = [
    1/16, 2/16, 1/16,
    2/16, 4/16, 2/16,
    1/16, 2/16, 1/16
  ];

  for (let y = 1; y < roiH - 1; y++) {
    for (let x = 1; x < roiW - 1; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += grayData[(y + ky) * roiW + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      blurred[y * roiW + x] = sum;
    }
  }

  // 3. Refined Hot Mask (Thresholding blurred data + Dilation)
  const initialHotMask = new Uint8Array(roiW * roiH);
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] >= LOWER_LIMIT) initialHotMask[i] = 1;
  }

  const hotMask = new Uint8Array(roiW * roiH);
  for (let y = 1; y < roiH - 1; y++) {
    for (let x = 1; x < roiW - 1; x++) {
      const idx = y * roiW + x;
      if (initialHotMask[idx]) {
        // 3x3 Dilation to smooth and expand the mask slightly
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            hotMask[(y + ky) * roiW + (x + kx)] = 1;
          }
        }
      }
    }
  }

  // 4. Scharr Edge Detection
  const edges = new Uint8Array(roiW * roiH);
  const magnitude = new Float32Array(roiW * roiH);

  for (let y = 1; y < roiH - 1; y++) {
    for (let x = 1; x < roiW - 1; x++) {
      const idx = y * roiW + x;
      if (hotMask[idx]) continue;

      // Scharr Gx
      const gx = 
        -3 * blurred[(y-1)*roiW + (x-1)] + 3 * blurred[(y-1)*roiW + (x+1)] +
        -10 * blurred[y*roiW + (x-1)]     + 10 * blurred[y*roiW + (x+1)] +
        -3 * blurred[(y+1)*roiW + (x-1)] + 3 * blurred[(y+1)*roiW + (x+1)];
      
      // Scharr Gy
      const gy = 
        -3 * blurred[(y-1)*roiW + (x-1)] - 10 * blurred[(y-1)*roiW + x] - 3 * blurred[(y-1)*roiW + (x+1)] +
         3 * blurred[(y+1)*roiW + (x-1)] + 10 * blurred[(y+1)*roiW + x] + 3 * blurred[(y+1)*roiW + (x+1)];

      const mag = Math.sqrt(gx * gx + gy * gy);
      magnitude[idx] = mag;
    }
  }

  // 5. Dual Thresholding (Simplified Canny)
  for (let i = 0; i < magnitude.length; i++) {
    if (magnitude[i] >= CANNY_T2) {
      edges[i] = 255; // Strong edge
    } else if (magnitude[i] >= CANNY_T1) {
      // Weak edge - check neighbors for strong edges
      const y = Math.floor(i / roiW);
      const x = i % roiW;
      let hasStrongNeighbor = false;
      if (y > 0 && y < roiH - 1 && x > 0 && x < roiW - 1) {
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            if (magnitude[(y + ky) * roiW + (x + kx)] >= CANNY_T2) {
              hasStrongNeighbor = true;
              break;
            }
          }
          if (hasStrongNeighbor) break;
        }
      }
      if (hasStrongNeighbor) edges[i] = 255;
    }
  }

  // 6. Horizontal check + Polygon mask check
  const ptsRel = ptsPx.map(p => ({ x: p.x - minX, y: p.y - minY }));

  for (let y = MARGIN; y < roiH - MARGIN; y++) {
    for (let x = MARGIN; x < roiW - MARGIN; x++) {
      const idx = y * roiW + x;
      
      // Check if pixel is inside the polygon
      if (!isPointInPoly(x, y, ptsRel)) {
        overlayImg.setPixelColor(0x00000000, x, y);
        continue;
      }

      if (grayData[idx] > 0 && !hotMask[idx]) {
        totalValidPixels++;
        
        // Check for horizontal crack
        let isHorizontal = false;
        if (edges[idx] === 255) {
          let left = 0;
          for (let k = 1; k <= PIX; k++) {
            if (x - k >= 0 && edges[y * roiW + (x - k)] === 255) left++;
          }
          let right = 0;
          for (let k = 1; k <= PIX; k++) {
            if (x + k < roiW && edges[y * roiW + (x + k)] === 255) right++;
          }
          if (left >= PIX || right >= PIX) isHorizontal = true;
        }

        if (isHorizontal) {
          horizontalPixels++;
          overlayImg.setPixelColor(0xFF0000FF, x, y); // Red
        } else {
          overlayImg.setPixelColor(0x00FF0066, x, y); // Green
        }
      } else {
        overlayImg.setPixelColor(0x00000000, x, y);
      }
    }
  }

  const percentHorizontal = totalValidPixels > 0 ? (horizontalPixels / totalValidPixels) * 100 : 0;
  let classification = 'bom';
  if (percentHorizontal >= 11.0) classification = 'ruim';
  else if (percentHorizontal > 8.0) classification = 'médio';

  const roiBase64 = await roiImg.getBase64('image/png');
  const overlayBase64 = await overlayImg.getBase64('image/png');

  return {
    clsId: poly.clsId,
    index,
    bbox: { x: minX, y: minY, w: roiW, h: roiH },
    percentHorizontal: percentHorizontal.toFixed(2),
    classification,
    totalValidPixels,
    horizontalPixels,
    roiImage: roiBase64,
    overlayImage: overlayBase64
  };
}

startServer();
