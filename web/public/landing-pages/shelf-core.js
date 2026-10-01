// Shared book-making code for the UCI Planner shelves (major-shelf, home-shelf).
// Adapted from ThreeUI "Complete Shelf" (Working Volumes): the cloth, foil, paper
// and page-block construction of a hardcover, plus the warm oak bookcase both
// pages now stand their books in.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const clamp = THREE.MathUtils.clamp;
const pad = (value) => String(value).padStart(2, "0");
export const shortName = (name) => name.replace(/, (B\.\w+\.|Minor)$/, "");

let renderer = null;

/** Textures read the GPU's anisotropy limit, so pages hand their renderer over first. */
export function bindRenderer(nextRenderer) {
  renderer = nextRenderer;
}

export const SERIF = '"Iowan Old Style", Baskerville, Georgia, serif';
export const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

export const MAJOR_DEGREES = {
  bs: { short: "B.S.", long: "Bachelor of Science" },
  ba: { short: "B.A.", long: "Bachelor of Arts" },
  bfa: { short: "B.F.A.", long: "Bachelor of Fine Arts" },
  bmus: { short: "B.Mus.", long: "Bachelor of Music" }
};

// The seven authored bindings, cycled along the shelf so neighbours never share a colour.
export const PALETTES = [
  {
    binding: "Ultramarine cloth · copper foil",
    color: "#182a43",
    foil: "#c87046",
    palette: { paper: "#171a24", paperDeep: "#10131b", paperPale: "#f1eadf", ink: "#f4eee6", inkSoft: "#b9b4ae", wall: "#171a24", shelf: "#3a2118", shelfDark: "#1c0e0a", light: "#f4d7b9", fill: "#9fb3c9" }
  },
  {
    binding: "Burnt-orange cloth · antique-gold foil",
    color: "#c24d24",
    foil: "#efc16d",
    palette: { paper: "#762f1b", paperDeep: "#572113", paperPale: "#ffe4c5", ink: "#fff0df", inkSoft: "#e3bfa8", wall: "#762f1b", shelf: "#402015", shelfDark: "#1d0d08", light: "#ffd19a", fill: "#dc8c6b" }
  },
  {
    binding: "Citron cloth · black gloss foil",
    color: "#afc400",
    foil: "#171a16",
    matteFoil: true,
    palette: { paper: "#c3cf21", paperDeep: "#9eaa16", paperPale: "#f0f2c9", ink: "#171914", inkSoft: "#485015", wall: "#c3cf21", shelf: "#3b2418", shelfDark: "#1c0f09", light: "#fff6ce", fill: "#dce37e" }
  },
  {
    binding: "Cobalt cloth · cool-silver foil",
    color: "#1537a1",
    foil: "#dbe8f1",
    palette: { paper: "#142a80", paperDeep: "#0b1953", paperPale: "#dbe8f1", ink: "#f3f5f2", inkSoft: "#b5c7e9", wall: "#142a80", shelf: "#3b2117", shelfDark: "#1a0d08", light: "#e5edf2", fill: "#5f85dc" }
  },
  {
    binding: "Vermilion cloth · rose-gold foil",
    color: "#c83222",
    foil: "#efb0aa",
    palette: { paper: "#a62c21", paperDeep: "#7f1e17", paperPale: "#ffe0d5", ink: "#fff0e8", inkSoft: "#e9bbb2", wall: "#a62c21", shelf: "#432016", shelfDark: "#1f0d08", light: "#ffd1bc", fill: "#d66d66" }
  },
  {
    binding: "Coral cloth · copper foil",
    color: "#da3b2f",
    foil: "#ff8eab",
    palette: { paper: "#ae2830", paperDeep: "#7f1822", paperPale: "#ffe0df", ink: "#fff0e9", inkSoft: "#efb9b4", wall: "#ae2830", shelf: "#402016", shelfDark: "#1d0d08", light: "#ffc3bb", fill: "#e46d78" }
  },
  {
    binding: "Icy-cyan cloth · aluminum foil",
    color: "#78a7bd",
    foil: "#e4e7e5",
    palette: { paper: "#7ea5b7", paperDeep: "#5e8699", paperPale: "#e6f0f2", ink: "#102a36", inkSoft: "#274b5a", wall: "#7ea5b7", shelf: "#382017", shelfDark: "#1b0e09", light: "#eef5f2", fill: "#add1df" }
  }
];

export const UNDECIDED_PALETTE = {
  binding: "Bone cloth · copper foil",
  color: "#e3d8c4",
  foil: "#c87046",
  palette: { paper: "#1d1b19", paperDeep: "#141210", paperPale: "#f1eadf", ink: "#f4eee6", inkSoft: "#b9b0a4", wall: "#1d1b19", shelf: "#3a2118", shelfDark: "#1c0e0a", light: "#f4d7b9", fill: "#c9b9a3" }
};

export const MOTIFS = [
  ["brackets", "Nested brackets"],
  ["paths", "Interlaced paths"],
  ["caret", "Directional caret"],
  ["orbits", "Suspended orbits"],
  ["modules", "Connected modules"],
  ["frames", "Folded frames"],
  ["compass", "Drafting compass"]
];

export const FLEXIBLE_PAGE_SEGMENTS = 18;
export const FLEXIBLE_PAGE_VERTICAL_SEGMENTS = 8;

// Every book surface uses MeshStandardMaterial. The authored scene used
// MeshPhysicalMaterial with cloth sheen and a clearcoat on the foil, which is
// several times the per-pixel cost on integrated GPUs; the physical-only
// parameters are dropped here so the material definitions below stay readable
// against the original.
export const PHYSICAL_ONLY = ["sheen", "sheenRoughness", "sheenColor", "clearcoat", "clearcoatRoughness"];

export function standardMaterial(parameters) {
  const standard = { ...parameters };
  PHYSICAL_ONLY.forEach((key) => delete standard[key]);
  return new THREE.MeshStandardMaterial(standard);
}

export const shared = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  page: standardMaterial({
    color: 0xe7dfcf,
    roughness: 0.95,
    metalness: 0,
    sheen: 0.025,
    sheenRoughness: 1
  }),
  pageSheet: standardMaterial({
    color: 0xeee6d7,
    roughness: 0.955,
    metalness: 0,
    sheen: 0.02,
    sheenRoughness: 1,
    side: THREE.DoubleSide
  }),
  headband: standardMaterial({
    color: 0xc6a66d,
    roughness: 0.58,
    metalness: 0.16,
    sheen: 0.14,
    sheenRoughness: 0.76
  }),
  walnut: new THREE.MeshStandardMaterial({
    color: 0x4a2b1d,
    roughness: 0.58,
    metalness: 0
  }),
  walnutDark: new THREE.MeshStandardMaterial({
    color: 0x2a170f,
    roughness: 0.7,
    metalness: 0
  })
};

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function makeBook(fields, index, style, motifIndex) {
  const random = seededRandom(hashString(fields.id));
  const width = 0.92 + random() * 0.2;
  const height = 1.46 + random() * 0.22;
  const depth = 0.22 + random() * 0.08;
  const [motifKey, motif] = MOTIFS[motifIndex % MOTIFS.length];
  return {
    ...fields,
    index,
    binding: style.binding,
    color: style.color,
    foil: style.foil,
    matteFoil: Boolean(style.matteFoil),
    palette: style.palette,
    motifKey,
    motif,
    format: `${Math.round(width * 145)} × ${Math.round(height * 137)} mm`,
    width,
    height,
    depth,
    seed: hashString(fields.id) % 97
  };
}

/* ── Authored scene (Working Volumes) ───────────────────────────────────── */

