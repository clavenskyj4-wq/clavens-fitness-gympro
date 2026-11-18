/**
 * Générateur de QR Code 100 % local (aucune librairie externe, aucune requête réseau).
 * Implémente le standard QR Code Model 2 (Byte mode, niveau de correction L, Versions 1 à 4)
 * afin que les cartes de membres générées hors ligne soient réellement scannables.
 */

// Tables GF(256) pour Reed-Solomon (polynôme primitif 0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Paramètres versions 1 à 4 (Niveau L) : [taille, dataCodewords, ecCodewords, alignmentCenter]
const QR_VERSIONS: Record<
  number,
  { size: number; dataCw: number; ecCw: number; align: number[] }
> = {
  1: { size: 21, dataCw: 19, ecCw: 7, align: [] },
  2: { size: 25, dataCw: 34, ecCw: 10, align: [18] },
  3: { size: 29, dataCw: 55, ecCw: 15, align: [22] },
  4: { size: 33, dataCw: 80, ecCw: 20, align: [26] },
};

function chooseVersion(byteLen: number): number {
  if (byteLen <= 17) return 1;
  if (byteLen <= 32) return 2;
  if (byteLen <= 53) return 3;
  return 4;
}

function buildDataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const spec = QR_VERSIONS[version];
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode Byte = 0100
  pushBits(0b0100, 4);
  // Longueur sur 8 bits (Versions 1..9)
  pushBits(bytes.length, 8);
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }
  // Terminateur (jusqu'à 4 bits 0)
  const maxBits = spec.dataCw * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(spec.dataCw);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    out[i] = byte;
  }
  // Rembourrage alterné 0xEC, 0x11
  let idx = bits.length / 8;
  let toggle = true;
  while (idx < spec.dataCw) {
    out[idx++] = toggle ? 0xec : 0x11;
    toggle = !toggle;
  }
  return out;
}

export function generateQRMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text.slice(0, 78));
  const version = chooseVersion(rawBytes.length);
  const spec = QR_VERSIONS[version];
  const size = spec.size;

  const dataCw = buildDataCodewords(rawBytes, version);
  const ecCw = rsEncode(dataCw, spec.ecCw);
  const allCw = new Uint8Array(dataCw.length + ecCw.length);
  allCw.set(dataCw);
  allCw.set(ecCw, dataCw.length);

  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const setModule = (r: number, c: number, dark: boolean, lock = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = dark;
      if (lock) reserved[r][c] = true;
    }
  };

  // Motifs de recherche (Finder patterns 7x7 + séparateurs)
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(rr, cc, !isBorder && (isOuter || isInner), true);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Motifs d'alignement (versions >= 2)
  for (const center of spec.align) {
    const coords = [6, center];
    for (const r0 of coords) {
      for (const c0 of coords) {
        if (reserved[r0][c0]) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            setModule(r0 + r, c0 + c, dark, true);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0, true);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0, true);
  }

  // Module sombre fixe
  setModule(size - 8, 8, true, true);

  // Réserver zones de format (15 bits autour des finders)
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // Placement des bits en zigzag
  const bitStream: number[] = [];
  for (let i = 0; i < allCw.length; i++) {
    for (let b = 7; b >= 0; b--) {
      bitStream.push((allCw[i] >> b) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[row][c]) {
          const bit = bitIdx < bitStream.length ? bitStream[bitIdx++] : 0;
          // Masque 0 : (row + c) % 2 === 0
          const masked = (row + c) % 2 === 0 ? bit ^ 1 : bit;
          matrix[row][c] = masked === 1;
        }
      }
    }
    upward = !upward;
  }

  // Format info pour Niveau L (01) + Masque 0 (000) -> BCH + XOR 101010000010010 = 111011111000100
  const formatBits = '111011111000100';
  for (let i = 0; i < 15; i++) {
    const dark = formatBits[i] === '1';
    if (i < 6) matrix[8][i] = dark;
    else if (i === 6) matrix[8][7] = dark;
    else if (i === 7) matrix[8][8] = dark;
    else if (i === 8) matrix[7][8] = dark;
    else matrix[14 - i][8] = dark;

    if (i < 8) matrix[size - 1 - i][8] = dark;
    else matrix[8][size - 15 + i] = dark;
  }

  return matrix.map((row) => row.map((cell) => Boolean(cell)));
}

/**
 * Génère un motif de code-barres déterministe en SVG pour affichage complémentaire.
 */
export function generateBarcodeBars(code: string): number[] {
  const clean = code || 'GYM-0001';
  const bars: number[] = [2, 1, 2, 1];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    bars.push(((ch >> 4) & 3) + 1);
    bars.push((ch & 3) + 1);
    bars.push(((ch >> 2) & 1) + 1);
  }
  bars.push(2, 1, 2);
  return bars;
}
