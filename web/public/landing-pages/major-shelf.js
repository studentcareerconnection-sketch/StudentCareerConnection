// Scene for major-shelf.html — adapted from ThreeUI "Complete Shelf" (Working Volumes).
// What changed from the authored page:
//   • books come from data/programs.json: every major, A–Z, with Undecided in the middle;
//   • the shelf no longer wraps, and only the books near the reading position are built
//     (a small cache of rigs) so ninety volumes cost about as much as the original seven;
//   • interior page artwork is drawn when a book is opened rather than for every book;
//   • the markers are an A–Z index, and the detail panel adds/removes programs, with a
//     full major/minor chooser inside Undecided. Choices go to the planner store through
//     postMessage (see src/shelf/CompleteShelfLandingPage.tsx).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import {
  MAJOR_DEGREES,
  PALETTES,
  UNDECIDED_PALETTE,
  WARM_ROOM,
  applyOakFinish,
  bindRenderer,
  createBookRig,
  createMesh,
  ensureDetailTextures,
  ensureInteriorPages,
  makeBook,
  makeContactShadowTexture,
  setRigOpacity,
  shared,
  shortName
} from "./shelf-core.js";

const DATA_URL = new URL("../data/", location.href);
const STORE_KEY = "uci-planner";
const embedded = window.parent !== window;


let BOOKS = [];
let undecidedIndex = 0;
let programs = [];
let programsById = new Map();
let programIds = [];

const experience = document.querySelector("#experience");
const canvas = document.querySelector("#scene");
const loading = document.querySelector("#loading");
const staticFallback = document.querySelector("#static-fallback");
const fallbackStatus = document.querySelector("#fallback-status");
const fallbackGrid = document.querySelector("#fallback-grid");
const browseUi = document.querySelector("#browse-ui");
const detailPanel = document.querySelector("#detail-panel");
const selectionTitle = document.querySelector("#selection-title");
const selectionNote = document.querySelector("#selection-note");
const counter = document.querySelector("#counter");
const paletteLabel = document.querySelector("#palette-label");
const markers = document.querySelector("#markers");
const previousButton = document.querySelector("#previous");
const nextButton = document.querySelector("#next");
const inspectButton = document.querySelector("#inspect");
const closeButton = document.querySelector("#close-detail");
const resetButton = document.querySelector("#reset-view");
const toggleBookButton = document.querySelector("#toggle-book");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageLabel = document.querySelector("#page-label");
const pageCounter = document.querySelector("#page-counter");
const pageNavigation = document.querySelector("#page-navigation");
const detailMicrocopy = document.querySelector(".detail-controls .microcopy");
const detailEyebrow = document.querySelector("#detail-eyebrow");
const detailTitle = document.querySelector("#detail-title");
const detailDeck = document.querySelector("#detail-deck");
const detailBinding = document.querySelector("#detail-binding");
const detailFormat = document.querySelector("#detail-format");
const detailTheme = document.querySelector("#detail-theme");
const detailMotif = document.querySelector("#detail-motif");
const metaList = document.querySelector("#meta-list");
const programActions = document.querySelector("#program-actions");
const toggleMajorButton = document.querySelector("#toggle-major");
const pathStatus = document.querySelector("#path-status");
const pathChooser = document.querySelector("#path-chooser");
const pathChosen = document.querySelector("#path-chosen");
const pathTabs = [...document.querySelectorAll(".path-tabs button")];
const pathSearch = document.querySelector("#path-search");
const pathList = document.querySelector("#path-list");
const pathCount = document.querySelector("#path-count");
const pathContinue = document.querySelector("#path-continue");
const openPlannerButton = document.querySelector("#open-planner");
const myShelfButton = document.querySelector("#my-shelf");
const fallbackSetup = document.querySelector("#fallback-setup");
const liveRegion = document.querySelector("#live-region");
const pointerLabel = document.querySelector("#pointer-label");
const pointerLabelIndex = document.querySelector("#pointer-label-index");
const pointerLabelTitle = document.querySelector("#pointer-label-title");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = (value) => value * value * (3 - 2 * value);
const smootherstep = (value) => (
  value * value * value * (value * (value * 6 - 15) + 10)
);
const pad = (value) => String(value).padStart(2, "0");

let reducedMotion = reducedMotionQuery.matches;
let renderer;
let scene;
let camera;
let controls;
let environmentTarget;
let shelfStage;
const rigCache = new Map();
let hitTargets = [];
let rafId = 0;
let lastTime = performance.now();
let mode = "hero";
let transitionTime = 0;
let position = 0;
let targetPosition = 0;
let selectedIndex = -1;
let hoveredIndex = -1;
let wheelIdle = 0;
let focusReturnTarget = inspectButton;
let activeBook = null;
let readingOpen = false;
let detailBookHovered = false;
let currentSpread = 0;
let pointerDirty = false;
let suspended = false;
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;
let detailViewOffsetX = 0;
let currentViewOffsetX = 0;
let detailSafeWidth = viewWidth * 0.6;
let themeInitialized = false;
let themeMoving = false;
let chooserKind = "major";
let detailRequest = 0;

// Books within this many slots of the reading position are kept built; the cache
// holds a few more so stepping back and forth does not rebuild anything.
const RIG_RADIUS = 4;
const RIG_CACHE_LIMIT = 15;

const roomMaterials = {
  floor: null,
  wall: null,
  shelf: null,
  shelfDark: null,
  shadow: null
};
const roomLights = {
  hemisphere: null,
  key: null,
  softKey: null,
  fill: null,
  rim: null,
  backFill: null,
  spineRake: null,
  pageRake: null
};
const themeTargets = {
  floor: new THREE.Color(0xd8c8aa),
  wall: new THREE.Color(0xe9dfcb),
  shelf: new THREE.Color(0x4a2b1d),
  shelfDark: new THREE.Color(0x2a170f),
  shadow: new THREE.Color(0x2f1d13),
  fog: new THREE.Color(0xe9dfcb),
  hemisphere: new THREE.Color(0xfff8e8),
  hemisphereGround: new THREE.Color(0x5b4030),
  key: new THREE.Color(0xffe8c2),
  fill: new THREE.Color(0xd8e3e7),
  rim: new THREE.Color(0xd5a45e)
};

const pointer = {
  ndc: new THREE.Vector2(3, 3),
  clientX: 0,
  clientY: 0
};
const pageDrag = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  progress: 0,
  peakProgress: 0,
  committed: false,
  progressVelocity: 0,
  verticalBias: 0,
  lastProgress: 0,
  lastTime: 0,
  direction: 0,
  kind: null
};
const detailPress = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false,
  allowClick: false
};

const raycaster = new THREE.Raycaster();
const shelfCameraPosition = new THREE.Vector3();
const shelfCameraTarget = new THREE.Vector3();
const inspectPosition = new THREE.Vector3();
const inspectCameraPosition = new THREE.Vector3();
const inspectCameraTarget = new THREE.Vector3();
const transitionCameraTarget = new THREE.Vector3();
const openingBookPosition = new THREE.Vector3();
const openingBookQuaternion = new THREE.Quaternion();
const openingBookScale = new THREE.Vector3();
const openingMotionPosition = new THREE.Vector3();
const openingMotionQuaternion = new THREE.Quaternion();
const restingMotionPosition = new THREE.Vector3();
const restingMotionQuaternion = new THREE.Quaternion();
const openingCameraPosition = new THREE.Vector3();
const openingCameraTarget = new THREE.Vector3();
const openingShelfPosition = new THREE.Vector3();
const inspectShelfPosition = new THREE.Vector3(0, -4.2, -3);
const inspectBookQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.055, -0.14, 0)
);
const inspectBookScale = new THREE.Vector3();
const closingBookPosition = new THREE.Vector3();
const closingBookStartPosition = new THREE.Vector3();
const closingBookStartQuaternion = new THREE.Quaternion();
const closingBookStartScale = new THREE.Vector3();
const closingBookQuaternion = new THREE.Quaternion();
const closingBookScale = new THREE.Vector3(1.09, 1.09, 1.09);
const closingMotionPosition = new THREE.Vector3();
const closingMotionQuaternion = new THREE.Quaternion();
const closingCameraPosition = new THREE.Vector3();
const closingCameraTarget = new THREE.Vector3();
const closingShelfPosition = new THREE.Vector3();
const shelfRestPosition = new THREE.Vector3();
const shelfBoardTop = 0.47;
const spacing = 1.5;
const PAGINATED_LEAF_COUNT = 4;
const SPREAD_COUNT = PAGINATED_LEAF_COUNT + 1;
const PAGE_TURN_COMMIT_PROGRESS = 0.18;
const COVER_OPEN_COMMIT_PROGRESS = 0.16;
const COVER_CLOSE_COMMIT_PROGRESS = 0.2;
const DETAIL_TRANSITION_DURATION = 0.92;
const SHELF_TRANSITION_DURATION = 0.92;
let openingViewOffsetX = 0;
let closingViewOffsetX = 0;


/* ── Programs and the planner store ─────────────────────────────────────── */

function readStandaloneProgramIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return Array.isArray(saved?.state?.programIds) ? saved.state.programIds : [];
  } catch {
    return [];
  }
}

function writeStandaloneProgramIds(ids) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null") || { state: {}, version: 1 };
    saved.state = { ...saved.state, programIds: ids };
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch {
    // Storage can be unavailable; the choice still applies for this visit.
  }
}

function postToParent(message) {
  if (embedded) window.parent.postMessage(message, location.origin);
}

function goTo(path) {
  if (embedded) postToParent({ type: "uci-shelf:navigate", to: path });
  else location.href = new URL(`..${path}`, location.href).href;
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const data = event.data;
  if (data?.type === "uci-shelf:state" && Array.isArray(data.programIds)) {
    const next = data.programIds.filter((id) => typeof id === "string");
    // the planner echoes every change back; skip it so focus inside the chooser survives
    if (next.join("|") === programIds.join("|")) return;
    programIds = next;
    refreshPathUi();
  }
});

function setProgramIds(ids) {
  programIds = [...new Set(ids)];
  if (embedded) postToParent({ type: "uci-shelf:set-programs", programIds });
  else writeStandaloneProgramIds(programIds);
  refreshPathUi();
}

function toggleProgram(id) {
  if (programIds.includes(id)) {
    // Removing a major also removes its specialization.
    setProgramIds(programIds.filter((other) => other !== id && programsById.get(other)?.majorId !== id));
    return false;
  }
  setProgramIds([...programIds, id]);
  return true;
}

function setSpecialization(majorId, specializationId) {
  setProgramIds([
    ...programIds.filter((id) => programsById.get(id)?.majorId !== majorId),
    ...(specializationId ? [specializationId] : [])
  ]);
}

function chosenPrograms() {
  return programIds
    .map((id) => programsById.get(id))
    .filter((program) => program && program.degree !== "spec");
}

function pathSummary() {
  const chosen = chosenPrograms();
  const majors = chosen.filter((program) => MAJOR_DEGREES[program.degree]).length;
  const minors = chosen.filter((program) => program.degree === "minor").length;
  if (!majors && !minors) return "No programs chosen yet";
  const parts = [];
  if (majors) parts.push(`${majors} major${majors === 1 ? "" : "s"}`);
  if (minors) parts.push(`${minors} minor${minors === 1 ? "" : "s"}`);
  return `Your path · ${parts.join(" · ")}`;
}