export function createFadeMaterial(baseMaterial) {
  const material = baseMaterial.clone();
  material.transparent = true;
  material.opacity = 1;
  return material;
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

// Long programme names have to fit a cover, a spine and a page, so titles are
// wrapped by measured width and stepped down in size until they fit.
export function wrapToWidth(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

export function fitTitle(ctx, text, maxWidth, maxLines, startSize, minSize) {
  ctx.letterSpacing = "0px";
  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `400 ${size}px ${SERIF}`;
    const lines = wrapToWidth(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
      return { size, lines };
    }
  }
  ctx.font = `400 ${minSize}px ${SERIF}`;
  return { size: minSize, lines: wrapToWidth(ctx, text, maxWidth) };
}

export function drawMotif(ctx, book, width, height) {
  const foil = book.foil;
  ctx.save();
  ctx.strokeStyle = foil;
  ctx.fillStyle = foil;
  ctx.lineWidth = Math.max(3, width * 0.004);
  ctx.globalAlpha = 0.88;
  const centerX = width * 0.5;
  const centerY = height * 0.38;
  const size = Math.min(width, height) * 0.22;

  if (book.motifKey === "brackets") {
    for (let layer = 0; layer < 3; layer += 1) {
      const inset = layer * size * 0.22;
      const left = centerX - size + inset;
      const right = centerX + size - inset;
      const top = centerY - size * 0.72 + inset;
      const bottom = centerY + size * 0.72 - inset;
      ctx.beginPath();
      ctx.moveTo(left + size * 0.25, top);
      ctx.lineTo(left, top);
      ctx.lineTo(left, bottom);
      ctx.lineTo(left + size * 0.25, bottom);
      ctx.moveTo(right - size * 0.25, top);
      ctx.lineTo(right, top);
      ctx.lineTo(right, bottom);
      ctx.lineTo(right - size * 0.25, bottom);
      ctx.stroke();
    }
    ctx.fillRect(centerX - 3, centerY - 3, 6, 6);
  } else if (book.motifKey === "paths") {
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY + size * 0.35);
    ctx.bezierCurveTo(centerX - size * 0.2, centerY - size, centerX + size * 0.1, centerY + size, centerX + size, centerY - size * 0.25);
    ctx.stroke();
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY - size * 0.45);
    ctx.bezierCurveTo(centerX - size * 0.25, centerY + size, centerX + size * 0.3, centerY - size, centerX + size, centerY + size * 0.45);
    ctx.stroke();
    for (let point = -1; point <= 1; point += 1) {
      ctx.beginPath();
      ctx.arc(centerX + point * size, centerY - point * size * 0.25, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (book.motifKey === "caret") {
    ctx.beginPath();
    ctx.moveTo(centerX - size * 0.9, centerY + size * 0.6);
    ctx.lineTo(centerX, centerY - size * 0.65);
    ctx.lineTo(centerX + size * 0.9, centerY + size * 0.6);
    ctx.stroke();
    ctx.globalAlpha = 0.38;
    for (let line = -2; line <= 2; line += 1) {
      ctx.beginPath();
      ctx.moveTo(centerX - size, centerY + line * size * 0.28);
      ctx.lineTo(centerX + size, centerY + line * size * 0.28);
      ctx.stroke();
    }
  } else if (book.motifKey === "orbits") {
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, size, size * 0.42, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.58;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, size * 0.72, size, 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(centerX + size * 0.64, centerY - size * 0.34, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(centerX - 6, centerY - 6, 12, 12);
  } else if (book.motifKey === "modules") {
    const moduleSize = size * 0.54;
    const positions = [
      [-0.55, -0.5, "circle"],
      [0.25, -0.5, "rect"],
      [-0.55, 0.3, "rect"],
      [0.25, 0.3, "circle"]
    ];
    positions.forEach(([x, y, shape], index) => {
      ctx.globalAlpha = 0.45 + index * 0.12;
      if (shape === "circle") {
        ctx.beginPath();
        ctx.arc(centerX + x * size, centerY + y * size, moduleSize * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(
          centerX + x * size - moduleSize * 0.5,
          centerY + y * size - moduleSize * 0.5,
          moduleSize,
          moduleSize
        );
      }
    });
  } else if (book.motifKey === "frames") {
    for (let layer = 0; layer < 4; layer += 1) {
      ctx.globalAlpha = 0.9 - layer * 0.17;
      const offset = layer * size * 0.18;
      ctx.strokeRect(
        centerX - size + offset,
        centerY - size * 0.7 + offset,
        size * 2 - offset * 2,
        size * 1.4 - offset * 2
      );
    }
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY - size * 0.7);
    ctx.lineTo(centerX + size, centerY + size * 0.7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.78, 0.15, Math.PI * 1.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - size * 0.72, centerY + size * 0.88);
    ctx.lineTo(centerX, centerY - size * 0.92);
    ctx.lineTo(centerX + size * 0.72, centerY + size * 0.88);
    ctx.stroke();
    ctx.globalAlpha = 0.48;
    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY);
    ctx.lineTo(centerX + size, centerY);
    ctx.stroke();
  }
  ctx.restore();
}

export const layerCache = new Map();

// A transparent canvas drawn once and reused by every book that asks for it.
export function cachedLayer(key, width, height, draw) {
  if (!layerCache.has(key)) {
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    draw(layer.getContext("2d"), width, height);
    layerCache.set(key, layer);
  }
  return layerCache.get(key);
}

export let sharedPaperFaceTexture = null;
export let sharedPageEdgeTextures = null;
export let sharedContactShadowTexture = null;
export let sharedClothBumpTexture = null;
export let sharedClothSurfaceMaps = null;

export function configureCanvasTexture(texture, {
  color = true,
  anisotropy = 16
} = {}) {
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    anisotropy,
    renderer.capabilities.getMaxAnisotropy()
  );
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// The authored cover atlas carried artwork for seven specific volumes, so every
// major uses the procedural cloth cover instead. The title is left to the foil
// layer so it is not printed twice.
export function makeCoverTexture(book) {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 768;
  canvasTexture.height = 1152;
  const ctx = canvasTexture.getContext("2d");

  ctx.fillStyle = book.color;
  ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

  // The edge shading and the 1,250 cloth threads are colour-independent, so they
  // are drawn once and laid over every cover instead of re-stroked per book.
  ctx.drawImage(cachedLayer("cover-cloth", canvasTexture.width, canvasTexture.height, (layer, width, height) => {
    const random = seededRandom(hashSeed("cover-cloth"));
    const edge = layer.createLinearGradient(0, 0, width, 0);
    edge.addColorStop(0, "rgba(0,0,0,0.24)");
    edge.addColorStop(0.075, "rgba(255,255,255,0.035)");
    edge.addColorStop(0.5, "rgba(255,255,255,0.01)");
    edge.addColorStop(0.94, "rgba(0,0,0,0.06)");
    edge.addColorStop(1, "rgba(0,0,0,0.19)");
    layer.fillStyle = edge;
    layer.fillRect(0, 0, width, height);

    for (let line = 0; line < 1250; line += 1) {
      const x = random() * width;
      const y = random() * height;
      const length = 4 + random() * 22;
      layer.strokeStyle = random() > 0.5 ? "rgba(255,255,255,0.024)" : "rgba(0,0,0,0.025)";
      layer.lineWidth = 0.6 + random() * 0.8;
      layer.beginPath();
      layer.moveTo(x, y);
      layer.lineTo(x + length, y + (random() - 0.5) * 2);
      layer.stroke();
    }
  }), 0, 0);

  ctx.strokeStyle = book.foil;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 42, canvasTexture.width - 84, canvasTexture.height - 84);
  ctx.strokeRect(55, 55, canvasTexture.width - 110, canvasTexture.height - 110);
  ctx.globalAlpha = 1;

  drawMotif(ctx, book, canvasTexture.width, canvasTexture.height);

  return configureCanvasTexture(new THREE.CanvasTexture(canvasTexture));
}

export function makeFoilTexture(book) {
  const foilCanvas = document.createElement("canvas");
  foilCanvas.width = 768;
  foilCanvas.height = 1152;
  const ctx = foilCanvas.getContext("2d");

  ctx.clearRect(0, 0, foilCanvas.width, foilCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 15px ${SANS}`;
  ctx.letterSpacing = "2.8px";
  ctx.fillText(`UC IRVINE  /  ${book.roman}`, 80, 100);
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 116);
  ctx.lineTo(186, 116);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const title = fitTitle(ctx, book.title, foilCanvas.width - 160, 3, 78, 40);
  const lineHeight = title.size * 1.02;
  title.lines.forEach((line, index) => {
    ctx.fillText(line, 78, 1010 - (title.lines.length - 1 - index) * lineHeight);
  });
  ctx.font = `500 14px ${SANS}`;
  ctx.letterSpacing = "2.4px";
  ctx.fillText(book.discipline.toUpperCase(), 80, 1058);

  return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
}

export function makeClothBumpTexture(book) {
  if (sharedClothBumpTexture) return sharedClothBumpTexture;
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const ctx = bumpCanvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-cloth`) + book.seed);

  ctx.fillStyle = "#7f7f7f";
  ctx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

  for (let line = 0; line < 256; line += 2) {
    const value = Math.round(98 + random() * 70);
    ctx.strokeStyle = `rgb(${value},${value},${value})`;
    ctx.globalAlpha = 0.34 + random() * 0.18;
    ctx.lineWidth = 0.65 + random() * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, line + (random() - 0.5));
    ctx.lineTo(256, line + (random() - 0.5));
    ctx.stroke();
  }

  for (let line = 1; line < 256; line += 3) {
    const value = Math.round(105 + random() * 58);
    ctx.strokeStyle = `rgb(${value},${value},${value})`;
    ctx.globalAlpha = 0.25 + random() * 0.14;
    ctx.lineWidth = 0.55 + random() * 0.35;
    ctx.beginPath();
    ctx.moveTo(line + (random() - 0.5), 0);
    ctx.lineTo(line + (random() - 0.5), 256);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(bumpCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 8);
  sharedClothBumpTexture = configureCanvasTexture(texture, {
    color: false,
    anisotropy: 12
  });
  return sharedClothBumpTexture;
}

