// Minimal standards-compliant QR Code (Versions 1-6, ECC Level M, Byte mode) -> crisp SVG
(() => {
  'use strict';

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < ecCount - 1; j++) res[j] = res[j + 1];
      res[ecCount - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecCount; j++) {
          res[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return res;
  }

  // Version specs for ECC Level M: [totalDataBytes, ecBytesPerBlock, numBlocks, alignCenters]
  const VERSIONS_M = {
    1: [16, 10, 1, []],
    2: [28, 16, 1, [6, 18]],
    3: [44, 26, 1, [6, 22]],
    4: [64, 18, 2, [6, 26]],
    5: [86, 24, 2, [6, 30]],
    6: [108, 16, 4, [6, 34]]
  };

  function encodeQR(text) {
    const bytes = new TextEncoder().encode(text);
    let ver = 1;
    while (ver <= 6 && bytes.length + 2 > VERSIONS_M[ver][0]) ver++;
    if (ver > 6) throw new Error('Texto demasiado largo para QR');

    const [totalData, ecPerBlock, numBlocks, align] = VERSIONS_M[ver];
    const size = ver * 4 + 17;

    // Bit buffer: Byte mode (0100), 8-bit length, payload, terminator, pad bytes
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);
    const maxBits = totalData * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataBytes.push(byte);
    }
    const pads = [0xec, 0x11];
    let pi = 0;
    while (dataBytes.length < totalData) {
      dataBytes.push(pads[pi++ & 1]);
    }

    // Split into blocks & compute ECC
    const blockLen = Math.floor(totalData / numBlocks);
    const dataBlocks = [];
    const ecBlocks = [];
    for (let b = 0; b < numBlocks; b++) {
      const slice = dataBytes.slice(b * blockLen, (b + 1) * blockLen);
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, ecPerBlock));
    }

    // Interleave codewords
    const codewords = [];
    for (let i = 0; i < blockLen; i++) {
      for (let b = 0; b < numBlocks; b++) codewords.push(dataBlocks[b][i]);
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (let b = 0; b < numBlocks; b++) codewords.push(ecBlocks[b][i]);
    }

    // Build matrix
    const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, v) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mat[r][c] = v ? 1 : 0;
        isFunc[r][c] = 1;
      }
    };

    // Finder patterns + separators
    const placeFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const dark = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setFunc(r, c, dark ? 1 : 0);
        }
      }
    };
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // Alignment patterns
    for (const r of align) {
      for (const c of align) {
        if (isFunc[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setFunc(r + dr, c + dc, dark ? 1 : 0);
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0 ? 1 : 0);
      setFunc(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Reserve format info & dark module
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        if (!isFunc[8][i]) setFunc(8, i, 0);
        if (!isFunc[i][8]) setFunc(i, 8, 0);
      }
    }
    for (let i = size - 8; i < size; i++) {
      setFunc(8, i, 0);
      setFunc(i, 8, 0);
    }
    setFunc(size - 8, 8, 1);

    // Place data bits (mask 0: (r + c) % 2 === 0)
    const mask = 0;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let up = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const r = up ? size - 1 - i : i;
        for (let dx = 0; dx < 2; dx++) {
          const c = col - dx;
          if (isFunc[r][c]) continue;
          let bit = 0;
          if (bitIdx < totalBits) {
            bit = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          if ((r + c) % 2 === 0) bit ^= 1;
          mat[r][c] = bit;
        }
      }
      up = !up;
    }

    // Format info for ECC Level M (00) + mask 0 (000) -> 5-bit data = 0b00000
    // BCH(15,5) of 0b00000 is 0, XOR with 0b101010000010010 = 0x5412
    const formatBits = 0x5412;
    for (let i = 0; i < 6; i++) setFunc(8, i, (formatBits >>> (14 - i)) & 1);
    setFunc(8, 7, (formatBits >>> 8) & 1);
    setFunc(8, 8, (formatBits >>> 7) & 1);
    setFunc(7, 8, (formatBits >>> 6) & 1);
    for (let i = 0; i < 6; i++) setFunc(5 - i, 8, (formatBits >>> (5 - i)) & 1);

    for (let i = 0; i < 7; i++) setFunc(size - 1 - i, 8, (formatBits >>> (14 - i)) & 1);
    for (let i = 0; i < 8; i++) setFunc(8, size - 8 + i, (formatBits >>> (7 - i)) & 1);

    return { size, mat };
  }

  window.renderQrSvg = function renderQrSvg(text, pixelSize = 188) {
    const { size, mat } = encodeQR(text);
    const margin = 3;
    const total = size + margin * 2;
    let d = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (mat[r][c] === 1) {
          d += `M${c + margin},${r + margin}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixelSize}" height="${pixelSize}" role="img" aria-label="Código QR de la sesión" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff" rx="2"/><path d="${d}" fill="#143833"/></svg>`;
  };
})();