function bookNote(book) {
  if (book.kind === "undecided") {
    const chosen = chosenPrograms();
    if (!chosen.length) return book.note;
    return `Your path: ${chosen.map((program) => shortName(program.name) + (program.degree === "minor" ? " (minor)" : "")).join(" · ")}`;
  }
  return programIds.includes(book.programId) ? `In your path · ${book.discipline}` : book.note;
}

function buildBooks(list) {
  const majors = list
    .filter((program) => MAJOR_DEGREES[program.degree])
    .map((program) => ({ program, title: shortName(program.name) }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.program.degree.localeCompare(b.program.degree));

  // Undecided sits in the middle of the shelf, at the letter boundary nearest the
  // centre so it never splits one letter of the index in two.
  const middle = Math.floor(majors.length / 2);
  let insertAt = middle;
  let bestDistance = Infinity;
  for (let index = 1; index < majors.length; index += 1) {
    if (majors[index].title[0].toUpperCase() === majors[index - 1].title[0].toUpperCase()) continue;
    const distance = Math.abs(index - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      insertAt = index;
    }
  }

  const books = majors.map(({ program, title }, index) => {
    const degree = MAJOR_DEGREES[program.degree];
    return makeBook({
      id: program.id,
      programId: program.id,
      kind: "major",
      title,
      roman: degree.short,
      discipline: degree.long,
      note: `${degree.long} · UC Irvine`,
      deck: `${title}, ${degree.short} — one of ${majors.length} undergraduate majors at UC Irvine. Open the book to leaf through it, then add it to your path as a major.`,
      theme: `${title} · ${degree.long}`,
      chapters: ["Lower division", "Upper division", "Electives"]
    }, 0, PALETTES[index % PALETTES.length], index * 3);
  });

  books.splice(insertAt, 0, makeBook({
    id: "undecided",
    programId: null,
    kind: "undecided",
    title: "Undecided",
    roman: "?",
    discipline: "Your path",
    note: "Open this book to choose your majors and minors.",
    deck: "Every path starts here. Choose one or more majors and any minors — you can come back and change them at any time.",
    theme: "Undecided · every path starts here",
    chapters: ["Explore", "Choose", "Plan"]
  }, 0, UNDECIDED_PALETTE, 3));

  books.forEach((book, index) => {
    book.index = index;
  });
  undecidedIndex = insertAt;
  return books;
}

/* ── Rig cache ──────────────────────────────────────────────────────────── */

function addRig(index) {
  const rig = createBookRig(BOOKS[index], index);
  rigCache.set(index, rig);
  shelfStage.add(rig.root);
  hitTargets.push(rig.hit);
  snapRigToShelfSlot(rig, index);
  // new books fade in rather than popping onto the shelf
  if (!reducedMotion) {
    setRigOpacity(rig, 0);
    rig.contactShadow.material.opacity = 0;
  }
  return rig;
}

function getRig(index) {
  return rigCache.get(index) || addRig(index);
}

function disposeRig(index) {
  const rig = rigCache.get(index);
  if (!rig) return;
  rigCache.delete(index);
  rig.root.parent?.remove(rig.root);
  hitTargets = hitTargets.filter((target) => target !== rig.hit);
  rig.root.traverse((object) => {
    if (object.geometry && object.geometry !== shared.box && object.geometry !== shared.plane) {
      object.geometry.dispose();
    }
  });
  rig.materials.forEach((material) => material.dispose());
  rig.ownedTextures.forEach((texture) => texture.dispose());
}

// Builds missing books nearest the reading position first, at most `budget` per
// call so a fast scroll spreads the work over frames instead of stalling one.
function ensureRigs(budget = 1, radius = RIG_RADIUS) {
  const center = clamp(Math.round(position), 0, BOOKS.length - 1);
  let built = 0;
  for (let distance = 0; distance <= radius && built < budget; distance += 1) {
    const candidates = distance === 0 ? [center] : [center - distance, center + distance];
    for (const index of candidates) {
      if (built >= budget) break;
      if (index < 0 || index >= BOOKS.length || rigCache.has(index)) continue;
      addRig(index);
      built += 1;
    }
  }

  if (mode === "hero" && rigCache.size > RIG_CACHE_LIMIT) {
    const farthest = [...rigCache.keys()]
      .filter((index) => Math.abs(index - center) > RIG_RADIUS)
      .sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    for (const index of farthest) {
      if (rigCache.size <= RIG_CACHE_LIMIT) break;
      disposeRig(index);
    }
  }
  return built;
}

function configureResponsiveTargets() {
  const narrow = viewWidth < 820;
  shelfCameraPosition.set(0, narrow ? 2.02 : 1.92, narrow ? 8.7 : 8.1);
  shelfCameraTarget.set(0, narrow ? 1.57 : 1.55, 0);
  inspectPosition.set(narrow ? 0 : -2.25, narrow ? 2.3 : 1.56, narrow ? 0.15 : 0);
  inspectCameraPosition.set(narrow ? 0 : -0.52, narrow ? 2.46 : 1.78, narrow ? 5.7 : 5.25);
  inspectCameraTarget.copy(inspectPosition);

  if (narrow) {
    detailViewOffsetX = 0;
    detailSafeWidth = viewWidth;
    return;
  }

  const panelBounds = detailPanel.getBoundingClientRect();
  const panelLeft = panelBounds.left > 0 ? panelBounds.left : viewWidth * 0.64;
  const gutter = clamp(viewWidth * 0.035, 32, 56);
  detailSafeWidth = Math.max(viewWidth * 0.42, panelLeft - gutter);
  const wideLayoutProgress = clamp((viewWidth - 820) / 620, 0, 1);
  const bookCenterRatio = THREE.MathUtils.lerp(0.55, 0.615, wideLayoutProgress);
  const desiredBookCenter = detailSafeWidth * bookCenterRatio;
  detailViewOffsetX = Math.max(0, viewWidth * 0.5 - desiredBookCenter);
}

function getInspectScale() {
  if (!activeBook || viewWidth < 820) return 0.82;
  const distance = Math.abs(inspectCameraPosition.z - inspectPosition.z);
  const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const pixelsPerWorld = viewHeight / Math.max(worldHeight, 0.001);
  const estimatedBookWidth = activeBook.base.width * pixelsPerWorld * 1.16;
  const scaleForSafeWidth = (detailSafeWidth * 0.72) / Math.max(estimatedBookWidth, 1);
  return clamp(scaleForSafeWidth, 0.9, 1.32);
}

function applyDetailViewOffset() {
  if (Math.abs(currentViewOffsetX) < 0.5) {
    camera.clearViewOffset();
    return;
  }
  camera.setViewOffset(
    viewWidth,
    viewHeight,
    currentViewOffsetX,
    0,
    viewWidth,
    viewHeight
  );
}

function addRoom() {
  const floor = createMesh(shared.plane, new THREE.MeshStandardMaterial({
    color: 0xd8c8aa,
    roughness: 0.92,
    metalness: 0
  }), "paper-floor", false, true);
  floor.scale.set(30, 20, 1);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -0.02;
  scene.add(floor);

  const back = createMesh(shared.plane, new THREE.MeshStandardMaterial({
    color: 0xe9dfcb,
    roughness: 1,
    metalness: 0
  }), "paper-backdrop", false, true);
  back.scale.set(28, 14, 1);
  back.position.set(0, 5.5, -3.3);
  scene.add(back);

  const shelf = createMesh(shared.box, shared.walnut, "walnut-shelf");
  shelf.scale.set(17, 0.28, 1.08);
  shelf.position.set(0, 0.33, -0.03);
  shelfStage.add(shelf);

  const shelfLip = createMesh(shared.box, shared.walnutDark, "walnut-shelf-lip");
  shelfLip.scale.set(17.05, 0.075, 1.14);
  shelfLip.position.set(0, 0.205, 0.02);
  shelfStage.add(shelfLip);

  const backRail = createMesh(shared.box, shared.walnut, "walnut-back-rail");
  backRail.scale.set(17, 0.17, 0.2);
  backRail.position.set(0, 0.68, -0.52);
  shelfStage.add(backRail);

  [-7.65, 7.65].forEach((x, index) => {
    const upright = createMesh(shared.box, shared.walnutDark, `shelf-upright-${index}`);
    upright.scale.set(0.2, 3.8, 0.72);
    upright.position.set(x, 2.05, -0.28);
    shelfStage.add(upright);
  });

  const shadowStrip = createMesh(shared.plane, new THREE.MeshBasicMaterial({
    color: 0x2f1d13,
    alphaMap: makeContactShadowTexture(),
    transparent: true,
    opacity: 0.22,
    depthWrite: false
  }), "shelf-contact-shadow", false, false);
  shadowStrip.scale.set(16, 0.85, 1);
  shadowStrip.rotation.x = -Math.PI * 0.5;
  shadowStrip.position.set(0, 0.49, 0.06);
  shelfStage.add(shadowStrip);

  roomMaterials.floor = floor.material;
  roomMaterials.wall = back.material;
  roomMaterials.shelf = shared.walnut;
  roomMaterials.shelfDark = shared.walnutDark;
  roomMaterials.shadow = shadowStrip.material;
}

function addLights() {
  roomLights.hemisphere = new THREE.HemisphereLight(0xfff8e8, 0x5b4030, 0.56);
  scene.add(roomLights.hemisphere);

  const key = new THREE.DirectionalLight(0xffe8c2, 1.42);
  key.name = "shadow-key";
  key.position.set(-4.6, 7.4, 5.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -1.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 18;
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 3.5;
  scene.add(key);
  roomLights.key = key;

  const softKey = new THREE.RectAreaLight(0xffe8c2, 5.4, 4.8, 5.6);
  softKey.name = "cloth-softbox";
  softKey.position.set(-3.2, 5.5, 4.6);
  softKey.lookAt(0, 1.45, 0);
  scene.add(softKey);
  roomLights.softKey = softKey;

  const fill = new THREE.DirectionalLight(0xd8e3e7, 0.3);
  fill.name = "cool-fill";
  fill.position.set(5.5, 3.6, 4.2);
  scene.add(fill);
  roomLights.fill = fill;

  const rim = new THREE.RectAreaLight(0xd5a45e, 3.45, 1.6, 4.8);
  rim.name = "foil-rake";
  rim.position.set(3.8, 3.6, -2.1);
  rim.lookAt(-0.2, 1.5, 0);
  scene.add(rim);
  roomLights.rim = rim;

  // The authored rig had three more area lights here (back softbox, spine rake,
  // page-edge rake). Each RectAreaLight is costly in every physical-material
  // fragment, so these become directional lights from the same positions and
  // aims: they keep the shaping, only the soft-box highlight goes.
  const addRake = (name, color, intensity, from, to) => {
    const light = new THREE.DirectionalLight(color, intensity);
    light.name = name;
    light.position.set(...from);
    light.target.position.set(...to);
    scene.add(light, light.target);
    return light;
  };
  roomLights.backFill = addRake("back-cover-fill", 0xd8e3e7, 0.4, [-1.8, 2.9, -4.5], [-0.1, 1.45, 0]);
  roomLights.spineRake = addRake("spine-rake", 0xffe8c2, 0.32, [-4.6, 3.2, 1.1], [-0.55, 1.5, 0]);
  roomLights.pageRake = addRake("page-edge-rake", 0xfff7e7, 0.36, [4.2, 4.8, 3.1], [0.65, 1.55, 0]);
}

/* ── A–Z index ──────────────────────────────────────────────────────────── */

let markerGroups = [];

function buildMarkers() {
  markerGroups = [];
  BOOKS.forEach((book, index) => {
    const key = book.kind === "undecided" ? "✦" : book.title[0].toUpperCase();
    const last = markerGroups[markerGroups.length - 1];
    if (last && last.key === key) last.end = index;
    else markerGroups.push({ key, start: index, end: index });
  });

  markerGroups.forEach((group) => {
    const button = document.createElement("button");
    const undecided = group.key === "✦";
    button.className = undecided ? "marker marker--undecided" : "marker";
    button.type = "button";
    button.role = "tab";
    button.textContent = group.key;
    button.setAttribute(
      "aria-label",
      undecided ? "Jump to Undecided" : `Jump to majors starting with ${group.key}`
    );
    button.addEventListener("click", () => selectIndex(group.start, button));
    group.button = button;
    markers.append(button);
  });
}

function updateMarkers() {
  markerGroups.forEach((group) => {
    const current = selectedIndex >= group.start && selectedIndex <= group.end;
    group.button.setAttribute("aria-current", current ? "true" : "false");
    group.button.setAttribute("aria-selected", current ? "true" : "false");
    group.button.tabIndex = current ? 0 : -1;
  });
}

function setThemeColorsImmediately() {
  roomMaterials.floor?.color.copy(themeTargets.floor);
  roomMaterials.wall?.color.copy(themeTargets.wall);
  roomMaterials.shelf?.color.copy(themeTargets.shelf);
  roomMaterials.shelfDark?.color.copy(themeTargets.shelfDark);
  roomMaterials.shadow?.color.copy(themeTargets.shadow);
  scene?.fog?.color.copy(themeTargets.fog);
  roomLights.hemisphere?.color.copy(themeTargets.hemisphere);
  roomLights.hemisphere?.groundColor.copy(themeTargets.hemisphereGround);
  roomLights.key?.color.copy(themeTargets.key);
  roomLights.softKey?.color.copy(themeTargets.key);
  roomLights.fill?.color.copy(themeTargets.fill);
  roomLights.rim?.color.copy(themeTargets.rim);
  roomLights.backFill?.color.copy(themeTargets.fill);
  roomLights.spineRake?.color.copy(themeTargets.key);
  roomLights.pageRake?.color.copy(themeTargets.hemisphere);
  themeMoving = false;
}

// The room is the same warm library for every book (WARM_ROOM); a book only
// lends the page its accent and tints the foil rake light.
function applyBookTheme(book) {
  document.documentElement.style.setProperty(
    "--accent",
    book.kind === "undecided" ? "var(--primary)" : book.color
  );

  themeTargets.floor.set(WARM_ROOM.floor);
  themeTargets.wall.set(WARM_ROOM.wall);
  themeTargets.shelf.set(WARM_ROOM.shelf);
  themeTargets.shelfDark.set(WARM_ROOM.shelfDark);
  themeTargets.shadow.set(WARM_ROOM.shadow);
  themeTargets.fog.set(WARM_ROOM.wall);
  themeTargets.hemisphere.set(WARM_ROOM.hemisphere);
  themeTargets.hemisphereGround.set(WARM_ROOM.hemisphereGround);
  themeTargets.key.set(WARM_ROOM.key);
  themeTargets.fill.set(WARM_ROOM.fill);
  themeTargets.rim.set(book.foil).lerp(new THREE.Color(WARM_ROOM.rim), 0.5);

  if (!themeInitialized || reducedMotion) {
    themeInitialized = true;
    setThemeColorsImmediately();
  } else {
    themeMoving = true;
    requestFrame();
  }
}

function updateTheme(delta) {
  if (!themeMoving) return false;
  const amount = 1 - Math.exp(-delta * 5.5);
  let largestGap = 0;
  const easeColor = (current, target) => {
    if (!current) return;
    const redGap = current.r - target.r;
    const greenGap = current.g - target.g;
    const blueGap = current.b - target.b;
    largestGap = Math.max(
      largestGap,
      redGap * redGap + greenGap * greenGap + blueGap * blueGap
    );
    current.lerp(target, amount);
  };

  easeColor(roomMaterials.floor?.color, themeTargets.floor);
  easeColor(roomMaterials.wall?.color, themeTargets.wall);
  easeColor(roomMaterials.shelf?.color, themeTargets.shelf);
  easeColor(roomMaterials.shelfDark?.color, themeTargets.shelfDark);
  easeColor(roomMaterials.shadow?.color, themeTargets.shadow);
  easeColor(scene?.fog?.color, themeTargets.fog);
  easeColor(roomLights.hemisphere?.color, themeTargets.hemisphere);
  easeColor(roomLights.hemisphere?.groundColor, themeTargets.hemisphereGround);
  easeColor(roomLights.key?.color, themeTargets.key);
  easeColor(roomLights.softKey?.color, themeTargets.key);
  easeColor(roomLights.fill?.color, themeTargets.fill);
  easeColor(roomLights.rim?.color, themeTargets.rim);
  easeColor(roomLights.backFill?.color, themeTargets.fill);
  easeColor(roomLights.spineRake?.color, themeTargets.key);
  easeColor(roomLights.pageRake?.color, themeTargets.hemisphere);

  if (largestGap < 0.0000025) {
    setThemeColorsImmediately();
  }
  return themeMoving;
}

function updateSelection(index, announce = false) {
  const nextIndex = clamp(index, 0, BOOKS.length - 1);
  if (nextIndex === selectedIndex && !announce) return;
  selectedIndex = nextIndex;
  const book = BOOKS[selectedIndex];
  selectionTitle.textContent = book.title;
  selectionNote.textContent = bookNote(book);
  counter.textContent = `${pad(selectedIndex + 1)} / ${pad(BOOKS.length)}`;
  inspectButton.setAttribute("aria-label", `Open ${book.title}`);
  previousButton.disabled = selectedIndex === 0;
  nextButton.disabled = selectedIndex === BOOKS.length - 1;
  applyBookTheme(book);
  updateMarkers();

  if (announce) {
    liveRegion.textContent = `${book.title}, ${selectedIndex + 1} of ${BOOKS.length}. ${bookNote(book)}`;
  }
}

/* ── Detail panel: a major, or the Undecided chooser ────────────────────── */

function formatCatalogYear(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value || "");
  return match ? `${match[1]}–${match[3]}` : value || "—";
}

function populateDetail(book) {
  const undecided = book.kind === "undecided";
  detailEyebrow.textContent = undecided
    ? "Undecided · Your path"
    : `${book.roman} · ${book.discipline}`;
  detailTitle.textContent = book.title;
  detailTitle.classList.toggle("is-long", book.title.length > 14);
  detailDeck.textContent = book.deck;
  detailPanel.classList.toggle("is-chooser", undecided);
  pathChooser.hidden = !undecided;
  programActions.hidden = undecided;
  metaList.hidden = undecided;
  pageNavigation.hidden = undecided;

  if (undecided) {
    pathSearch.value = "";
    renderChooserList();
    refreshPathUi();
    return;
  }

  const summary = programsById.get(book.programId);
  detailBinding.textContent = book.discipline;
  detailFormat.textContent = "…";
  detailTheme.textContent = "…";
  const specializations = summary?.specializations?.length ?? 0;
  detailMotif.textContent = specializations
    ? `${specializations}${summary.specializationRequired ? " · one required" : " optional"}`
    : "None";
  refreshPathUi();

  const request = ++detailRequest;
  fetch(new URL(`programs/${encodeURIComponent(book.programId)}.json`, DATA_URL))
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
    .then((program) => {
      if (request !== detailRequest) return;
      detailFormat.textContent = formatCatalogYear(program.catalogYear);
      const groups = program.requirements?.length ?? 0;
      detailTheme.textContent = `${groups} requirement group${groups === 1 ? "" : "s"}`;
    })
    .catch(() => {
      if (request !== detailRequest) return;
      detailFormat.textContent = "—";
      detailTheme.textContent = "Unavailable";
    });
}

const CLOSE_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"></path></svg>';
const TICK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5"></path></svg>';

function degreeLabel(program) {
  return program.degree === "minor" ? "Minor" : MAJOR_DEGREES[program.degree]?.short ?? program.degree;
}

function renderChosen() {
  pathChosen.replaceChildren();
  const chosen = chosenPrograms();
  if (!chosen.length) {
    const empty = document.createElement("p");
    empty.className = "path-empty";
    empty.textContent = "Nothing chosen yet — pick a major below.";
    pathChosen.append(empty);
    return;
  }

  chosen.forEach((program) => {
    const chip = document.createElement("div");
    chip.className = "path-chip";
    const label = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = shortName(program.name);
    const kind = document.createElement("small");
    kind.textContent = degreeLabel(program);
    label.append(name, kind);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.innerHTML = CLOSE_ICON;
    remove.setAttribute("aria-label", `Remove ${program.name}`);
    remove.addEventListener("click", () => {
      toggleProgram(program.id);
      liveRegion.textContent = `${program.name} removed from your path.`;
      pathSearch.focus({ preventScroll: true });
    });
    chip.append(label, remove);

    const specializations = (program.specializations ?? [])
      .map((id) => programsById.get(id))
      .filter(Boolean);
    if (specializations.length) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Specialization for ${program.name}`);
      const none = document.createElement("option");
      none.value = "";
      none.textContent = program.specializationRequired
        ? "Choose a specialization (required)"
        : "No specialization";
      select.append(none);
      specializations.forEach((specialization) => {
        const option = document.createElement("option");
        option.value = specialization.id;
        option.textContent = specialization.name;
        select.append(option);
      });
      const current = programIds.find((id) => programsById.get(id)?.majorId === program.id) ?? "";
      select.value = current;
      select.addEventListener("change", () => setSpecialization(program.id, select.value));
      chip.classList.toggle("needs-attention", Boolean(program.specializationRequired && !current));
      chip.append(select);
    }
    pathChosen.append(chip);
  });
}

function renderChooserList() {
  const query = pathSearch.value.trim().toLowerCase();
  const kind = chooserKind;
  pathSearch.placeholder = kind === "major" ? "Search majors…" : "Search minors…";
  pathTabs.forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.kind === kind));
  });

  const options = programs
    .filter((program) => (kind === "major" ? MAJOR_DEGREES[program.degree] : program.degree === "minor"))
    .filter((program) => !query || program.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  pathList.replaceChildren();
  if (!options.length) {
    const empty = document.createElement("li");
    empty.className = "path-empty";
    empty.textContent = `No ${kind}s match “${pathSearch.value.trim()}”.`;
    pathList.append(empty);
    return;
  }

  options.forEach((program) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "path-option";
    button.dataset.id = program.id;
    button.setAttribute("aria-pressed", String(programIds.includes(program.id)));
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.innerHTML = TICK_ICON;
    const name = document.createElement("span");
    name.textContent = shortName(program.name);
    const degree = document.createElement("small");
    degree.textContent = degreeLabel(program);
    button.append(tick, name, degree);
    button.addEventListener("click", () => {
      const added = toggleProgram(program.id);
      liveRegion.textContent = `${program.name} ${added ? "added to" : "removed from"} your path.`;
    });
    item.append(button);
    pathList.append(item);
  });
}

function refreshPathUi() {
  paletteLabel.textContent = pathSummary();
  if (selectedIndex >= 0 && BOOKS[selectedIndex]) {
    selectionNote.textContent = bookNote(BOOKS[selectedIndex]);
  }

  const book = activeBook?.data;
  if (book && book.kind === "major") {
    const program = programsById.get(book.programId);
    const added = programIds.includes(book.programId);
    toggleMajorButton.textContent = added ? "Added to your path" : "Add as major";
    toggleMajorButton.setAttribute("aria-pressed", String(added));
    pathStatus.textContent = added
      ? program?.specializationRequired && !programIds.some((id) => programsById.get(id)?.majorId === book.programId)
        ? "Pick a specialization in Undecided"
        : pathSummary()
      : pathSummary();
  }

  if (book && book.kind === "undecided") {
    renderChosen();
    pathList.querySelectorAll(".path-option").forEach((button) => {
      button.setAttribute("aria-pressed", String(programIds.includes(button.dataset.id)));
    });
    const chosen = chosenPrograms();
    pathCount.textContent = chosen.length ? pathSummary() : "";
    pathContinue.textContent = chosen.length ? "Continue to roadmap" : "Skip for now";
  }
}

function getSpreadLabels(book) {
  return [
    "Title page",
    `${book.chapters[0]} · Plate`,
    `${book.chapters[1]} · Notes`,
    `${book.chapters[2]} · System`,
    "Colophon"
  ];
}

function updatePageControls(announce = false) {
  const book = activeBook?.data || BOOKS[selectedIndex];
  const labels = getSpreadLabels(book);
  const interactionLocked = mode !== "detail" || !readingOpen;
  const previousDisabled = interactionLocked || currentSpread === 0;
  const nextDisabled = interactionLocked || currentSpread === SPREAD_COUNT - 1;

  previousPageButton.disabled = previousDisabled;
  nextPageButton.disabled = nextDisabled;
  pageLabel.textContent = readingOpen ? labels[currentSpread] : "Closed";
  pageCounter.textContent = readingOpen
    ? `${pad(currentSpread + 1)} / ${pad(SPREAD_COUNT)}`
    : "Click book to open";
  toggleBookButton.textContent = readingOpen ? "Close book" : "Open book";
  toggleBookButton.setAttribute("aria-pressed", String(readingOpen));
  detailMicrocopy.textContent = readingOpen
    ? "Drag pages · Drag cover to close · Background to orbit"
    : "Drag cover or click once to open · Background to orbit";
  previousPageButton.setAttribute(
    "aria-label",
    previousDisabled
      ? "Previous sample page"
      : `Previous sample page: ${labels[currentSpread - 1]}`
  );
  nextPageButton.setAttribute(
    "aria-label",
    nextDisabled
      ? "Next sample page"
      : `Next sample page: ${labels[currentSpread + 1]}`
  );

  if (announce && activeBook && readingOpen) {
    liveRegion.textContent = `Page ${currentSpread + 1} of ${SPREAD_COUNT}: ${labels[currentSpread]}.`;
  }
}

function setReadingOpen(open, announce = true) {
  if (mode !== "detail" || readingOpen === open) return;
  cancelPageDrag();
  readingOpen = open;
  if (!readingOpen) currentSpread = 0;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  updatePageControls(false);
  pointerDirty = true;

  if (announce && activeBook) {
    liveRegion.textContent = readingOpen
      ? `${activeBook.data.title} opened to its title page. Drag a page horizontally or use the arrow controls to read.`
      : `${activeBook.data.title} closed. Drag the cover, click the book, or use Open book to begin reading.`;
  }
  requestFrame();
}

function turnPage(direction) {
  if (mode !== "detail" || !readingOpen) return;
  const nextSpread = clamp(
    currentSpread + direction,
    0,
    SPREAD_COUNT - 1
  );
  if (nextSpread === currentSpread) return;
  currentSpread = nextSpread;
  updatePageControls(true);
  requestFrame();
}

function updateFlexiblePage(
  pagePivot,
  targetCurve,
  delta,
  immediate = false,
  targetTwist = 0
) {
  const flex = pagePivot.userData.flex;
  if (!flex) return;
  const settleImmediately = immediate || reducedMotion;
  const step = Math.min(delta, 0.033);
  let nextCurve = targetCurve;
  let nextTwist = targetTwist;

  if (settleImmediately) {
    flex.curveVelocity = 0;
    flex.twistVelocity = 0;
  } else {
    const curveAcceleration = (
      (targetCurve - flex.curve) * 178
      - flex.curveVelocity * 19
    );
    const twistAcceleration = (
      (targetTwist - flex.twist) * 210
      - flex.twistVelocity * 21
    );
    flex.curveVelocity = clamp(
      flex.curveVelocity + curveAcceleration * step,
      -1.8,
      1.8
    );
    flex.twistVelocity = clamp(
      flex.twistVelocity + twistAcceleration * step,
      -1.6,
      1.6
    );
    nextCurve = clamp(
      flex.curve + flex.curveVelocity * step,
      -0.025,
      0.19
    );
    nextTwist = clamp(
      flex.twist + flex.twistVelocity * step,
      -0.12,
      0.12
    );

    if (
      Math.abs(targetCurve - nextCurve) < 0.00002
      && Math.abs(flex.curveVelocity) < 0.0008
    ) {
      nextCurve = targetCurve;
      flex.curveVelocity = 0;
    }
    if (
      Math.abs(targetTwist - nextTwist) < 0.00002
      && Math.abs(flex.twistVelocity) < 0.0008
    ) {
      nextTwist = targetTwist;
      flex.twistVelocity = 0;
    }
  }

  if (
    !settleImmediately
    && Math.abs(nextCurve - flex.curve) < 0.00001
    && Math.abs(targetCurve - nextCurve) < 0.00001
    && Math.abs(nextTwist - flex.twist) < 0.00001
    && Math.abs(targetTwist - nextTwist) < 0.00001
  ) return;

  flex.curve = nextCurve;
  flex.twist = nextTwist;
  flex.surfaces.forEach((surface) => {
    const { position, base, direction, geometry } = surface;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const offset = vertex * 3;
      const x = base[offset];
      const y = base[offset + 1];
      const u = x + 0.5;
      const mappedU = direction > 0 ? u : 1 - u;
      const arch = Math.sin(Math.PI * mappedU);
      const freeEdgeLift = mappedU * mappedU * 0.16;
      const shape = arch * 0.84 + freeEdgeLift;
      const diagonalTwist = (
        nextTwist
        * y
        * Math.pow(mappedU, 1.35)
      );
      const softRipple = (
        nextTwist
        * Math.sin(mappedU * Math.PI * 2)
        * (1 - Math.min(1, Math.abs(y) * 1.65))
        * 0.09
      );
      const z = (
        nextCurve * shape * (1 + y * 0.14)
        + diagonalTwist
        + softRipple
      ) * direction;
      position.setXYZ(vertex, x, y, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  });
}

function updatePaginatedBook(rig, delta, openAmount = 1) {
  const amount = clamp(openAmount, 0, 1);
  const speed = reducedMotion ? 1000 : 10.5;
  const hoverCrack = (
    mode === "detail"
    && !readingOpen
    && detailBookHovered
    && !reducedMotion
  ) ? -0.16 : 0;
  const coverTarget = amount > 0
    ? (-Math.PI + 0.055) * amount
    : hoverCrack;

  rig.frontPivot.rotation.y = damp(
    rig.frontPivot.rotation.y,
    coverTarget,
    speed,
    delta
  );

  rig.pagePivots.forEach((pagePivot, pageIndex) => {
    const leafOrder = rig.pagePivots.length - 1 - pageIndex;
    let pageTarget = 0;
    let positionTarget = pagePivot.userData.restZ;
    let pageTwistTarget = 0;
    let dragCurveBoost = 0;
    let flexTwistTarget = 0;

    if (leafOrder < PAGINATED_LEAF_COUNT) {
      const isTurned = leafOrder < currentSpread;
      const unturnedTarget = -0.038 + leafOrder * 0.008;
      const turnedTarget = -Math.PI + 0.085 + leafOrder * 0.014;
      pageTarget = isTurned ? turnedTarget : unturnedTarget;
      positionTarget = isTurned
        ? pagePivot.userData.turnedZ
        : pagePivot.userData.restZ;

      if (pageDrag.active && pageDrag.direction !== 0) {
        const dragLeafOrder = pageDrag.direction > 0
          ? currentSpread
          : currentSpread - 1;
        if (leafOrder === dragLeafOrder) {
          const dragProgress = smoothstep(pageDrag.progress);
          const dragEnvelope = Math.sin(Math.PI * dragProgress);
          const speedResponse = clamp(
            Math.abs(pageDrag.progressVelocity) / 5.5,
            0,
            1
          );
          const signedSpeed = clamp(
            pageDrag.progressVelocity / 5.5,
            -1,
            1
          );
          pageTarget = pageDrag.direction > 0
            ? lerp(unturnedTarget, turnedTarget, dragProgress)
            : lerp(turnedTarget, unturnedTarget, dragProgress);
          positionTarget = pageDrag.direction > 0
            ? lerp(pagePivot.userData.restZ, pagePivot.userData.turnedZ, dragProgress)
            : lerp(pagePivot.userData.turnedZ, pagePivot.userData.restZ, dragProgress);
          pageTwistTarget = pageDrag.direction
            * dragEnvelope
            * (0.014 + pageDrag.verticalBias * 0.026);
          dragCurveBoost = dragEnvelope * (
            0.032
            + speedResponse * 0.064
          );
          flexTwistTarget = dragEnvelope * (
            pageDrag.verticalBias * 0.08
            + signedSpeed * pageDrag.direction * 0.03
          );
        }
      }

      pagePivot.position.z = damp(
        pagePivot.position.z,
        pagePivot.userData.restZ
          + (positionTarget - pagePivot.userData.restZ) * amount,
        speed,
        delta
      );
    } else {
      pageTarget = -0.006 + (leafOrder - PAGINATED_LEAF_COUNT) * 0.003;
      pagePivot.position.z = damp(
        pagePivot.position.z,
        pagePivot.userData.restZ,
        speed,
        delta
      );
    }

    pagePivot.rotation.y = damp(
      pagePivot.rotation.y,
      pageTarget * amount,
      speed,
      delta
    );
    pagePivot.rotation.z = damp(
      pagePivot.rotation.z,
      pageTwistTarget * amount,
      speed,
      delta
    );
    const turnProgress = clamp(
      Math.abs(pagePivot.rotation.y) / Math.PI,
      0,
      1
    );
    const curveTarget = amount > 0
      ? amount * (
          0.004
          + Math.sin(Math.PI * turnProgress) * 0.082
          + dragCurveBoost
        )
      : 0;
    updateFlexiblePage(
      pagePivot,
      curveTarget,
      delta,
      false,
      flexTwistTarget * amount
    );
  });
}

function selectIndex(index, origin) {
  if (mode !== "hero") return;
  const nextIndex = clamp(index, 0, BOOKS.length - 1);
  targetPosition = nextIndex;
  focusReturnTarget = origin;
  updateSelection(nextIndex, true);
  requestFrame();
}

function navigate(direction, origin) {
  if (mode !== "hero") return;
  targetPosition = clamp(Math.round(targetPosition) + direction, 0, BOOKS.length - 1);
  focusReturnTarget = origin;
  updateSelection(Math.round(targetPosition), true);
  requestFrame();
}

function alignShelfToSelection() {
  targetPosition = selectedIndex;
  position = targetPosition;
}

function snapRigToShelfSlot(rig, index) {
  const offset = index - position;
  const distance = Math.abs(offset);
  const focus = 1 - clamp(distance, 0, 1);
  const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
  const opacity = 1 - smoothstep(fadeProgress);

  rig.root.position.set(
    offset * spacing,
    shelfBoardTop + rig.base.height * 0.5 + focus * 0.15,
    0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07
  );
  rig.root.rotation.set(0, -offset * 0.105, -offset * 0.018);
  rig.root.scale.setScalar(1 + focus * 0.09);
  rig.motion.position.y = 0;
  rig.motion.rotation.set(0, 0, 0);
  rig.frontPivot.rotation.y = 0;
  rig.pagePivots.forEach((pagePivot) => {
    pagePivot.rotation.y = 0;
    pagePivot.rotation.z = 0;
    pagePivot.position.z = pagePivot.userData.restZ;
    updateFlexiblePage(pagePivot, 0, 0, true);
  });
  setRigOpacity(rig, opacity);
  rig.root.visible = opacity > 0.004;
  rig.contactShadow.visible = true;
  rig.contactShadow.material.opacity = opacity * 0.24;
  rig.hit.visible = opacity > 0.12;
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;
  pointer.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerDirty = true;
}

function updateHover() {
  pointerDirty = false;
  if (mode === "detail" && activeBook) {
    setHovered(-1);
    if (readingOpen) {
      detailBookHovered = false;
      canvas.classList.remove("has-closed-book-hover");
      canvas.classList.toggle(
        "has-page-hover",
        pageDrag.active
          || Boolean(pageSurfaceAtPointer())
          || Boolean(coverSurfaceAtPointer())
      );
    } else {
      detailBookHovered = Boolean(coverSurfaceAtPointer());
      canvas.classList.remove("has-page-hover");
      canvas.classList.toggle(
        "has-closed-book-hover",
        detailBookHovered
      );
    }
    return;
  }
  detailBookHovered = false;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  if (mode !== "hero") {
    setHovered(-1);
    return;
  }
  setHovered(bookIndexAtPointer());
}

function bookIndexAtPointer() {
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(hitTargets.filter((target) => target.visible), false);
  return hits.length ? hits[0].object.userData.index : -1;
}

function activeBookAtPointer() {
  if (mode !== "detail" || !activeBook) return false;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  return raycaster.intersectObject(activeBook.hit, false).length > 0;
}

function pageSurfaceAtPointer() {
  if (mode !== "detail" || !activeBook || !readingOpen) return null;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObjects(
    activeBook.pageGestureSurfaces,
    false
  );
  return hits.length ? hits[0].object : null;
}

function coverSurfaceAtPointer() {
  if (
    mode !== "detail"
    || !activeBook
    || currentSpread !== 0
  ) return null;
  activeBook.root.updateWorldMatrix(true, true);
  raycaster.setFromCamera(pointer.ndc, camera);
  const hits = raycaster.intersectObject(activeBook.frontCover, false);
  return hits.length ? hits[0].object : null;
}

function resetPageDrag() {
  const capturedPointerId = pageDrag.pointerId;
  pageDrag.active = false;
  pageDrag.pointerId = null;
  pageDrag.progress = 0;
  pageDrag.peakProgress = 0;
  pageDrag.committed = false;
  pageDrag.progressVelocity = 0;
  pageDrag.verticalBias = 0;
  pageDrag.lastProgress = 0;
  pageDrag.lastTime = 0;
  pageDrag.direction = 0;
  pageDrag.kind = null;
  canvas.classList.remove("is-page-dragging");
  controls.enabled = mode === "detail";
  if (
    capturedPointerId !== null
    && canvas.hasPointerCapture?.(capturedPointerId)
  ) {
    canvas.releasePointerCapture(capturedPointerId);
  }
}

function applyPageReleaseImpulse(turnDirection) {
  if (!activeBook || turnDirection === 0) return;
  const leafOrder = turnDirection > 0
    ? currentSpread
    : currentSpread - 1;
  const pageIndex = activeBook.pagePivots.length - 1 - leafOrder;
  const pagePivot = activeBook.pagePivots[pageIndex];
  const flex = pagePivot?.userData.flex;
  if (!flex) return;

  const speedResponse = clamp(
    Math.abs(pageDrag.progressVelocity) / 5.5,
    0.12,
    1
  );
  flex.curveVelocity = clamp(
    flex.curveVelocity + speedResponse * 0.46,
    -1.8,
    1.8
  );
  flex.twistVelocity = clamp(
    flex.twistVelocity
      + pageDrag.verticalBias * 0.38
      + clamp(
          pageDrag.progressVelocity / 5.5,
          -1,
          1
        ) * turnDirection * 0.14,
    -1.6,
    1.6
  );
}

function settlePageDrag(commitLatchedGesture = false) {
  if (!pageDrag.active) return false;
  const turnDirection = pageDrag.direction;
  const shouldCloseCover = commitLatchedGesture
    && pageDrag.kind === "cover-close"
    && pageDrag.committed;
  const shouldOpenCover = commitLatchedGesture
    && pageDrag.kind === "cover-open"
    && pageDrag.committed;
  const shouldTurnPage = commitLatchedGesture
    && pageDrag.kind === "page"
    && pageDrag.committed
    && turnDirection !== 0;
  if (shouldTurnPage) {
    applyPageReleaseImpulse(turnDirection);
  }
  resetPageDrag();
  if (shouldCloseCover) {
    setReadingOpen(false);
  } else if (shouldOpenCover) {
    setReadingOpen(true);
  } else if (shouldTurnPage) {
    turnPage(turnDirection);
  } else {
    requestFrame();
  }
  return shouldCloseCover || shouldOpenCover || shouldTurnPage;
}

function cancelPageDrag() {
  settlePageDrag(false);
}

function resetDetailPress() {
  detailPress.active = false;
  detailPress.pointerId = null;
  detailPress.moved = false;
  detailPress.allowClick = false;
}

function onDetailBookPointerDown(event) {
  if (
    mode !== "detail"
    || readingOpen
    || event.button !== 0
    || event.isPrimary === false
  ) return;

  setPointerFromEvent(event);
  detailPress.allowClick = false;
  if (!activeBookAtPointer()) return;
  detailPress.active = true;
  detailPress.pointerId = event.pointerId;
  detailPress.startX = event.clientX;
  detailPress.startY = event.clientY;
  detailPress.moved = false;
}

function onDetailBookPointerMove(event) {
  if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
  if (
    Math.hypot(
      event.clientX - detailPress.startX,
      event.clientY - detailPress.startY
    ) > 16
  ) {
    detailPress.moved = true;
  }
}

function onDetailBookPointerEnd(event) {
  if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
  detailPress.allowClick = event.type === "pointerup" && !detailPress.moved;
  detailPress.active = false;
  detailPress.pointerId = null;
}

function onPagePointerDown(event) {
  if (
    mode !== "detail"
    || !activeBook
    || event.button !== 0
    || event.isPrimary === false
  ) return;

  setPointerFromEvent(event);
  const coverSurface = coverSurfaceAtPointer();
  const pageSurface = readingOpen ? pageSurfaceAtPointer() : null;
  if (!coverSurface && !pageSurface) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  pageDrag.active = true;
  pageDrag.pointerId = event.pointerId;
  pageDrag.startX = event.clientX;
  pageDrag.startY = event.clientY;
  pageDrag.progress = 0;
  pageDrag.peakProgress = 0;
  pageDrag.committed = false;
  pageDrag.progressVelocity = 0;
  pageDrag.verticalBias = 0;
  pageDrag.lastProgress = 0;
  pageDrag.lastTime = event.timeStamp || performance.now();
  pageDrag.direction = 0;
  pageDrag.kind = coverSurface
    ? readingOpen
      ? "cover-close"
      : "cover-open"
    : "page";
  controls.enabled = false;
  canvas.classList.add("has-page-hover", "is-page-dragging");
  canvas.setPointerCapture?.(event.pointerId);
  requestFrame();
}

function updatePageDragMotion(event, deltaY) {
  const eventTime = event.timeStamp || performance.now();
  const elapsed = clamp(
    (eventTime - pageDrag.lastTime) / 1000,
    0.008,
    0.08
  );
  const instantVelocity = clamp(
    (pageDrag.progress - pageDrag.lastProgress) / elapsed,
    -8,
    8
  );
  pageDrag.progressVelocity = lerp(
    pageDrag.progressVelocity,
    instantVelocity,
    0.42
  );
  pageDrag.verticalBias = lerp(
    pageDrag.verticalBias,
    clamp(deltaY / 180, -1, 1),
    0.36
  );
  pageDrag.lastProgress = pageDrag.progress;
  pageDrag.lastTime = eventTime;
}

function updatePageDragFromEvent(event) {
  setPointerFromEvent(event);

  const deltaX = event.clientX - pageDrag.startX;
  const deltaY = event.clientY - pageDrag.startY;
  const horizontalDistance = Math.abs(deltaX);

  if (
    pageDrag.kind === "cover-open"
    || pageDrag.kind === "cover-close"
  ) {
    const openingCover = pageDrag.kind === "cover-open";
    const signedDistance = openingCover ? -deltaX : deltaX;
    const commitProgress = openingCover
      ? COVER_OPEN_COMMIT_PROGRESS
      : COVER_CLOSE_COMMIT_PROGRESS;
    pageDrag.direction = 0;
    pageDrag.progress = (
      horizontalDistance >= 3
      && horizontalDistance >= Math.abs(deltaY) * 0.72
    )
      ? clamp(Math.max(0, signedDistance) / 140, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    if (pageDrag.peakProgress >= commitProgress) {
      pageDrag.committed = true;
    }
    updatePageDragMotion(event, deltaY);
    return;
  }

  if (
    horizontalDistance < 3
    || horizontalDistance < Math.abs(deltaY) * 0.72
  ) {
    pageDrag.progress = 0;
  } else {
    if (pageDrag.direction === 0 && horizontalDistance >= 6) {
      const direction = deltaX < 0 ? 1 : -1;
      const directionAvailable = direction > 0
        ? currentSpread < SPREAD_COUNT - 1
        : currentSpread > 0;
      pageDrag.direction = directionAvailable ? direction : 0;
    }

    const signedDistance = pageDrag.direction > 0 ? -deltaX : deltaX;
    pageDrag.progress = pageDrag.direction !== 0
      ? clamp(Math.max(0, signedDistance) / 150, 0, 1)
      : 0;
    pageDrag.peakProgress = Math.max(
      pageDrag.peakProgress,
      pageDrag.progress
    );
    if (pageDrag.peakProgress >= PAGE_TURN_COMMIT_PROGRESS) {
      pageDrag.committed = true;
    }
  }
  updatePageDragMotion(event, deltaY);
}

function onPagePointerMove(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  updatePageDragFromEvent(event);

  requestFrame();
}

function onPagePointerEnd(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === "pointerup") updatePageDragFromEvent(event);
  const dragKind = pageDrag.kind;
  const releaseDistance = Math.hypot(
    event.clientX - pageDrag.startX,
    event.clientY - pageDrag.startY
  );
  const shouldClickOpen = event.type === "pointerup"
    && dragKind === "cover-open"
    && !pageDrag.committed
    && releaseDistance <= 12;
  if (pageDrag.committed) {
    settlePageDrag(true);
  } else if (shouldClickOpen) {
    resetPageDrag();
    detailPress.allowClick = false;
    setReadingOpen(true);
  } else {
    if (dragKind === "cover-open") {
      detailPress.allowClick = false;
    }
    cancelPageDrag();
  }
}

function onWindowPagePointerEnd(event) {
  if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
  if (event.type === "pointerup") updatePageDragFromEvent(event);
  settlePageDrag(true);
}

function setHovered(index) {
  if (hoveredIndex === index) return;
  hoveredIndex = index;
  canvas.classList.toggle("has-book-hover", index >= 0);
  if (index >= 0) {
    const book = BOOKS[index];
    pointerLabelIndex.textContent = book.roman;
    pointerLabelTitle.textContent = book.title;
    pointerLabel.setAttribute("aria-hidden", "false");
  } else {
    pointerLabel.setAttribute("aria-hidden", "true");
  }
  requestFrame();
}

function positionPointerLabel() {
  pointerLabel.style.left = `${pointer.clientX}px`;
  pointerLabel.style.top = `${pointer.clientY}px`;
}

function onPointerMove(event) {
  setPointerFromEvent(event);
  positionPointerLabel();
  requestFrame();
}

function onPointerLeave() {
  pointer.ndc.set(3, 3);
  pointerDirty = false;
  detailBookHovered = false;
  setHovered(-1);
  if (!pageDrag.active) {
    canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  }
}

function onCanvasClick(event) {
  if (mode === "detail" && !readingOpen && event.button === 0) {
    if (!detailPress.allowClick) return;
    detailPress.allowClick = false;
    setPointerFromEvent(event);
    if (!activeBookAtPointer()) return;
    event.preventDefault();
    setReadingOpen(true);
    return;
  }
  if (mode !== "hero" || event.button !== 0) return;
  setPointerFromEvent(event);
  const clickedBookIndex = bookIndexAtPointer();
  if (clickedBookIndex < 0) return;
  event.preventDefault();
  // A side book slides to the centre first; clicking the centred book opens it.
  if (clickedBookIndex !== selectedIndex) {
    selectIndex(clickedBookIndex, inspectButton);
    return;
  }
  openDetail(canvas);
}

function onWheel(event) {
  if (mode !== "hero") return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  targetPosition = clamp(
    targetPosition + clamp(delta * 0.0022, -0.72, 0.72),
    0,
    BOOKS.length - 1
  );
  wheelIdle = 0.14;
  requestFrame();
}

function openDetail(origin = inspectButton) {
  if (mode !== "hero") return;
  mode = "opening";
  transitionTime = 0;
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  resetDetailPress();
  focusReturnTarget = origin instanceof HTMLElement && origin !== canvas
    ? origin
    : inspectButton;
  activeBook = getRig(selectedIndex);
  ensureDetailTextures(activeBook);
  ensureInteriorPages(activeBook);
  activeBook.root.visible = true;
  activeBook.contactShadow.visible = false;
  populateDetail(activeBook.data);
  updatePageControls(false);
  detailPanel.inert = false;
  detailPanel.setAttribute("aria-hidden", "false");
  browseUi.inert = true;
  experience.classList.add("mode-detail", "is-opening");
  pointerLabel.setAttribute("aria-hidden", "true");
  setHovered(-1);
  configureResponsiveTargets();

  activeBook.root.updateWorldMatrix(true, true);
  activeBook.root.matrixWorld.decompose(
    openingBookPosition,
    openingBookQuaternion,
    openingBookScale
  );
  openingCameraPosition.copy(camera.position);
  openingCameraTarget.copy(transitionCameraTarget);
  openingShelfPosition.copy(shelfStage.position);
  openingMotionPosition.copy(activeBook.motion.position);
  openingMotionQuaternion.copy(activeBook.motion.quaternion);
  openingViewOffsetX = currentViewOffsetX;
  scene.add(activeBook.root);
  activeBook.root.position.copy(openingBookPosition);
  activeBook.root.quaternion.copy(openingBookQuaternion);
  activeBook.root.scale.copy(openingBookScale);
  setRigOpacity(activeBook, 1);
  applyDetailViewOffset();
  controls.enabled = false;
  liveRegion.textContent = activeBook.data.kind === "undecided"
    ? "Opening Undecided. Choose your majors and minors in the panel."
    : `Opening ${activeBook.data.title}. Use Add as major to put it on your path.`;

  if (reducedMotion) {
    finishOpening();
  }
  requestFrame();
}

function applyOpeningPose(progress) {
  const eased = smootherstep(clamp(progress, 0, 1));
  const shelfClearEased = smootherstep(clamp(progress / 0.68, 0, 1));
  inspectBookScale.setScalar(getInspectScale());
  shelfStage.position.lerpVectors(
    openingShelfPosition,
    inspectShelfPosition,
    shelfClearEased
  );
  activeBook.root.position.lerpVectors(
    openingBookPosition,
    inspectPosition,
    eased
  );
  activeBook.root.quaternion.slerpQuaternions(
    openingBookQuaternion,
    inspectBookQuaternion,
    eased
  );
  activeBook.root.scale.lerpVectors(
    openingBookScale,
    inspectBookScale,
    eased
  );
  activeBook.motion.position.lerpVectors(
    openingMotionPosition,
    restingMotionPosition,
    eased
  );
  activeBook.motion.quaternion.slerpQuaternions(
    openingMotionQuaternion,
    restingMotionQuaternion,
    eased
  );
  camera.position.lerpVectors(
    openingCameraPosition,
    inspectCameraPosition,
    eased
  );
  transitionCameraTarget.lerpVectors(
    openingCameraTarget,
    inspectCameraTarget,
    eased
  );
  currentViewOffsetX = lerp(openingViewOffsetX, detailViewOffsetX, eased);
  applyDetailViewOffset();
  camera.lookAt(transitionCameraTarget);
}

function finishOpening() {
  if (!activeBook) return;
  applyOpeningPose(1);
  mode = "detail";
  transitionTime = 1;
  // the shelf has dropped out of frame; stop drawing it (and casting from it)
  shelfStage.visible = false;
  controls.target.copy(inspectCameraTarget);
  controls.enabled = true;
  controls.enableDamping = !reducedMotion;
  controls.update();
  updatePageControls(false);
  experience.classList.remove("is-opening");
  if (activeBook.data.kind === "undecided" && viewWidth >= 820) {
    pathSearch.focus({ preventScroll: true });
  } else {
    closeButton.focus({ preventScroll: true });
  }
}

function closeDetail() {
  if (mode !== "detail") return;
  cancelPageDrag();
  resetDetailPress();
  shelfStage.visible = true;
  mode = "closing";
  transitionTime = 0;
  readingOpen = false;
  detailBookHovered = false;
  currentSpread = 0;
  canvas.classList.remove("has-page-hover", "has-closed-book-hover");
  updatePageControls(false);
  controls.enabled = false;
  closingBookStartPosition.copy(activeBook.root.position);
  closingBookStartQuaternion.copy(activeBook.root.quaternion);
  closingBookStartScale.copy(activeBook.root.scale);
  closingMotionPosition.copy(activeBook.motion.position);
  closingMotionQuaternion.copy(activeBook.motion.quaternion);
  closingCameraPosition.copy(camera.position);
  closingCameraTarget.copy(controls.target);
  closingShelfPosition.copy(shelfStage.position);
  closingViewOffsetX = currentViewOffsetX;
  transitionCameraTarget.copy(closingCameraTarget);
  experience.classList.remove("is-opening");
  alignShelfToSelection();
  closingBookPosition.set(
    0,
    shelfBoardTop + activeBook.base.height * 0.5 + 0.15,
    0.37
  );
  rigCache.forEach((rig, index) => {
    if (rig !== activeBook && rig.root.parent === shelfStage) {
      snapRigToShelfSlot(rig, index);
    }
  });
  experience.classList.remove("mode-detail");
  detailPanel.setAttribute("aria-hidden", "true");
  detailPanel.inert = true;
  liveRegion.textContent = `Returning ${activeBook.data.title} to the shelf.`;
  if (reducedMotion) {
    finishClosing();
  }
  requestFrame();
}

function applyClosingPose(progress) {
  const eased = smootherstep(clamp(progress, 0, 1));
  const shelfReturnEased = smootherstep(
    clamp((progress - 0.24) / 0.76, 0, 1)
  );
  shelfStage.position.lerpVectors(
    closingShelfPosition,
    shelfRestPosition,
    shelfReturnEased
  );
  activeBook.root.position.lerpVectors(
    closingBookStartPosition,
    closingBookPosition,
    eased
  );
  activeBook.root.quaternion.slerpQuaternions(
    closingBookStartQuaternion,
    closingBookQuaternion,
    eased
  );
  activeBook.root.scale.lerpVectors(
    closingBookStartScale,
    closingBookScale,
    eased
  );
  activeBook.motion.position.lerpVectors(
    closingMotionPosition,
    restingMotionPosition,
    eased
  );
  activeBook.motion.quaternion.slerpQuaternions(
    closingMotionQuaternion,
    restingMotionQuaternion,
    eased
  );
  camera.position.lerpVectors(
    closingCameraPosition,
    shelfCameraPosition,
    eased
  );
  transitionCameraTarget.lerpVectors(
    closingCameraTarget,
    shelfCameraTarget,
    eased
  );
  currentViewOffsetX = lerp(closingViewOffsetX, 0, eased);
  applyDetailViewOffset();
  camera.lookAt(transitionCameraTarget);
}

function finishClosing() {
  if (!activeBook) return;
  applyClosingPose(1);
  shelfStage.attach(activeBook.root);
  snapRigToShelfSlot(activeBook, selectedIndex);
  activeBook.contactShadow.visible = true;
  controls.target.copy(shelfCameraTarget);
  browseUi.inert = false;
  mode = "hero";
  transitionTime = 0;
  activeBook = null;
  selectionNote.textContent = bookNote(BOOKS[selectedIndex]);
  liveRegion.textContent = `${BOOKS[selectedIndex].title} returned to the shelf.`;
  requestAnimationFrame(() => focusReturnTarget?.focus?.({ preventScroll: true }));
}

function resetInspectionView() {
  if (mode !== "detail") return;
  camera.position.copy(inspectCameraPosition);
  controls.target.copy(inspectCameraTarget);
  controls.update();
  liveRegion.textContent = `Inspection view reset for ${BOOKS[selectedIndex].title}.`;
  requestFrame();
}

// Returns whether any book on the shelf is still easing toward its slot, so the
// render loop can stop once everything has settled.
function updateShelfLayout(delta) {
  let largestGap = 0;
  const ease = (current, target, speed) => {
    largestGap = Math.max(largestGap, Math.abs(current - target));
    return damp(current, target, speed, delta);
  };

  if (mode === "hero") {
    position = reducedMotion
      ? targetPosition
      : damp(position, targetPosition, 9.5, delta);
    if (Math.abs(position - targetPosition) < 0.0005) position = targetPosition;

    if (wheelIdle > 0) {
      wheelIdle -= delta;
      if (wheelIdle <= 0) targetPosition = Math.round(targetPosition);
    }

    const nearest = clamp(Math.round(position), 0, BOOKS.length - 1);
    if (nearest !== selectedIndex) updateSelection(nearest, false);
  }

  rigCache.forEach((rig, index) => {
    if (rig.root.parent !== shelfStage) return;

    const offset = index - position;
    const distance = Math.abs(offset);
    const focus = 1 - clamp(distance, 0, 1);
    const targetX = offset * spacing;
    const targetY = shelfBoardTop + rig.base.height * 0.5 + focus * 0.15;
    const targetZ = 0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07;
    const targetRotationY = -offset * 0.105;
    const targetRotationZ = -offset * 0.018;
    const targetScale = 1 + focus * 0.09;
    const speed = reducedMotion ? 1000 : 12;

    rig.root.position.x = ease(rig.root.position.x, targetX, speed);
    rig.root.position.y = ease(rig.root.position.y, targetY, speed);
    rig.root.position.z = ease(rig.root.position.z, targetZ, speed);
    rig.root.rotation.y = ease(rig.root.rotation.y, targetRotationY, speed);
    rig.root.rotation.z = ease(rig.root.rotation.z, targetRotationZ, speed);
    const nextScale = ease(rig.root.scale.x, targetScale, speed);
    rig.root.scale.setScalar(nextScale);

    const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
    const targetOpacity = 1 - smoothstep(fadeProgress);
    setRigOpacity(rig, reducedMotion
      ? targetOpacity
      : ease(rig.opacity, targetOpacity, 18));
    rig.root.visible = rig.opacity > 0.004;
    rig.contactShadow.visible = true;
    rig.contactShadow.material.opacity = rig.opacity * 0.24;
    rig.hit.visible = rig.opacity > 0.12;
    if (!rig.root.visible) return;

    const isHovered = hoveredIndex === index && mode === "hero";
    const hoverPreview = isHovered && !reducedMotion;
    const hoverAngle = hoverPreview ? -0.085 : 0;
    rig.frontPivot.rotation.y = ease(
      rig.frontPivot.rotation.y,
      hoverAngle,
      reducedMotion ? 1000 : 13
    );
    rig.pagePivots.forEach((pagePivot) => {
      pagePivot.rotation.y = damp(
        pagePivot.rotation.y,
        0,
        reducedMotion ? 1000 : 13,
        delta
      );
      pagePivot.rotation.z = damp(
        pagePivot.rotation.z,
        0,
        reducedMotion ? 1000 : 13,
        delta
      );
      updateFlexiblePage(pagePivot, 0, delta);
    });

    // The authored idle bob (±0.012) is left out: it kept the whole scene
    // re-rendering every frame just to move the centre book a pixel or two.
    rig.motion.position.y = ease(rig.motion.position.y, hoverPreview ? 0.035 : 0, 9);
    rig.motion.rotation.x = ease(
      rig.motion.rotation.x,
      hoverPreview ? pointer.ndc.y * 0.035 : 0,
      10
    );
    rig.motion.rotation.y = ease(
      rig.motion.rotation.y,
      hoverPreview ? -pointer.ndc.x * 0.035 : 0,
      10
    );
  });
  return largestGap > 0.0002;
}

function updateTransition(delta) {
  if (mode === "opening") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / DETAIL_TRANSITION_DURATION
    );
    applyOpeningPose(transitionTime);
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishOpening();
  } else if (mode === "closing") {
    transitionTime = Math.min(
      1,
      transitionTime + delta / SHELF_TRANSITION_DURATION
    );
    applyClosingPose(transitionTime);
    updatePaginatedBook(activeBook, delta, 0);
    if (transitionTime >= 1) finishClosing();
  } else if (mode === "hero") {
    shelfStage.position.y = damp(shelfStage.position.y, 0, 10, delta);
    shelfStage.position.z = damp(shelfStage.position.z, 0, 10, delta);
    camera.position.x = damp(camera.position.x, shelfCameraPosition.x, 8, delta);
    camera.position.y = damp(camera.position.y, shelfCameraPosition.y, 8, delta);
    camera.position.z = damp(camera.position.z, shelfCameraPosition.z, 8, delta);
    transitionCameraTarget.copy(shelfCameraTarget);
    currentViewOffsetX = 0;
    applyDetailViewOffset();
    camera.lookAt(shelfCameraTarget);
  }
}

function requestFrame() {
  if (!rafId && !suspended) {
    rafId = requestAnimationFrame(frame);
  }
}

function getDetailOpenAmount() {
  if (pageDrag.active && pageDrag.kind === "cover-open") {
    return smoothstep(pageDrag.progress);
  }
  if (!readingOpen) return 0;
  if (pageDrag.active && pageDrag.kind === "cover-close") {
    return 1 - smoothstep(pageDrag.progress);
  }
  return 1;
}

// Adaptive resolution: when back-to-back frames keep running slow (integrated
// GPUs drawing this many physical materials), step the pixel ratio down toward 1.
const SLOW_FRAME_MS = 24;
let pixelRatioCap = Infinity;
let slowFrameScore = 0;
let previousFrameRequested = false;
let shadowStale = true;

// Full resolution whenever the scene is still: the loop only renders while
// something moves, so the settled frame is drawn once more at the screen's own
// pixel ratio. Only frames in motion use the (possibly lowered) motion ratio.
function restPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, viewWidth < 820 ? 1.5 : 2);
}

function motionPixelRatio() {
  return Math.min(restPixelRatio(), pixelRatioCap);
}

function usePixelRatio(ratio) {
  if (Math.abs(renderer.getPixelRatio() - ratio) < 0.01) return;
  renderer.setPixelRatio(ratio);
  renderer.setSize(viewWidth, viewHeight, false);
}

// Rolling record of back-to-back frames, read through window.__majorShelf.perf.
const perfSamples = [];

function recordFrame(frameMs, cpuMs) {
  perfSamples.push([frameMs, cpuMs, mode]);
  if (perfSamples.length > 600) perfSamples.shift();
}

function perfReport() {
  const summarize = (rows) => {
    if (!rows.length) return null;
    const frames = rows.map((row) => row[0]).sort((a, b) => a - b);
    const cpu = rows.map((row) => row[1]).sort((a, b) => a - b);
    const average = (values) => +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
    return {
      samples: rows.length,
      fps: +(1000 / average(frames)).toFixed(0),
      frameAvgMs: average(frames),
      frameP95Ms: +frames[Math.floor(frames.length * 0.95)].toFixed(1),
      frameMaxMs: +frames[frames.length - 1].toFixed(1),
      cpuAvgMs: average(cpu),
      cpuMaxMs: +cpu[cpu.length - 1].toFixed(1)
    };
  };
  return {
    shelf: summarize(perfSamples.filter((row) => row[2] === "hero")),
    book: summarize(perfSamples.filter((row) => row[2] !== "hero")),
    pixelRatio: renderer?.getPixelRatio(),
    devicePixelRatio: window.devicePixelRatio,
    antialias: renderer?.getContextAttributes().antialias,
    drawCalls: renderer?.info.render.calls,
    gpu: (() => {
      const gl = renderer?.getContext();
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    })()
  };
}

function trackFrameCost(frameMs) {
  if (!previousFrameRequested) return;
  slowFrameScore = frameMs > SLOW_FRAME_MS ? slowFrameScore + 1 : Math.max(0, slowFrameScore - 1);
  const current = renderer.getPixelRatio();
  if (slowFrameScore < 12 || current <= 1) return;
  slowFrameScore = 0;
  pixelRatioCap = Math.max(1, current - 0.25);
  usePixelRatio(motionPixelRatio());
}

let detailAnimating = false;

// Everything on a lifted book that eases: the cover and each leaf.
function detailPose(rig) {
  const pose = [rig.frontPivot.rotation.y];
  rig.pagePivots.forEach((pivot) => pose.push(pivot.rotation.y, pivot.rotation.z, pivot.position.z));
  return pose;
}

function poseChanged(before, after) {
  return before.some((value, index) => Math.abs(value - after[index]) > 0.00002);
}

function frame(time) {
  rafId = 0;
  const cpuStart = performance.now();
  const frameMs = time - lastTime;
  // after the loop has rested, the gap since the last frame is idle time, not motion
  const delta = previousFrameRequested ? Math.min(frameMs / 1000, 0.05) : 1 / 60;
  lastTime = time;
  trackFrameCost(frameMs);
  if (previousFrameRequested) usePixelRatio(motionPixelRatio());

  let builtRigs = 0;
  if (mode === "hero") {
    // while the shelf is travelling only the visible books are built; the
    // spare one on each side waits until it settles
    const travelling = Math.abs(position - targetPosition) > 0.35 || wheelIdle > 0;
    builtRigs = ensureRigs(1, travelling ? 3 : RIG_RADIUS);
  }
  if (pointerDirty) updateHover();
  const shelfAnimating = updateShelfLayout(delta);
  updateTransition(delta);
  const themeIsMoving = updateTheme(delta);

  if (mode === "detail") {
    if (pageDrag.active) {
      pageDrag.progressVelocity = damp(
        pageDrag.progressVelocity,
        0,
        9,
        delta
      );
    }
    const controlsMoved = controls.update();
    const poseBefore = detailPose(activeBook);
    updatePaginatedBook(activeBook, delta, getDetailOpenAmount());
    detailAnimating = controlsMoved
      || pageDrag.active
      || poseChanged(poseBefore, detailPose(activeBook))
      || activeBook.pagePivots.some(({ userData: { flex } }) => flex.curveVelocity !== 0 || flex.twistVelocity !== 0);
  }

  // The shadow map is redrawn only when the shelf comes to rest: while books
  // slide past, their soft contact shadows move with them and the cast shadow
  // catches up on the frame they settle. A lifted book (opening, reading,
  // closing) is a single model, so it keeps live shadows.
  const shelfMoving = Math.abs(position - targetPosition) > 0.0005 || wheelIdle > 0;
  if (mode !== "hero") {
    renderer.shadowMap.needsUpdate = true;
  } else if (shelfMoving || shelfAnimating || builtRigs > 0) {
    shadowStale = true;
  } else if (shadowStale) {
    renderer.shadowMap.needsUpdate = true;
    shadowStale = false;
  }

  renderer.render(scene, camera);
  if (previousFrameRequested) recordFrame(frameMs, performance.now() - cpuStart);

  // Render on demand: the shelf stops drawing once everything has come to rest
  // (pointer, wheel, keys and controls all call requestFrame to wake it).
  const shouldContinue = mode === "opening"
    || mode === "closing"
    || (mode === "detail" && detailAnimating)
    || (mode === "hero" && shelfMoving)
    || shelfAnimating
    || themeIsMoving
    || builtRigs > 0;
  previousFrameRequested = shouldContinue && !suspended;
  if (previousFrameRequested) {
    requestFrame();
  } else if (renderer.getPixelRatio() < restPixelRatio() - 0.01) {
    // at rest: redraw this frame sharp
    usePixelRatio(restPixelRatio());
    renderer.render(scene, camera);
  }
}

function resize() {
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  configureResponsiveTargets();
  renderer.setPixelRatio(restPixelRatio());
  renderer.setSize(viewWidth, viewHeight, false);
  camera.aspect = viewWidth / viewHeight;
  camera.updateProjectionMatrix();

  if (mode === "hero") {
    camera.position.copy(shelfCameraPosition);
    transitionCameraTarget.copy(shelfCameraTarget);
    currentViewOffsetX = 0;
    applyDetailViewOffset();
    camera.lookAt(shelfCameraTarget);
  } else if (mode === "detail" && activeBook) {
    activeBook.root.position.copy(inspectPosition);
    activeBook.root.scale.setScalar(getInspectScale());
    transitionCameraTarget.copy(inspectCameraTarget);
    currentViewOffsetX = detailViewOffsetX;
    applyDetailViewOffset();
    resetInspectionView();
  }
  requestFrame();
}

function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, select, textarea"));
}

function detailFocusables() {
  return [...detailPanel.querySelectorAll("button, input, select")].filter(
    (element) => !element.disabled && element.offsetParent !== null
  );
}

function onKeyDown(event) {
  if (event.key === "Escape" && mode === "detail") {
    event.preventDefault();
    closeDetail();
    return;
  }

  if (
    mode === "detail"
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !isTypingTarget(event.target)
    && (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    turnPage(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  if (mode === "detail" && event.key === "Tab") {
    const focusables = detailFocusables();
    if (!focusables.length) return;
    const current = focusables.indexOf(document.activeElement);
    const next = event.shiftKey
      ? (current <= 0 ? focusables.length - 1 : current - 1)
      : (current >= focusables.length - 1 ? 0 : current + 1);
    event.preventDefault();
    focusables[next].focus();
    return;
  }

  if (mode !== "hero" || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(-1, document.activeElement);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    navigate(1, document.activeElement);
  } else if ((event.key === "Enter" || event.key === " ") && document.activeElement === inspectButton) {
    event.preventDefault();
    openDetail(inspectButton);
  }
}

function onVisibilityChange() {
  suspended = document.hidden;
  if (!suspended) {
    lastTime = performance.now();
    requestFrame();
  } else {
    settlePageDrag(true);
    resetDetailPress();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }
}

function onWindowBlur() {
  settlePageDrag(true);
  resetDetailPress();
}

function onReducedMotionChange(event) {
  cancelPageDrag();
  resetDetailPress();
  reducedMotion = event.matches;
  controls.enableDamping = !reducedMotion;
  if (reducedMotion) {
    position = targetPosition;
  }
  requestFrame();
}

function buildFallbackGrid() {
  fallbackGrid.replaceChildren(...BOOKS.map((book) => {
    const article = document.createElement("article");
    article.className = "fallback-book";
    article.style.setProperty("--book-color", book.color);
    article.style.setProperty("--book-foil", book.foil);
    article.style.setProperty("--book-height", `${Math.round(book.height * 240)}px`);
    const kind = document.createElement("span");
    kind.textContent = book.roman;
    const title = document.createElement("strong");
    title.textContent = book.title;
    article.append(kind, title);
    return article;
  }));
}

function showFallback(message) {
  loading.hidden = true;
  experience.classList.remove("webgl-ready");
  staticFallback.hidden = false;
  fallbackStatus.textContent = message;
}

function handleContextLost(event) {
  event.preventDefault();
  cancelPageDrag();
  resetDetailPress();
  suspended = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  showFallback("The 3D view paused after losing its graphics context. The complete static catalog remains available; reload to restore the shelf.");
}

function disposeExperience() {
  suspended = true;
  if (controls) {
    cancelPageDrag();
    resetDetailPress();
  }
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;

  canvas.removeEventListener("pointermove", onPointerMove);
  canvas.removeEventListener("pointerleave", onPointerLeave);
  canvas.removeEventListener("click", onCanvasClick);
  canvas.removeEventListener("pointerdown", onDetailBookPointerDown, true);
  canvas.removeEventListener("pointermove", onDetailBookPointerMove, true);
  canvas.removeEventListener("pointerup", onDetailBookPointerEnd, true);
  canvas.removeEventListener("pointercancel", onDetailBookPointerEnd, true);
  canvas.removeEventListener("lostpointercapture", onDetailBookPointerEnd, true);
  canvas.removeEventListener("pointerdown", onPagePointerDown, true);
  canvas.removeEventListener("pointermove", onPagePointerMove, true);
  canvas.removeEventListener("pointerup", onPagePointerEnd, true);
  canvas.removeEventListener("pointercancel", onPagePointerEnd, true);
  canvas.removeEventListener("lostpointercapture", onPagePointerEnd, true);
  window.removeEventListener("pointerup", onWindowPagePointerEnd);
  window.removeEventListener("pointercancel", onWindowPagePointerEnd);
  experience.removeEventListener("wheel", onWheel);
  canvas.removeEventListener("webglcontextlost", handleContextLost);
  window.removeEventListener("resize", resize);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("blur", onWindowBlur);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery.removeEventListener("change", onReducedMotionChange);

  controls?.dispose();
  scene?.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
  environmentTarget?.dispose();
  renderer?.dispose();
}

function bindPathControls() {
  toggleMajorButton.addEventListener("click", () => {
    const book = activeBook?.data;
    if (!book?.programId) return;
    const added = toggleProgram(book.programId);
    liveRegion.textContent = `${book.title} ${added ? "added to" : "removed from"} your path.`;
  });
  pathTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      chooserKind = tab.dataset.kind;
      renderChooserList();
      pathSearch.focus({ preventScroll: true });
    });
  });
  pathSearch.addEventListener("input", renderChooserList);
  pathContinue.addEventListener("click", () => goTo("/roadmap"));
  openPlannerButton.addEventListener("click", () => goTo("/roadmap"));
  myShelfButton.addEventListener("click", () => goTo("/"));
  fallbackSetup.addEventListener("click", (event) => {
    event.preventDefault();
    goTo("/setup");
  });
}

async function initialize() {
  programIds = embedded ? [] : readStandaloneProgramIds();
  bindPathControls();
  postToParent({ type: "uci-shelf:ready" });

  try {
    const response = await fetch(new URL("programs.json", DATA_URL));
    if (!response.ok) throw new Error(response.statusText);
    programs = await response.json();
  } catch {
    loading.hidden = true;
    staticFallback.hidden = false;
    fallbackStatus.textContent = "The list of UCI programs could not be loaded. Run build_web_data.py, then reload.";
    return;
  }
  programsById = new Map(programs.map((program) => [program.id, program]));
  BOOKS = buildBooks(programs);
  buildFallbackGrid();

  try {
    await document.fonts.load("600 82px Inter");
  } catch (error) {
    // The system sans-serif fallback keeps the interface usable offline.
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      // MSAA on top of a 1.5x/2x backing store mostly buys GPU load, not edges
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch (error) {
    showFallback("WebGL is unavailable in this browser. The complete static catalog remains available.");
    return;
  }

  bindRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false; // see frame(): redrawn when the shelf settles
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe9dfcb, 0.027);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.72;
  pmremGenerator.dispose();

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  shelfStage = new THREE.Group();
  shelfStage.name = "continuous-shelf-stage";
  scene.add(shelfStage);

  configureResponsiveTargets();
  camera.position.copy(shelfCameraPosition);
  camera.lookAt(shelfCameraTarget);

  controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 2.8;
  controls.maxDistance = 7.2;
  controls.minPolarAngle = Math.PI * 0.24;
  controls.maxPolarAngle = Math.PI * 0.76;
  controls.target.copy(shelfCameraTarget);
  controls.addEventListener("change", requestFrame);

  RectAreaLightUniformsLib.init();
  applyOakFinish();
  addRoom();
  addLights();
  buildMarkers();

  // Undecided is the default book.
  position = targetPosition = undecidedIndex;
  ensureRigs(Infinity);
  rigCache.forEach((rig, index) => snapRigToShelfSlot(rig, index));

  updateSelection(undecidedIndex, true);
  refreshPathUi();
  resize();

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("pointerdown", onDetailBookPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onDetailBookPointerMove, { capture: true });
  canvas.addEventListener("pointerup", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("pointercancel", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("lostpointercapture", onDetailBookPointerEnd, { capture: true });
  canvas.addEventListener("pointerdown", onPagePointerDown, { capture: true });
  canvas.addEventListener("pointermove", onPagePointerMove, { capture: true });
  canvas.addEventListener("pointerup", onPagePointerEnd, { capture: true });
  canvas.addEventListener("pointercancel", onPagePointerEnd, { capture: true });
  canvas.addEventListener("lostpointercapture", onPagePointerEnd, { capture: true });
  window.addEventListener("pointerup", onWindowPagePointerEnd);
  window.addEventListener("pointercancel", onWindowPagePointerEnd);
  experience.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", handleContextLost);
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotionQuery.addEventListener("change", onReducedMotionChange);

  previousButton.addEventListener("click", () => navigate(-1, previousButton));
  nextButton.addEventListener("click", () => navigate(1, nextButton));
  inspectButton.addEventListener("click", () => openDetail(inspectButton));
  closeButton.addEventListener("click", closeDetail);
  toggleBookButton.addEventListener("click", () => setReadingOpen(!readingOpen));
  previousPageButton.addEventListener("click", () => turnPage(-1));
  nextPageButton.addEventListener("click", () => turnPage(1));
  resetButton.addEventListener("click", resetInspectionView);

  renderer.render(scene, camera);
  loading.hidden = true;
  experience.classList.add("webgl-ready");
  requestFrame();
}

initialize().catch(() => {
  showFallback("The interactive shelf could not be prepared. The complete static catalog remains available.");
});
window.addEventListener("beforeunload", disposeExperience, { once: true });

// Debug/inspection seam, in the spirit of the other ThreeUI pages.
window.__majorShelf = {
  get books() {
    return BOOKS.map(({ id, title, kind }) => ({ id, title, kind }));
  },
  get selectedIndex() {
    return selectedIndex;
  },
  get builtRigs() {
    return [...rigCache.keys()].sort((a, b) => a - b);
  },
  get mode() {
    return mode;
  },
  get programIds() {
    return [...programIds];
  },
  get perf() {
    return perfReport();
  }
};