export function makeClothSurfaceMaps(book) {
  if (sharedClothSurfaceMaps) return sharedClothSurfaceMaps;
  const size = 256;
  const heightField = new Float32Array(size * size);
  const normalCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  normalCanvas.width = roughnessCanvas.width = size;
  normalCanvas.height = roughnessCanvas.height = size;
  const normalContext = normalCanvas.getContext("2d");
  const roughnessContext = roughnessCanvas.getContext("2d");
  const normalImage = normalContext.createImageData(size, size);
  const roughnessImage = roughnessContext.createImageData(size, size);
  const phase = (book.seed % 19) * 0.23;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const warp = Math.sin((x + phase) * Math.PI * 0.52);
      const weft = Math.sin((y - phase) * Math.PI * 0.41);
      const cross = Math.sin((x + y + phase) * Math.PI * 0.19);
      heightField[y * size + x] = 0.5 + warp * 0.18 + weft * 0.15 + cross * 0.045;
    }
  }

  const sampleHeight = (x, y) => {
    const wrappedX = (x + size) % size;
    const wrappedY = (y + size) % size;
    return heightField[wrappedY * size + wrappedX];
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const pixel = index * 4;
      const dx = (sampleHeight(x + 1, y) - sampleHeight(x - 1, y)) * 1.5;
      const dy = (sampleHeight(x, y + 1) - sampleHeight(x, y - 1)) * 1.5;
      const length = Math.hypot(dx, dy, 1);
      normalImage.data[pixel] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 3] = 255;

      const roughness = Math.round(188 + heightField[index] * 56);
      roughnessImage.data[pixel] = roughness;
      roughnessImage.data[pixel + 1] = roughness;
      roughnessImage.data[pixel + 2] = roughness;
      roughnessImage.data[pixel + 3] = 255;
    }
  }

  normalContext.putImageData(normalImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  const configureWeaveMap = (canvas, suffix) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `shelf-${suffix}`;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 8);
    return configureCanvasTexture(texture, {
      color: false,
      anisotropy: 12
    });
  };

  sharedClothSurfaceMaps = {
    normal: configureWeaveMap(normalCanvas, "cloth-normal"),
    roughness: configureWeaveMap(roughnessCanvas, "cloth-roughness")
  };
  return sharedClothSurfaceMaps;
}

export function makeEmbossMap(sourceTexture, name) {
  const texture = new THREE.CanvasTexture(sourceTexture.image);
  texture.name = name;
  texture.wrapS = sourceTexture.wrapS;
  texture.wrapT = sourceTexture.wrapT;
  texture.repeat.copy(sourceTexture.repeat);
  texture.offset.copy(sourceTexture.offset);
  texture.center.copy(sourceTexture.center);
  texture.rotation = sourceTexture.rotation;
  return configureCanvasTexture(texture, {
    color: false,
    anisotropy: 16
  });
}

export function drawPaperSurface(ctx, width, height, random) {
  ctx.fillStyle = "#e8e1d3";
  ctx.fillRect(0, 0, width, height);

  const paperWash = ctx.createLinearGradient(0, 0, width, height);
  paperWash.addColorStop(0, "rgba(255,255,255,0.22)");
  paperWash.addColorStop(0.42, "rgba(255,255,255,0.035)");
  paperWash.addColorStop(1, "rgba(103,87,64,0.08)");
  ctx.fillStyle = paperWash;
  ctx.fillRect(0, 0, width, height);

  for (let fiber = 0; fiber < 2400; fiber += 1) {
    const x = random() * width;
    const y = random() * height;
    const length = 5 + random() * 34;
    const lightFiber = random() > 0.44;
    ctx.strokeStyle = lightFiber
      ? `rgba(255,255,255,${0.025 + random() * 0.045})`
      : `rgba(92,76,55,${0.018 + random() * 0.035})`;
    ctx.lineWidth = 0.45 + random() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      Math.min(width, x + length),
      y + (random() - 0.5) * 2.2
    );
    ctx.stroke();
  }

  for (let fleck = 0; fleck < 1200; fleck += 1) {
    const tone = Math.round(112 + random() * 94);
    ctx.fillStyle = `rgba(${tone},${tone - 5},${tone - 13},${0.016 + random() * 0.025})`;
    const size = 0.5 + random() * 1.1;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
}

export function makePaperFaceTexture() {
  if (sharedPaperFaceTexture) return sharedPaperFaceTexture;

  const paperCanvas = document.createElement("canvas");
  paperCanvas.width = 768;
  paperCanvas.height = 1152;
  const ctx = paperCanvas.getContext("2d");
  const random = seededRandom(hashSeed("working-volumes-paper-stock"));

  drawPaperSurface(ctx, paperCanvas.width, paperCanvas.height, random);

  sharedPaperFaceTexture = configureCanvasTexture(new THREE.CanvasTexture(paperCanvas));
  return sharedPaperFaceTexture;
}

export function drawWrappedCanvasText(ctx, text, x, y, maxCharacters, lineHeight, maxLines = 6) {
  const words = text.split(/\s+/);
  let line = "";
  let lineIndex = 0;

  words.forEach((word) => {
    if (lineIndex >= maxLines) return;
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex += 1;
    } else {
      line = candidate;
    }
  });

  if (line && lineIndex < maxLines) {
    ctx.fillText(line, x, y + lineIndex * lineHeight);
  }
}

export function makeEndpaperTexture(book) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-endpaper`) + book.seed);
  drawPaperSurface(ctx, canvas.width, canvas.height, random);

  ctx.save();
  ctx.fillStyle = book.color;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = book.foil;
  ctx.lineWidth = 1;
  for (let x = 28; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 24; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.42;
  drawMotif(ctx, { ...book, foil: book.palette.inkSoft }, canvas.width, canvas.height);
  ctx.restore();

  const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), {
    anisotropy: 16
  });
  texture.name = `${book.id}-patterned-endpaper`;
  return texture;
}

export function makeInteriorPageTextures(book) {
  const pageCount = 8;
  const inkColor = new THREE.Color(book.color).lerp(new THREE.Color(0x211b16), 0.62);
  const ink = `#${inkColor.getHexString()}`;

  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const canvas = document.createElement("canvas");
    const logicalWidth = 512;
    const logicalHeight = 768;
    canvas.width = 384;
    canvas.height = 576;
    const ctx = canvas.getContext("2d");
    ctx.scale(0.75, 0.75);
    const random = seededRandom(hashSeed(`${book.id}-leaf-${pageIndex}`) + book.seed);
    drawPaperSurface(ctx, logicalWidth, logicalHeight, random);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.globalAlpha = 0.58;
    ctx.font = `500 10px ${SANS}`;
    ctx.letterSpacing = "1.8px";
    ctx.fillText(`UC IRVINE  /  ${book.roman}`, 48, 48);
    ctx.textAlign = "right";
    ctx.fillText(pad(pageIndex + 1), logicalWidth - 48, 48);
    ctx.textAlign = "left";
    ctx.fillRect(48, 64, logicalWidth - 96, 1);
    ctx.globalAlpha = 1;

    if (pageIndex === 0) {
      ctx.font = `500 12px ${SANS}`;
      ctx.letterSpacing = "2.3px";
      ctx.fillText(book.discipline.toUpperCase(), 54, 174);
      const title = fitTitle(ctx, book.title, 404, 3, 58, 34);
      title.lines.forEach((line, index) => {
        ctx.fillText(line, 52, 246 + index * title.size * 1.0);
      });
      ctx.globalAlpha = 0.55;
      ctx.font = `400 22px ${SERIF}`;
      drawWrappedCanvasText(ctx, book.note, 54, 462, 36, 30, 4);
    } else if (pageIndex === 1 || pageIndex === 3) {
      const chapterIndex = pageIndex === 1 ? 0 : 1;
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText(`CHAPTER ${pad(chapterIndex + 1)}`, 54, 166);
      ctx.font = `400 49px ${SERIF}`;
      ctx.letterSpacing = "0px";
      drawWrappedCanvasText(ctx, book.chapters[chapterIndex], 52, 244, 18, 54, 3);
      ctx.globalAlpha = 0.52;
      ctx.font = `400 20px ${SERIF}`;
      drawWrappedCanvasText(
        ctx,
        chapterIndex === 0 ? book.note : book.deck,
        54,
        438,
        42,
        28,
        6
      );
    } else if (pageIndex === 2) {
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText("PLATE 01  /  SYSTEM MOTIF", 54, 146);
      ctx.save();
      ctx.globalAlpha = 0.58;
      drawMotif(ctx, { ...book, foil: ink }, logicalWidth, logicalHeight * 0.92);
      ctx.restore();
      ctx.globalAlpha = 0.48;
      ctx.font = `400 17px ${SERIF}`;
      drawWrappedCanvasText(ctx, book.theme, 54, 650, 44, 24, 3);
    } else if (pageIndex === 4) {
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText(`NOTES  /  ${book.chapters[1].toUpperCase()}`, 54, 138);
      ctx.globalAlpha = 0.44;
      for (let column = 0; column < 2; column += 1) {
        const left = 54 + column * 214;
        for (let line = 0; line < 24; line += 1) {
          const width = line % 7 === 6 ? 72 + random() * 54 : 138 + random() * 44;
          ctx.fillRect(left, 190 + line * 18, width, 1.25);
        }
      }
      ctx.globalAlpha = 0.78;
      ctx.strokeRect(54, 654, 404, 54);
      ctx.font = `500 10px ${SANS}`;
      ctx.letterSpacing = "1.4px";
      ctx.fillText(book.motif.toUpperCase(), 70, 686);
    } else if (pageIndex === 5) {
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText("CHAPTER 03", 54, 166);
      ctx.font = `400 49px ${SERIF}`;
      ctx.letterSpacing = "0px";
      drawWrappedCanvasText(ctx, book.chapters[2], 52, 244, 18, 54, 3);
      ctx.globalAlpha = 0.52;
      ctx.font = `400 20px ${SERIF}`;
      drawWrappedCanvasText(ctx, book.deck, 54, 438, 42, 28, 6);
    } else if (pageIndex === 6) {
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText("PLATE 02  /  TECHNICAL SYSTEM", 54, 146);
      ctx.save();
      ctx.translate(logicalWidth * 0.5, 380);
      ctx.globalAlpha = 0.55;
      for (let ring = 0; ring < 5; ring += 1) {
        const radius = 38 + ring * 34;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = spoke * Math.PI * 0.25;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 36, Math.sin(angle) * 36);
        ctx.lineTo(Math.cos(angle) * 176, Math.sin(angle) * 176);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 0.48;
      ctx.font = `400 17px ${SERIF}`;
      drawWrappedCanvasText(ctx, book.theme, 54, 650, 44, 24, 3);
    } else {
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "2px";
      ctx.fillText("COLOPHON", 54, 164);
      const title = fitTitle(ctx, book.title, 404, 2, 32, 22);
      title.lines.forEach((line, index) => {
        ctx.fillText(line, 54, 230 + index * title.size * 1.1);
      });
      ctx.globalAlpha = 0.58;
      ctx.font = `400 18px ${SERIF}`;
      drawWrappedCanvasText(
        ctx,
        `${book.binding}. ${book.format}. Part of the UCI Planner major shelf.`,
        54,
        306,
        44,
        28,
        7
      );
      ctx.globalAlpha = 0.74;
      ctx.font = `500 10px ${SANS}`;
      ctx.letterSpacing = "1.8px";
      ctx.fillText(`${book.roman} / ${book.programId ?? "OPEN"}  ·  UC IRVINE`, 54, 676);
    }

    ctx.globalAlpha = 0.62;
    ctx.fillRect(48, logicalHeight - 48, logicalWidth - 96, 1);
    ctx.globalAlpha = 1;
    const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), {
      anisotropy: 16
    });
    texture.name = `${book.id}-interior-page-${pageIndex + 1}`;
    return texture;
  });
}

export function makeContactShadowTexture() {
  if (sharedContactShadowTexture) return sharedContactShadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 64, 10, 256, 64, 254);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.38, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.18)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  sharedContactShadowTexture = configureCanvasTexture(
    new THREE.CanvasTexture(canvas),
    { color: false, anisotropy: 8 }
  );
  sharedContactShadowTexture.name = "soft-contact-shadow";
  return sharedContactShadowTexture;
}

export function makePageEdgeTextures(book) {
  if (sharedPageEdgeTextures) return sharedPageEdgeTextures;

  const makeEdgeTexture = (width, height, suffix) => {
    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    const ctx = edgeCanvas.getContext("2d");
    const random = seededRandom(
      hashSeed(`${book.id}-${suffix}`) + book.seed
    );

    ctx.fillStyle = "#dcd5c7";
    ctx.fillRect(0, 0, width, height);

    const pageStep = suffix === "fore-edge" ? 2 : 1.35;
    for (let y = 0; y < height; y += pageStep) {
      const shade = Math.round(106 + random() * 74);
      const signature = random() > 0.965;
      ctx.strokeStyle = `rgba(${shade},${shade - 3},${shade - 9},${signature ? 0.34 : 0.13 + random() * 0.13})`;
      ctx.lineWidth = signature ? 1.05 : 0.42 + random() * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, y + (random() - 0.5) * 0.5);
      ctx.bezierCurveTo(
        width * 0.3,
        y + (random() - 0.5) * 0.9,
        width * 0.72,
        y + (random() - 0.5) * 0.9,
        width,
        y + (random() - 0.5) * 0.5
      );
      ctx.stroke();
    }

    const edgeShade = ctx.createLinearGradient(0, 0, width, 0);
    edgeShade.addColorStop(0, "rgba(58,48,35,0.18)");
    edgeShade.addColorStop(0.035, "rgba(255,255,255,0.04)");
    edgeShade.addColorStop(0.86, "rgba(255,255,255,0)");
    edgeShade.addColorStop(1, "rgba(58,48,35,0.12)");
    ctx.fillStyle = edgeShade;
    ctx.fillRect(0, 0, width, height);

    return configureCanvasTexture(new THREE.CanvasTexture(edgeCanvas));
  };

  sharedPageEdgeTextures = {
    fore: makeEdgeTexture(512, 2048, "fore-edge"),
    headTail: makeEdgeTexture(2048, 384, "head-tail-edge")
  };
  return sharedPageEdgeTextures;
}

export function createRoundedPlaneGeometry(width, height, radius) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const corner = Math.min(radius, halfWidth, halfHeight);
  const shape = new THREE.Shape();

  shape.moveTo(-halfWidth + corner, -halfHeight);
  shape.lineTo(halfWidth - corner, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + corner);
  shape.lineTo(halfWidth, halfHeight - corner);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - corner, halfHeight);
  shape.lineTo(-halfWidth + corner, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - corner);
  shape.lineTo(-halfWidth, -halfHeight + corner);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + corner, -halfHeight);

  const geometry = new THREE.ShapeGeometry(shape, 8);
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (position.getX(index) + halfWidth) / width;
    uv[index * 2 + 1] = (position.getY(index) + halfHeight) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function createPageBlockGeometry(width, height, depth, radius) {
  const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
  const position = geometry.getAttribute("position");
  const halfWidth = width * 0.5;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const normalizedX = clamp((x + halfWidth) / width, 0, 1);
    const gutterProgress = clamp(normalizedX / 0.16, 0, 1);
    const gutterEase = gutterProgress * gutterProgress * (3 - 2 * gutterProgress);
    const gutterCompression = (1 - gutterEase) * 0.012;
    const foreEdgeCharacter = Math.pow(normalizedX, 8) * Math.sin(position.getY(index) * 31) * 0.00055;
    const adjustedZ = Math.sign(z || 1) * Math.max(
      0,
      Math.abs(z) - gutterCompression + foreEdgeCharacter
    );
    position.setZ(index, adjustedZ);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.gutterCompression = 0.012;
  geometry.userData.pageSignatures = 6;
  return geometry;
}

export function makeSpineTexture(book) {
  const spineCanvas = document.createElement("canvas");
  spineCanvas.width = 384;
  spineCanvas.height = 1536;
  const ctx = spineCanvas.getContext("2d");
  ctx.fillStyle = book.color;
  ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

  ctx.drawImage(cachedLayer("spine-cloth", spineCanvas.width, spineCanvas.height, (layer, width, height) => {
    const random = seededRandom(hashSeed("spine-cloth"));
    const shade = layer.createLinearGradient(0, 0, width, 0);
    shade.addColorStop(0, "rgba(0,0,0,0.2)");
    shade.addColorStop(0.14, "rgba(255,255,255,0.055)");
    shade.addColorStop(0.62, "rgba(255,255,255,0.012)");
    shade.addColorStop(1, "rgba(0,0,0,0.16)");
    layer.fillStyle = shade;
    layer.fillRect(0, 0, width, height);

    for (let thread = 0; thread < 1900; thread += 1) {
      const x = random() * width;
      const y = random() * height;
      const vertical = random() > 0.42;
      layer.strokeStyle = random() > 0.5
        ? `rgba(255,255,255,${0.018 + random() * 0.038})`
        : `rgba(0,0,0,${0.018 + random() * 0.032})`;
      layer.lineWidth = 0.45 + random() * 0.7;
      layer.beginPath();
      layer.moveTo(x, y);
      layer.lineTo(
        vertical ? x + (random() - 0.5) * 1.2 : x + 8 + random() * 28,
        vertical ? y + 8 + random() * 34 : y + (random() - 0.5) * 1.2
      );
      layer.stroke();
    }

    const bottomShade = layer.createLinearGradient(0, height * 0.82, 0, height);
    bottomShade.addColorStop(0, "rgba(0,0,0,0)");
    bottomShade.addColorStop(1, "rgba(0,0,0,0.12)");
    layer.fillStyle = bottomShade;
    layer.fillRect(0, 0, width, height);
  }), 0, 0);

  return configureCanvasTexture(
    new THREE.CanvasTexture(spineCanvas),
    { anisotropy: 16 }
  );
}

export function makeSpineFoilTexture(book) {
  const foilCanvas = document.createElement("canvas");
  foilCanvas.width = 384;
  foilCanvas.height = 1536;
  const ctx = foilCanvas.getContext("2d");

  ctx.clearRect(0, 0, foilCanvas.width, foilCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.4;
  ctx.strokeRect(34, 38, foilCanvas.width - 68, foilCanvas.height - 76);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 24px ${SANS}`;
  ctx.letterSpacing = "5px";
  ctx.fillText(book.roman, foilCanvas.width * 0.5, 118);

  ctx.save();
  ctx.translate(foilCanvas.width * 0.5, foilCanvas.height * 0.5);
  ctx.rotate(Math.PI / 2);
  const title = fitTitle(ctx, book.title, foilCanvas.height - 420, 2, 68, 34);
  title.lines.forEach((line, index) => {
    ctx.fillText(line, 0, (index - (title.lines.length - 1) * 0.5) * title.size * 1.05);
  });
  ctx.restore();

  ctx.beginPath();
  ctx.arc(foilCanvas.width * 0.5, foilCanvas.height - 120, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(foilCanvas.width * 0.5 - 24, foilCanvas.height - 120);
  ctx.lineTo(foilCanvas.width * 0.5 + 24, foilCanvas.height - 120);
  ctx.stroke();

  return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
}

export function makeBackCoverTexture(book) {
  const backCanvas = document.createElement("canvas");
  backCanvas.width = 768;
  backCanvas.height = 1152;
  const ctx = backCanvas.getContext("2d");
  const random = seededRandom(hashSeed(`${book.id}-back-cloth`) + book.seed);

  ctx.fillStyle = book.color;
  ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

  const edgeShade = ctx.createLinearGradient(0, 0, backCanvas.width, 0);
  edgeShade.addColorStop(0, "rgba(0,0,0,0.15)");
  edgeShade.addColorStop(0.05, "rgba(255,255,255,0.028)");
  edgeShade.addColorStop(0.84, "rgba(255,255,255,0)");
  edgeShade.addColorStop(1, "rgba(0,0,0,0.11)");
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

  for (let thread = 0; thread < 2600; thread += 1) {
    const x = random() * backCanvas.width;
    const y = random() * backCanvas.height;
    const length = 5 + random() * 30;
    ctx.strokeStyle = random() > 0.5
      ? `rgba(255,255,255,${0.018 + random() * 0.03})`
      : `rgba(0,0,0,${0.016 + random() * 0.028})`;
    ctx.lineWidth = 0.45 + random() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (random() - 0.5) * 1.5);
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(
    backCanvas.width * 0.62,
    backCanvas.height * 0.38,
    20,
    backCanvas.width * 0.62,
    backCanvas.height * 0.38,
    backCanvas.width * 0.75
  );
  vignette.addColorStop(0, "rgba(255,255,255,0.03)");
  vignette.addColorStop(1, "rgba(0,0,0,0.09)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

  return configureCanvasTexture(new THREE.CanvasTexture(backCanvas));
}

export function makeBackFoilTexture(book) {
  const foilCanvas = document.createElement("canvas");
  foilCanvas.width = 768;
  foilCanvas.height = 1152;
  const ctx = foilCanvas.getContext("2d");

  ctx.clearRect(0, 0, foilCanvas.width, foilCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 16px ${SANS}`;
  ctx.letterSpacing = "3px";
  ctx.fillText(`UC IRVINE  /  ${book.roman}`, 68, 82);
  ctx.globalAlpha = 0.72;
  ctx.fillRect(68, 108, 176, 2);
  ctx.globalAlpha = 1;

  ctx.lineWidth = 1.5;
  for (let ring = 0; ring < 5; ring += 1) {
    ctx.globalAlpha = 0.24 - ring * 0.032;
    ctx.beginPath();
    ctx.arc(548, 374, 74 + ring * 38, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(348, 374);
  ctx.lineTo(704, 374);
  ctx.moveTo(548, 174);
  ctx.lineTo(548, 574);
  ctx.stroke();

  const title = fitTitle(ctx, book.title, 632, 3, 62, 36);
  title.lines.forEach((line, index) => {
    ctx.fillText(line, 68, 956 - (title.lines.length - 1 - index) * title.size * 1.02);
  });
  ctx.font = `500 15px ${SANS}`;
  ctx.letterSpacing = "2.6px";
  ctx.fillText(book.discipline.toUpperCase(), 70, 1004);
  ctx.globalAlpha = 0.68;
  ctx.fillRect(68, 1040, 632, 1.5);
  ctx.globalAlpha = 1;
  ctx.textAlign = "right";
  ctx.fillText("UCI PLANNER · MAJOR SHELF", 700, 1080);

  return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
}

export function createMesh(geometry, material, name, cast = true, receive = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function addTurnIns(pivot, book, side, width, height, insideZ, material) {
  const stripDepth = 0.002;
  const border = 0.018;
  const longWidth = width - border * 0.7;
  const longHeight = height - border * 2.2;
  const definitions = [
    ["head", width * 0.5, height * 0.5 - border * 0.56, longWidth, border, stripDepth],
    ["tail", width * 0.5, -height * 0.5 + border * 0.56, longWidth, border, stripDepth],
    ["spine", border * 0.56, 0, border, longHeight, stripDepth],
    ["fore", width - border * 0.56, 0, border, longHeight, stripDepth]
  ];

  definitions.forEach(([edge, x, y, stripWidth, stripHeight, depth]) => {
    const strip = createMesh(
      shared.box,
      material,
      `${book.id}-${side}-turn-in-${edge}`,
      false,
      true
    );
    strip.scale.set(stripWidth, stripHeight, depth);
    strip.position.set(x, y, insideZ);
    pivot.add(strip);
  });
}

export function createBookRig(book, index) {
  const root = new THREE.Group();
  root.name = `book-${book.id}`;
  root.userData.index = index;

  const motion = new THREE.Group();
  motion.name = `${book.id}-motion`;
  root.add(motion);

  const width = book.width;
  const height = book.height;
  const depth = book.depth;
  const board = 0.032;
  const coverRadius = 0.0045;
  const pageRadius = 0.0025;
  const spineRadius = 0.0015;
  const spineBoardThickness = 0.014;
  const spineWidth = 0.082;
  const pageWidth = width - 0.074;
  const pageHeight = height - 0.068;
  const pageDepth = depth - 0.026;

  const coverTexture = makeCoverTexture(book);
  const foilTexture = makeFoilTexture(book);
  const clothBumpTexture = makeClothBumpTexture(book);
  const clothSurfaceMaps = makeClothSurfaceMaps(book);
  const paperFaceTexture = makePaperFaceTexture();
  const pageEdgeTextures = makePageEdgeTextures(book);
  const spineTexture = makeSpineTexture(book);
  const spineFoilTexture = makeSpineFoilTexture(book);
  // The foil artwork doubles as its own emboss map: it is white on transparent,
  // so it bumps the same either way, and every copy is another texture upload.
  const foilEmbossTexture = foilTexture;
  const spineEmbossTexture = spineFoilTexture;
  // The back cover and endpapers can only be seen once a book is taken off the
  // shelf, so their artwork is drawn by ensureDetailTextures() on open.
  const cloth = standardMaterial({
    color: book.color,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.34, 0.34),
    roughnessMap: clothSurfaceMaps.roughness,
    roughness: 0.98,
    metalness: 0.02,
    bumpMap: clothBumpTexture,
    bumpScale: 0.0045,
    sheen: 0.34,
    sheenRoughness: 0.76,
    sheenColor: new THREE.Color(book.foil),
    transparent: true
  });
  const coverArt = standardMaterial({
    map: coverTexture,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: clothSurfaceMaps.roughness,
    bumpMap: clothBumpTexture,
    bumpScale: 0.0035,
    roughness: 0.92,
    metalness: 0.035,
    clearcoat: 0.06,
    clearcoatRoughness: 0.72,
    sheen: 0.26,
    sheenRoughness: 0.78,
    transparent: true
  });
  const foilArt = standardMaterial({
    color: book.foil,
    map: foilTexture,
    alphaMap: foilTexture,
    bumpMap: foilEmbossTexture,
    bumpScale: 0.016,
    roughness: book.matteFoil ? 0.22 : 0.2,
    metalness: book.matteFoil ? 0.34 : 0.94,
    clearcoat: 0.18,
    clearcoatRoughness: 0.12,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const spineArt = standardMaterial({
    map: spineTexture,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughnessMap: clothSurfaceMaps.roughness,
    bumpMap: clothBumpTexture,
    bumpScale: 0.004,
    roughness: 0.95,
    metalness: 0.025,
    sheen: 0.27,
    sheenRoughness: 0.78,
    transparent: true,
    side: THREE.DoubleSide
  });
  const spineFoilArt = standardMaterial({
    color: book.foil,
    map: spineFoilTexture,
    alphaMap: spineFoilTexture,
    bumpMap: spineEmbossTexture,
    bumpScale: 0.017,
    roughness: 0.19,
    metalness: book.matteFoil ? 0.34 : 0.92,
    clearcoat: 0.16,
    clearcoatRoughness: 0.13,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide
  });
  const backArt = standardMaterial({
    color: book.color,
    normalMap: clothSurfaceMaps.normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughnessMap: clothSurfaceMaps.roughness,
    bumpMap: clothBumpTexture,
    bumpScale: 0.0035,
    roughness: 0.96,
    metalness: 0.025,
    sheen: 0.25,
    sheenRoughness: 0.8,
    transparent: true,
    side: THREE.DoubleSide
  });
  const backFoilArt = standardMaterial({
    color: book.foil,
    bumpScale: 0.016,
    roughness: 0.21,
    metalness: book.matteFoil ? 0.34 : 0.9,
    clearcoat: 0.14,
    clearcoatRoughness: 0.14,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide
  });
  const endpaperMaterial = standardMaterial({
    color: new THREE.Color(book.palette.paperPale).lerp(new THREE.Color(0xf2ead8), 0.5),
    map: paperFaceTexture,
    bumpMap: paperFaceTexture,
    bumpScale: 0.0018,
    roughness: 0.94,
    metalness: 0,
    sheen: 0.025,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
    transparent: true
  });
  const foreEdgeMaterial = standardMaterial({
    color: 0xffffff,
    map: pageEdgeTextures.fore,
    bumpMap: pageEdgeTextures.fore,
    bumpScale: 0.0022,
    roughness: 0.93,
    metalness: 0,
    sheen: 0.018,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
    transparent: true
  });
  const headTailEdgeMaterial = standardMaterial({
    color: 0xffffff,
    map: pageEdgeTextures.headTail,
    bumpMap: pageEdgeTextures.headTail,
    bumpScale: 0.0015,
    roughness: 0.94,
    metalness: 0,
    sheen: 0.014,
    sheenRoughness: 1,
    side: THREE.DoubleSide,
    transparent: true
  });
  const grooveMaterial = standardMaterial({
    color: new THREE.Color(book.color).multiplyScalar(0.42),
    roughness: 0.9,
    metalness: 0,
    bumpMap: clothBumpTexture,
    bumpScale: 0.006,
    side: THREE.DoubleSide,
    transparent: true
  });
  const pageMaterial = createFadeMaterial(shared.page);
  const headbandMaterial = createFadeMaterial(shared.headband);
  // Interior pages start as plain paper; ensureInteriorPages() prints them when the
  // book is opened, so the shelf never draws page art nobody reads.
  const interiorPageMaterials = Array.from({ length: 8 }, () => {
    const material = createFadeMaterial(shared.pageSheet);
    material.map = paperFaceTexture;
    material.bumpMap = paperFaceTexture;
    material.bumpScale = 0.0012;
    material.roughness = 0.96;
    material.side = THREE.FrontSide;
    material.needsUpdate = true;
    return material;
  });
  const blankPageMaterial = createFadeMaterial(shared.pageSheet);
  blankPageMaterial.map = paperFaceTexture;
  blankPageMaterial.bumpMap = paperFaceTexture;
  blankPageMaterial.bumpScale = 0.0012;
  blankPageMaterial.roughness = 0.96;
  blankPageMaterial.side = THREE.FrontSide;
  blankPageMaterial.needsUpdate = true;
  const signatureMaterial = standardMaterial({
    color: new THREE.Color(0x8d816f).lerp(new THREE.Color(book.palette.paperPale), 0.34),
    roughness: 0.98,
    metalness: 0,
    transparent: true
  });
  const ribbonMaterial = standardMaterial({
    color: new THREE.Color(book.foil).lerp(new THREE.Color(book.color), 0.28),
    roughness: 0.62,
    metalness: 0.08,
    sheen: 0.36,
    sheenRoughness: 0.68,
    side: THREE.DoubleSide,
    transparent: true
  });

  pageMaterial.map = paperFaceTexture;
  pageMaterial.bumpMap = paperFaceTexture;
  pageMaterial.bumpScale = 0.0014;
  pageMaterial.roughness = 0.95;
  pageMaterial.needsUpdate = true;

  const coverGeometry = new RoundedBoxGeometry(
    width,
    height,
    board,
    2,
    coverRadius
  );
  const pageGeometry = createPageBlockGeometry(
    pageWidth,
    pageHeight,
    pageDepth,
    pageRadius
  );
  const coverSurfaceGeometry = createRoundedPlaneGeometry(
    width - 0.007,
    height - 0.007,
    0.0035
  );
  const endpaperGeometry = createRoundedPlaneGeometry(
    width - 0.045,
    height - 0.045,
    0.003
  );

  const pageBlock = createMesh(pageGeometry, pageMaterial, `${book.id}-page-block`);
  pageBlock.position.x = 0.018;
  motion.add(pageBlock);

  const backPivot = new THREE.Group();
  backPivot.name = `${book.id}-back-cover-pivot`;
  backPivot.position.set(-width * 0.5, 0, -depth * 0.5 - board * 0.5);
  const backCover = createMesh(coverGeometry, cloth, `${book.id}-back-cover`);
  backCover.position.x = width * 0.5;
  backPivot.add(backCover);

  const backPlane = createMesh(
    coverSurfaceGeometry,
    backArt,
    `${book.id}-back-cover-art`,
    false,
    false
  );
  backPlane.position.set(width * 0.5, 0, -board * 0.55);
  backPlane.rotation.y = Math.PI;
  backPivot.add(backPlane);

  const backFoilPlane = createMesh(
    coverSurfaceGeometry,
    backFoilArt,
    `${book.id}-back-foil-art`,
    false,
    false
  );
  backFoilPlane.position.set(width * 0.5, 0, -board * 0.605);
  backFoilPlane.rotation.y = Math.PI;
  backFoilPlane.visible = false;
  backPivot.add(backFoilPlane);

  const backEndpaper = createMesh(
    endpaperGeometry,
    endpaperMaterial,
    `${book.id}-back-endpaper`,
    false,
    true
  );
  backEndpaper.position.set(width * 0.5, 0, board * 0.515);
  backPivot.add(backEndpaper);
  addTurnIns(
    backPivot,
    book,
    "back",
    width,
    height,
    board * 0.53,
    cloth
  );

  const backGroove = createMesh(
    shared.plane,
    grooveMaterial,
    `${book.id}-back-hinge-groove`,
    false,
    false
  );
  backGroove.scale.set(0.012, height * 0.94, 1);
  backGroove.position.set(0.038, 0, -board * 0.535);
  backGroove.rotation.y = Math.PI;
  backPivot.add(backGroove);
  motion.add(backPivot);

  const frontPivot = new THREE.Group();
  frontPivot.name = `${book.id}-front-cover-pivot`;
  frontPivot.position.set(-width * 0.5, 0, depth * 0.5 + board * 0.5);
  const frontCover = createMesh(coverGeometry, cloth, `${book.id}-front-cover`);
  frontCover.position.x = width * 0.5;
  frontPivot.add(frontCover);

  const coverPlane = createMesh(
    coverSurfaceGeometry,
    coverArt,
    `${book.id}-cover-art`,
    false,
    false
  );
  coverPlane.position.set(width * 0.5, 0, board * 0.55);
  frontPivot.add(coverPlane);

  const foilPlane = createMesh(
    coverSurfaceGeometry,
    foilArt,
    `${book.id}-foil-art`,
    false,
    false
  );
  foilPlane.position.set(width * 0.5, 0, board * 0.605);
  frontPivot.add(foilPlane);

  const frontEndpaper = createMesh(
    endpaperGeometry,
    endpaperMaterial,
    `${book.id}-front-endpaper`,
    false,
    true
  );
  frontEndpaper.position.set(width * 0.5, 0, -board * 0.515);
  frontEndpaper.rotation.y = Math.PI;
  frontPivot.add(frontEndpaper);
  addTurnIns(
    frontPivot,
    book,
    "front",
    width,
    height,
    -board * 0.53,
    cloth
  );

  const frontGroove = createMesh(
    shared.plane,
    grooveMaterial,
    `${book.id}-front-hinge-groove`,
    false,
    false
  );
  frontGroove.scale.set(0.012, height * 0.94, 1);
  frontGroove.position.set(0.038, 0, board * 0.655);
  frontPivot.add(frontGroove);
  motion.add(frontPivot);

  const pagePivots = [];
  const pageSurfaces = [];
  for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
    const leafOrder = 5 - pageIndex;
    const frontPageMaterial = leafOrder < 4
      ? interiorPageMaterials[leafOrder * 2]
      : blankPageMaterial;
    const backPageMaterial = leafOrder < 4
      ? interiorPageMaterials[leafOrder * 2 + 1]
      : blankPageMaterial;
    const pagePivot = new THREE.Group();
    pagePivot.name = `${book.id}-page-${pageIndex}`;
    pagePivot.position.set(
      -width * 0.5 + spineWidth * 0.65,
      0,
      pageDepth * 0.5 + 0.0015 + pageIndex * 0.0015
    );
    pagePivot.userData.restZ = pagePivot.position.z;
    pagePivot.userData.turnedZ = depth * 0.5 + board + 0.004 + leafOrder * 0.0015;
    const frontPageGeometry = new THREE.PlaneGeometry(
      1,
      1,
      FLEXIBLE_PAGE_SEGMENTS,
      FLEXIBLE_PAGE_VERTICAL_SEGMENTS
    );
    const backPageGeometry = new THREE.PlaneGeometry(
      1,
      1,
      FLEXIBLE_PAGE_SEGMENTS,
      FLEXIBLE_PAGE_VERTICAL_SEGMENTS
    );
    const visiblePageWidth = pageWidth - spineWidth * 0.42;
    const frontPage = createMesh(
      frontPageGeometry,
      frontPageMaterial,
      `${book.id}-page-sheet-${pageIndex}-front`,
      false,
      true
    );
    frontPage.scale.set(visiblePageWidth, pageHeight - 0.014, 1);
    frontPage.position.set(visiblePageWidth * 0.5, 0, 0.00022);
    pagePivot.add(frontPage);
    pageSurfaces.push(frontPage);

    const backPage = createMesh(
      backPageGeometry,
      backPageMaterial,
      `${book.id}-page-sheet-${pageIndex}-back`,
      false,
      true
    );
    backPage.scale.set(visiblePageWidth, pageHeight - 0.014, 1);
    backPage.position.set(visiblePageWidth * 0.5, 0, -0.00022);
    backPage.rotation.y = Math.PI;
    pagePivot.add(backPage);
    pageSurfaces.push(backPage);
    pagePivot.userData.flex = {
      curve: 0,
      curveVelocity: 0,
      twist: 0,
      twistVelocity: 0,
      surfaces: [
        {
          geometry: frontPageGeometry,
          position: frontPageGeometry.attributes.position,
          base: Float32Array.from(frontPageGeometry.attributes.position.array),
          direction: 1
        },
        {
          geometry: backPageGeometry,
          position: backPageGeometry.attributes.position,
          base: Float32Array.from(backPageGeometry.attributes.position.array),
          direction: -1
        }
      ]
    };
    motion.add(pagePivot);
    pagePivots.push(pagePivot);
  }

  const spineGeometry = new RoundedBoxGeometry(
    spineBoardThickness,
    height - 0.012,
    depth + board * 1.88,
    1,
    spineRadius
  );
  const spine = createMesh(spineGeometry, spineArt, `${book.id}-flat-spine`);
  spine.position.x = -width * 0.5 - spineBoardThickness * 0.35;
  spine.userData.profile = "flat";
  motion.add(spine);

  const spineFoil = createMesh(
    shared.plane,
    spineFoilArt,
    `${book.id}-spine-foil`,
    false,
    false
  );
  spineFoil.scale.set(depth + board * 1.82, height - 0.018, 1);
  spineFoil.rotation.y = -Math.PI * 0.5;
  spineFoil.position.set(
    spine.position.x - spineBoardThickness * 0.505,
    0,
    0
  );
  motion.add(spineFoil);

  const spineLining = createMesh(
    new RoundedBoxGeometry(
      spineWidth * 0.68,
      height - 0.056,
      Math.max(0.045, pageDepth - 0.008),
      1,
      0.0015
    ),
    endpaperMaterial,
    `${book.id}-spine-lining`
  );
  spineLining.position.set(-width * 0.5 + spineWidth * 0.38, 0, 0);
  motion.add(spineLining);

  [-1, 1].forEach((direction) => {
    const headbandGeometry = new THREE.CylinderGeometry(
      0.012,
      0.012,
      pageDepth * 0.88,
      12,
      1,
      false
    );
    const headband = createMesh(
      headbandGeometry,
      headbandMaterial,
      `${book.id}-headband-${direction}`
    );
    headband.rotation.x = Math.PI * 0.5;
    headband.position.set(
      -pageWidth * 0.5 + 0.046,
      direction * (pageHeight * 0.5 - 0.004),
      0
    );
    motion.add(headband);
  });

  const ribbonGeometry = createRoundedPlaneGeometry(
    0.034,
    pageHeight * 0.76,
    0.002
  );
  const ribbon = createMesh(
    ribbonGeometry,
    ribbonMaterial,
    `${book.id}-ribbon-bookmark`,
    false,
    true
  );
  ribbon.position.set(
    -pageWidth * 0.5 + 0.09 + (book.seed % 3) * 0.018,
    -pageHeight * 0.17,
    pageDepth * 0.5 + 0.003
  );
  ribbon.rotation.z = (book.seed % 2 ? -1 : 1) * 0.014;
  motion.add(ribbon);

  for (let signatureIndex = 0; signatureIndex < 6; signatureIndex += 1) {
    const signature = createMesh(
      shared.box,
      signatureMaterial,
      `${book.id}-page-signature-${signatureIndex + 1}`,
      false,
      true
    );
    signature.scale.set(0.0035, 0.00135, pageDepth * 0.91);
    signature.position.set(
      0.018 + pageWidth * 0.5 + 0.001,
      -pageHeight * 0.5 + ((signatureIndex + 1) / 7) * pageHeight,
      0
    );
    motion.add(signature);
  }

  const foreEdge = createMesh(
    shared.plane,
    foreEdgeMaterial,
    `${book.id}-fore-edge`,
    false,
    true
  );
  foreEdge.scale.set(pageDepth * 0.94, pageHeight - 0.028, 1);
  foreEdge.rotation.y = Math.PI * 0.5;
  foreEdge.position.set(0.018 + pageWidth * 0.5 + 0.002, 0, 0);
  motion.add(foreEdge);

  [-1, 1].forEach((direction) => {
    const edge = createMesh(
      shared.plane,
      headTailEdgeMaterial,
      `${book.id}-${direction > 0 ? "head" : "tail"}-edge`,
      false,
      true
    );
    edge.scale.set(pageWidth - 0.035, pageDepth * 0.94, 1);
    edge.rotation.x = direction > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    edge.position.set(
      0.018,
      direction * (pageHeight * 0.5 + 0.002),
      0
    );
    motion.add(edge);
  });

  const hitMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const hit = createMesh(shared.box, hitMaterial, `${book.id}-hit-target`, false, false);
  hit.scale.set(width * 1.34, height * 1.2, Math.max(depth * 4, 1));
  hit.position.set(-spineWidth * 0.18, 0, 0.12);
  hit.userData.index = index;
  motion.add(hit);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(book.palette.shelfDark),
    alphaMap: makeContactShadowTexture(),
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const contactShadow = createMesh(
    shared.plane,
    contactShadowMaterial,
    `${book.id}-contact-shadow`,
    false,
    false
  );
  contactShadow.scale.set(width * 1.22, depth * 2.05, 1);
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.set(0, -height * 0.5 - 0.022, 0.025);
  root.add(contactShadow);

  return {
    data: book,
    root,
    motion,
    frontPivot,
    frontCover,
    pageBlock,
    pagePivots,
    pageSurfaces,
    pageGestureSurfaces: [...pageSurfaces, pageBlock],
    hit,
    contactShadow,
    interiorPageMaterials,
    interiorPageTextures: null,
    detailTextures: null,
    backArt,
    backFoilArt,
    backFoilPlane,
    endpaperMaterial,
    // textures this rig alone owns, released when the rig leaves the cache
    ownedTextures: [
      coverTexture,
      foilTexture,
      spineTexture,
      spineFoilTexture
    ],
    opacity: 1,
    alphaMaterials: new Set([foilArt, spineFoilArt, backFoilArt]),
    fadeMaterials: [
      cloth,
      coverArt,
      foilArt,
      spineArt,
      spineFoilArt,
      backArt,
      backFoilArt,
      endpaperMaterial,
      foreEdgeMaterial,
      headTailEdgeMaterial,
      grooveMaterial,
      pageMaterial,
      ...interiorPageMaterials,
      blankPageMaterial,
      headbandMaterial,
      signatureMaterial,
      ribbonMaterial
    ],
    materials: [
      cloth,
      coverArt,
      foilArt,
      spineArt,
      spineFoilArt,
      backArt,
      backFoilArt,
      endpaperMaterial,
      foreEdgeMaterial,
      headTailEdgeMaterial,
      grooveMaterial,
      pageMaterial,
      ...interiorPageMaterials,
      blankPageMaterial,
      headbandMaterial,
      signatureMaterial,
      ribbonMaterial,
      contactShadowMaterial,
      hitMaterial
    ],
    base: {
      width,
      height,
      depth
    }
  };
}

export function ensureDetailTextures(rig) {
  if (rig.detailTextures) return;
  const book = rig.data;
  const backCoverTexture = makeBackCoverTexture(book);
  const backFoilTexture = makeBackFoilTexture(book);
  const backEmbossTexture = makeEmbossMap(backFoilTexture, `${book.id}-back-foil-emboss`);
  const endpaperTexture = makeEndpaperTexture(book);
  rig.detailTextures = [backCoverTexture, backFoilTexture, backEmbossTexture, endpaperTexture];

  rig.backArt.map = backCoverTexture;
  rig.backArt.color.set(0xffffff);
  rig.backFoilArt.map = backFoilTexture;
  rig.backFoilArt.alphaMap = backFoilTexture;
  rig.backFoilArt.bumpMap = backEmbossTexture;
  rig.endpaperMaterial.map = endpaperTexture;
  [rig.backArt, rig.backFoilArt, rig.endpaperMaterial].forEach((material) => {
    material.needsUpdate = true;
  });
  rig.backFoilPlane.visible = true;
  rig.ownedTextures.push(...rig.detailTextures);
}

export function ensureInteriorPages(rig) {
  if (rig.interiorPageTextures) return;
  rig.interiorPageTextures = makeInteriorPageTextures(rig.data);
  rig.interiorPageMaterials.forEach((material, index) => {
    material.map = rig.interiorPageTextures[index];
    material.needsUpdate = true;
  });
  rig.ownedTextures.push(...rig.interiorPageTextures);
}

// Books are drawn as opaque whenever they are fully visible; only the ones fading
// in or out at the ends of the shelf pay for blending. The foil layers always
// blend, because their artwork is cut out by an alpha map.
export function setRigOpacity(rig, opacity) {
  rig.opacity = opacity;
  const opaque = opacity >= 0.999;
  rig.fadeMaterials.forEach((material) => {
    material.opacity = opacity;
    if (rig.alphaMaterials.has(material) || material.transparent !== opaque) return;
    material.transparent = !opaque;
    material.needsUpdate = true;
  });
}

/* ── Warm library room (shared by both shelves) ─────────────────────────── */

// One room for every page: parchment walls and light oak, so the books carry
// the colour. These are the targets the scene's materials and lights settle on.
export const WARM_ROOM = {
  wall: "#e6d2b4",
  floor: "#d7bf9c",
  shelf: "#ffffff",
  shelfDark: "#e7d3b8",
  shadow: "#4a2f1c",
  hemisphere: "#fff4e4",
  hemisphereGround: "#8a6540",
  key: "#ffe7c8",
  fill: "#f0e4d4",
  rim: "#e0b47a"
};

export const PROGRESS_PALETTE = {
  binding: "Ink-blue cloth · antique-gold foil",
  color: "#1f2a3a",
  foil: "#d9b26a",
  palette: { paper: "#e6d2b4", paperDeep: "#d7bf9c", paperPale: "#f6ecdc", ink: "#2b2119", inkSoft: "#7b6653", wall: "#e6d2b4", shelf: "#b98552", shelfDark: "#8a5a32", light: "#ffe7c8", fill: "#f0e4d4" }
};

let sharedOakTextures = null;

// Procedural light-oak: long, slightly wavering grain with darker latewood bands.
function makeOakCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const random = seededRandom(hashSeed("light-oak"));

  const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, "#c79560");
  base.addColorStop(0.5, "#b8834f");
  base.addColorStop(1, "#c48f5a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let line = 0; line < 90; line += 1) {
    const y = random() * canvas.height;
    const amplitude = 1 + random() * 5;
    const wavelength = 180 + random() * 420;
    const phase = random() * Math.PI * 2;
    const dark = random() > 0.35;
    ctx.strokeStyle = dark
      ? `rgba(92,52,22,${0.08 + random() * 0.22})`
      : `rgba(255,226,180,${0.05 + random() * 0.12})`;
    ctx.lineWidth = 0.6 + random() * (dark ? 3.2 : 1.6);
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += 16) {
      const yy = y + Math.sin(x / wavelength * Math.PI * 2 + phase) * amplitude;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  for (let fleck = 0; fleck < 1400; fleck += 1) {
    ctx.fillStyle = `rgba(70,38,14,${0.04 + random() * 0.08})`;
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 2 + random() * 9, 0.8);
  }
  return canvas;
}

/** Gives the shared shelf materials an oak finish: grain along boards, up posts. */
export function applyOakFinish() {
  if (!sharedOakTextures) {
    const canvas = makeOakCanvas();
    const along = configureCanvasTexture(new THREE.CanvasTexture(canvas), { anisotropy: 8 });
    along.wrapS = along.wrapT = THREE.RepeatWrapping;
    along.repeat.set(3, 1);
    const upright = configureCanvasTexture(new THREE.CanvasTexture(canvas), { anisotropy: 8 });
    upright.wrapS = upright.wrapT = THREE.RepeatWrapping;
    upright.center.set(0.5, 0.5);
    upright.rotation = Math.PI * 0.5;
    upright.repeat.set(2, 1);
    sharedOakTextures = { along, upright };
  }
  shared.walnut.map = sharedOakTextures.along;
  shared.walnut.color.set(WARM_ROOM.shelf);
  shared.walnut.roughness = 0.62;
  shared.walnut.needsUpdate = true;
  shared.walnutDark.map = sharedOakTextures.upright;
  shared.walnutDark.color.set(WARM_ROOM.shelfDark);
  shared.walnutDark.roughness = 0.66;
  shared.walnutDark.needsUpdate = true;
}

/**
 * An open oak bookcase: two posts and `rows` shelves, with no back so the wall
 * shows through. Returns the group and the y of each shelf's top surface,
 * top shelf first.
 */
export function createBookcase({ width, rows, rowHeight, depth = 0.9, board = 0.14 }) {
  const group = new THREE.Group();
  group.name = "oak-bookcase";
  const shelfTops = [];
  const postWidth = 0.2;
  const height = rows * rowHeight + board + 0.35;

  for (let row = 0; row < rows; row += 1) {
    const y = (rows - 1 - row) * rowHeight;
    const shelf = createMesh(shared.box, shared.walnut, `bookcase-shelf-${row}`);
    shelf.scale.set(width, board, depth);
    shelf.position.set(0, y + board * 0.5, 0);
    group.add(shelf);
    const lip = createMesh(shared.box, shared.walnutDark, `bookcase-lip-${row}`, false, true);
    lip.scale.set(width + 0.02, board * 0.42, 0.04);
    lip.position.set(0, y + board * 0.3, depth * 0.5 + 0.01);
    group.add(lip);
    shelfTops.push(y + board);
  }

  [-1, 1].forEach((side) => {
    const post = createMesh(shared.box, shared.walnutDark, `bookcase-post-${side}`);
    post.scale.set(postWidth, height, depth + 0.08);
    post.position.set(side * (width * 0.5 + postWidth * 0.5), height * 0.5 - 0.35, 0);
    group.add(post);
  });

  return { group, shelfTops, height, postWidth };
}
