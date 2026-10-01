// The student's own bookcase. One Progress volume (courses taken) always stands
// first; every major and minor they add from the full shelf joins it. Books are
// built by shelf-core.js, the same hardcovers as the major shelf.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import {
  MAJOR_DEGREES,
  PALETTES,
  PROGRESS_PALETTE,
  WARM_ROOM,
  applyOakFinish,
  bindRenderer,
  createBookRig,
  createBookcase,
  createMesh,
  ensureDetailTextures,
  ensureInteriorPages,
  hashString,
  makeBook,
  setRigOpacity,
  shared,
  shortName
} from "./shelf-core.js";

const DATA_URL = new URL("../data/", location.href);
const embedded = window.parent !== window;
const SLOT_WIDTH = 1.62;
const ROW_HEIGHT = 2.3;
// books stand a little larger here than on the long shelf, filling their slots
const BOOK_SCALE = 1.18;
const TOP_RESERVE_PX = 96;
const BOTTOM_RESERVE_PX = 150;

const home = document.querySelector("#home");
const canvas = document.querySelector("#scene");
const loading = document.querySelector("#loading");
const fallback = document.querySelector("#fallback");
const fallbackMessage = document.querySelector("#fallback-message");
const stripList = document.querySelector("#strip-list");
const viewAllButton = document.querySelector("#view-all");
const panel = document.querySelector("#progress-panel");
const panelClose = document.querySelector("#panel-close");
const panelSummary = document.querySelector("#panel-summary");
const courseList = document.querySelector("#course-list");
const openRoadmapButton = document.querySelector("#open-roadmap");
const liveRegion = document.querySelector("#live-region");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

let renderer;
let scene;
let camera;
let bookcase = null;
let programs = [];
let programsById = new Map();
let majorOrder = new Map();
let programIds = [];
let completed = [];
let plannedCourses = [];
let courses = null;
let stateReceived = !embedded;
let books = [];
const rigs = new Map(); // book id -> rig
let layout = { columns: 5, rows: 2 };
let hoveredId = null;
let openState = "shelf"; // shelf | opening | open | closing
let liftAmount = 0;
let rafId = 0;
let lastTime = performance.now();
let shadowStale = true;
let ready = false;

const pointer = new THREE.Vector2(3, 3);
const raycaster = new THREE.Raycaster();
const cameraTarget = new THREE.Vector3();
const inspectPosition = new THREE.Vector3();
const inspectQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, 0.32, 0));
const scratchQuaternion = new THREE.Quaternion();

/* ── Messaging with the planner ─────────────────────────────────────────── */

function goTo(path) {
  if (embedded) window.parent.postMessage({ type: "uci-shelf:navigate", to: path }, location.origin);
  else location.href = new URL(`..${path}`, location.href).href;
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const data = event.data;
  if (data?.type !== "uci-shelf:state") return;
  programIds = Array.isArray(data.programIds) ? data.programIds.filter((id) => typeof id === "string") : [];
  completed = Array.isArray(data.completed) ? data.completed.filter(isCourseId) : [];
  plannedCourses = Array.isArray(data.plannedCourses) ? data.plannedCourses.filter((id) => typeof id === "string") : [];
  stateReceived = true;
  if (ready) refreshShelf();
  if (openState === "open") renderProgressPanel();
});

// `completed` also records requirement markers ticked by hand ("marker:…",
// e.g. Entry Level Writing); only real courses belong in Progress.
function isCourseId(id) {
  return typeof id === "string" && !id.startsWith("marker:");
}

function readStandaloneState() {
  try {
    const saved = JSON.parse(localStorage.getItem("uci-planner") || "null")?.state ?? {};
    programIds = saved.programIds ?? [];
    completed = (saved.completed ?? []).filter(isCourseId);
    plannedCourses = (saved.years ?? []).flatMap((year) => Object.values(year.quarters ?? {}).flat());
  } catch {
    // nothing saved yet
  }
}

/* ── Books ──────────────────────────────────────────────────────────────── */

const ROMAN = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
function roman(value) {
  let rest = value;
  let out = "";
  ROMAN.forEach(([numeral, amount]) => {
    while (rest >= amount) {
      out += numeral;
      rest -= amount;
    }
  });
  return out;
}

function progressBook() {
  return makeBook({
    id: "progress",
    programId: null,
    kind: "progress",
    title: "Progress",
    roman: "I",
    discipline: "Courses taken",
    note: "Every course you have already taken at UCI.",
    deck: "A record of the courses behind you — open it to see what you have taken and how many units it adds up to.",
    theme: "Progress · courses taken",
    chapters: ["Taken", "Units", "Next"]
  }, 0, PROGRESS_PALETTE, 1);
}

// A major keeps the binding it has on the full shelf (palette by its A–Z place);
// a minor, which has no place there, takes one from its id.
function programBook(program) {
  const order = majorOrder.get(program.id);
  const slot = order ?? hashString(program.id);
  const isMinor = program.degree === "minor";
  const degree = MAJOR_DEGREES[program.degree];
  const title = shortName(program.name);
  return makeBook({
    id: program.id,
    programId: program.id,
    kind: isMinor ? "minor" : "major",
    title,
    roman: isMinor ? "Minor" : degree?.short ?? program.degree,
    discipline: isMinor ? "Minor" : degree?.long ?? "Major",
    note: `${isMinor ? "Minor" : degree?.long ?? "Major"} · UC Irvine`,
    deck: `${title} at UC Irvine.`,
    theme: `${title} · ${isMinor ? "Minor" : degree?.long ?? ""}`,
    chapters: ["Lower division", "Upper division", "Electives"]
  }, 0, PALETTES[slot % PALETTES.length], slot * 3);
}

function shelfBooks() {
  const chosen = programIds
    .map((id) => programsById.get(id))
    .filter((program) => program && program.degree !== "spec");
  const majors = chosen.filter((program) => MAJOR_DEGREES[program.degree]);
  const minors = chosen.filter((program) => program.degree === "minor");
  return [progressBook(), ...majors.map(programBook), ...minors.map(programBook)]
    .map((book, index) => Object.assign(book, { index, volume: roman(index + 1) }));
}

/* ── Strip ──────────────────────────────────────────────────────────────── */

const ICONS = {
  brackets: '<path d="M15 11H9v26h6M33 11h6v26h-6M20 17h-3v14h3M28 17h3v14h-3"/>',
  paths: '<path d="M7 31c9-17 15 9 34-11M7 17c11 15 19-9 34 13"/><circle cx="7" cy="31" r="2"/><circle cx="41" cy="20" r="2"/>',
  caret: '<path d="M9 33 24 13l15 20M8 22h32M8 28h32"/>',
  orbits: '<ellipse cx="24" cy="24" rx="17" ry="7" transform="rotate(-20 24 24)"/><ellipse cx="24" cy="24" rx="12" ry="17" transform="rotate(30 24 24)"/><rect x="21.5" y="21.5" width="5" height="5"/>',
  modules: '<circle cx="15" cy="15" r="6"/><rect x="27" y="9" width="12" height="12"/><rect x="9" y="27" width="12" height="12"/><circle cx="33" cy="33" r="6"/>',
  frames: '<rect x="8" y="12" width="32" height="24"/><rect x="13" y="16" width="22" height="16"/><path d="M8 12l32 24"/>',
  compass: '<path d="M24 8v4M24 12l-10 28M24 12l10 28M14 30h20"/><circle cx="24" cy="12" r="3"/>',
  add: '<circle cx="24" cy="24" r="16"/><path d="M24 16v16M16 24h16"/>'
};

function stripIcon(key) {
  return `<svg class="strip-icon" viewBox="0 0 48 48" aria-hidden="true">${ICONS[key] ?? ICONS.compass}</svg>`;
}

function renderStrip() {
  stripList.replaceChildren();
  books.forEach((book) => {
    const item = document.createElement("li");
    const isProgress = book.kind === "progress";
    const element = document.createElement(isProgress ? "button" : "div");
    element.className = "strip-item";
    element.dataset.id = book.id;
    if (isProgress) {
      element.type = "button";
      element.setAttribute("aria-label", "Open Progress: courses taken");
      element.addEventListener("click", openProgress);
    }
    const meta = isProgress ? `${completed.length} course${completed.length === 1 ? "" : "s"}` : book.roman;
    element.innerHTML = `${stripIcon(book.motifKey)}<span class="strip-text"><small>${meta}</small><small>Volume ${book.volume}</small><strong></strong></span>`;
    element.querySelector("strong").textContent = book.title;
    element.addEventListener("pointerenter", () => setHovered(book.id));
    element.addEventListener("pointerleave", () => setHovered(null));
    item.append(element);
    stripList.append(item);
  });

  const add = document.createElement("li");
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "strip-item strip-add";
  addButton.innerHTML = `${stripIcon("add")}<span class="strip-text"><small>${books.length > 1 ? "Add more" : "Your shelf is empty"}</small><small>All majors &amp; minors</small><strong>Browse the shelf</strong></span>`;
  addButton.addEventListener("click", () => goTo("/shelf"));
  add.append(addButton);
  stripList.append(add);
}

/* ── Scene ──────────────────────────────────────────────────────────────── */

function columnsFor(width) {
  if (width >= 1100) return 5;
  if (width >= 760) return 4;
  if (width >= 520) return 3;
  return 2;
}

function slotPosition(book, target) {
  const { columns, rows } = layout;
  const column = book.index % columns;
  const row = Math.floor(book.index / columns);
  const shelfTop = bookcase.shelfTops[Math.min(row, rows - 1)];
  return target.set(
    (column - (columns - 1) * 0.5) * SLOT_WIDTH,
    shelfTop + book.height * BOOK_SCALE * 0.5,
    0.05
  );
}

function buildBookcase() {
  const columns = columnsFor(window.innerWidth);
  const rows = Math.max(2, Math.ceil(books.length / columns));
  if (bookcase && layout.columns === columns && layout.rows === rows) return false;
  layout = { columns, rows };
  if (bookcase) scene.remove(bookcase.group);
  bookcase = createBookcase({ width: columns * SLOT_WIDTH + 0.3, rows, rowHeight: ROW_HEIGHT });
  scene.add(bookcase.group);
  return true;
}

function frameCamera() {
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  camera.aspect = viewWidth / viewHeight;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const contentWidth = layout.columns * SLOT_WIDTH + 0.3 + bookcase.postWidth * 2 + 0.4;
  const contentHeight = bookcase.height + 0.2;
  const usable = Math.max(0.35, (viewHeight - TOP_RESERVE_PX - BOTTOM_RESERVE_PX) / viewHeight);
  const distance = Math.max(
    contentHeight * 0.5 / (tanHalf * usable),
    contentWidth * 0.5 / (tanHalf * camera.aspect)
  ) * 1.04;
  const worldPerPixel = (2 * distance * tanHalf) / viewHeight;
  const contentCenterY = bookcase.height * 0.5 - 0.35;
  // centre the case in the space between the header and the strip
  cameraTarget.set(0, contentCenterY - (BOTTOM_RESERVE_PX - TOP_RESERVE_PX) * 0.5 * worldPerPixel, 0);
  camera.position.set(0, cameraTarget.y + distance * 0.08, distance);
  camera.lookAt(cameraTarget);
  camera.updateProjectionMatrix();

  // where Progress is held while open: left of the panel, or above the sheet
  const narrow = viewWidth < 760;
  inspectPosition.set(
    narrow ? 0 : -distance * tanHalf * camera.aspect * 0.32,
    cameraTarget.y + (narrow ? distance * tanHalf * 0.38 : 0.05),
    distance * 0.42
  );
}

function addRoom() {
  const wall = createMesh(shared.plane, new THREE.MeshStandardMaterial({ color: WARM_ROOM.wall, roughness: 1 }), "wall", false, true);
  wall.scale.set(60, 30, 1);
  wall.position.set(0, 6, -1.2);
  scene.add(wall);

  const floor = createMesh(shared.plane, new THREE.MeshStandardMaterial({ color: WARM_ROOM.floor, roughness: 0.95 }), "floor", false, true);
  floor.scale.set(60, 30, 1);
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -0.36;
  scene.add(floor);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(WARM_ROOM.hemisphere, WARM_ROOM.hemisphereGround, 0.7));

  const key = new THREE.DirectionalLight(WARM_ROOM.key, 1.35);
  key.position.set(-4, 8, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -3, near: 1, far: 24 });
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const soft = new THREE.RectAreaLight(WARM_ROOM.key, 4.2, 6, 6);
  soft.position.set(-2, 5, 6);
  soft.lookAt(0, 2, 0);
  scene.add(soft);

  const fill = new THREE.DirectionalLight(WARM_ROOM.fill, 0.45);
  fill.position.set(6, 3, 5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(WARM_ROOM.rim, 0.35);
  rim.position.set(4, 4, -3);
  scene.add(rim);
}

function disposeRig(rig) {
  rig.root.parent?.remove(rig.root);
  rig.root.traverse((object) => {
    if (object.geometry && object.geometry !== shared.box && object.geometry !== shared.plane) object.geometry.dispose();
  });
  rig.materials.forEach((material) => material.dispose());
  rig.ownedTextures.forEach((texture) => texture.dispose());
}

const slotScratch = new THREE.Vector3();

// Rebuilds the list of books from the planner state: new books fade in, removed
// ones are disposed, the rest slide to their new slot.
function refreshShelf() {
  books = shelfBooks();
  const ids = new Set(books.map((book) => book.id));
  rigs.forEach((rig, id) => {
    if (!ids.has(id)) {
      disposeRig(rig);
      rigs.delete(id);
    }
  });
  buildBookcase();
  frameCamera();

  books.forEach((book) => {
    let rig = rigs.get(book.id);
    slotPosition(book, slotScratch);
    if (!rig) {
      rig = createBookRig(book, book.index);
      rig.home = new THREE.Vector3();
      rigs.set(book.id, rig);
      scene.add(rig.root);
      rig.root.position.copy(slotScratch);
      rig.root.scale.setScalar(BOOK_SCALE);
      setRigOpacity(rig, reducedMotion ? 1 : 0);
    }
    rig.data = book;
    rig.hit.userData.id = book.id;
    rig.home.copy(slotScratch);
  });
  renderStrip();
  shadowStale = true;
  requestFrame();
}

/* ── Progress panel ─────────────────────────────────────────────────────── */

async function loadCourses() {
  if (courses) return courses;
  try {
    const response = await fetch(new URL("courses.json", DATA_URL));
    courses = response.ok ? await response.json() : {};
  } catch {
    courses = {};
  }
  return courses;
}

function courseUnits(course) {
  const units = course?.units;
  if (!units || units[0] == null) return 0;
  return units[0];
}

function renderProgressPanel() {
  const known = courses ?? {};
  const taken = [...new Set(completed)];
  const units = taken.reduce((sum, id) => sum + courseUnits(known[id]), 0);
  const planned = plannedCourses.filter((id) => !taken.includes(id)).length;
  panelSummary.innerHTML = "";
  [
    [taken.length, taken.length === 1 ? "Course taken" : "Courses taken"],
    [units, "Units"],
    [planned, "Planned next"]
  ].forEach(([value, label]) => {
    const cell = document.createElement("div");
    cell.innerHTML = "<strong></strong><span></span>";
    cell.querySelector("strong").textContent = value;
    cell.querySelector("span").textContent = label;
    panelSummary.append(cell);
  });

  courseList.replaceChildren();
  if (!taken.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    empty.textContent = "No courses marked as taken yet. Mark the ones you have finished in the roadmap and they will be recorded here.";
    courseList.append(empty);
    openRoadmapButton.textContent = "Mark courses in the roadmap";
    return;
  }
  openRoadmapButton.textContent = "Open roadmap";

  const groups = new Map();
  taken
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach((id) => {
      const dept = known[id]?.dept ?? id.replace(/\s+\S+$/, "");
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept).push(id);
    });

  groups.forEach((ids, dept) => {
    const group = document.createElement("section");
    group.className = "course-group";
    const heading = document.createElement("h3");
    heading.textContent = dept;
    const list = document.createElement("ul");
    ids.forEach((id) => {
      const course = known[id];
      const row = document.createElement("li");
      row.innerHTML = "<b></b><span></span><small></small>";
      row.querySelector("b").textContent = id.replace(`${dept} `, "");
      row.querySelector("span").textContent = course?.title ?? (courses ? "" : "…");
      const amount = courseUnits(course);
      row.querySelector("small").textContent = amount ? `${amount} units` : "";
      list.append(row);
    });
    group.append(heading, list);
    courseList.append(group);
  });
}

async function openProgress() {
  if (openState !== "shelf") return;
  const rig = rigs.get("progress");
  if (!rig) return;
  ensureDetailTextures(rig);
  ensureInteriorPages(rig);
  openState = "opening";
  setHovered(null);
  rig.contactShadow.visible = false;
  home.classList.add("is-open");
  panel.inert = false;
  panel.setAttribute("aria-hidden", "false");
  renderProgressPanel();
  liveRegion.textContent = `Progress opened: ${completed.length} courses taken.`;
  requestFrame();
  setTimeout(() => panelClose.focus({ preventScroll: true }), 300);
  if (!courses) {
    await loadCourses();
    if (openState === "opening" || openState === "open") renderProgressPanel();
  }
}

function closeProgress() {
  if (openState !== "open" && openState !== "opening") return;
  openState = "closing";
  home.classList.remove("is-open");
  panel.inert = true;
  panel.setAttribute("aria-hidden", "true");
  liveRegion.textContent = "Progress returned to the shelf.";
  requestFrame();
}

/* ── Frame loop (renders only while something moves) ───────────────────── */

function setHovered(id) {
  if (hoveredId === id) return;
  hoveredId = id;
  canvas.classList.toggle("has-book-hover", id === "progress");
  stripList.querySelectorAll(".strip-item").forEach((item) => {
    item.classList.toggle("is-hovered", item.dataset.id === id);
  });
  requestFrame();
}

function bookAtPointer() {
  raycaster.setFromCamera(pointer, camera);
  const targets = [...rigs.values()].map((rig) => rig.hit);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit ? hit.object.userData.id : null;
}

function requestFrame() {
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function frame(time) {
  rafId = 0;
  const delta = Math.min((time - lastTime) / 1000, 0.05) || 1 / 60;
  lastTime = time;
  let gap = 0;
  const ease = (current, target, speed) => {
    gap = Math.max(gap, Math.abs(current - target));
    return reducedMotion ? target : damp(current, target, speed, delta);
  };

  if (openState === "opening" || openState === "closing") {
    const step = reducedMotion ? 1 : delta / 0.85;
    liftAmount = clamp(liftAmount + (openState === "opening" ? step : -step), 0, 1);
    if (liftAmount >= 1 && openState === "opening") openState = "open";
    if (liftAmount <= 0 && openState === "closing") {
      openState = "shelf";
      const progress = rigs.get("progress");
      if (progress) progress.contactShadow.visible = true;
    }
    gap = Math.max(gap, 0.01);
  }
  const lift = THREE.MathUtils.smootherstep(liftAmount, 0, 1);

  rigs.forEach((rig, id) => {
    const isProgress = id === "progress";
    const hovered = hoveredId === id && openState === "shelf";
    setRigOpacity(rig, ease(rig.opacity, 1, 6));

    if (isProgress && lift > 0) {
      rig.root.position.lerpVectors(rig.home, inspectPosition, lift);
      rig.root.quaternion.slerpQuaternions(scratchQuaternion.identity(), inspectQuaternion, lift);
      rig.root.scale.setScalar(BOOK_SCALE * (1 + lift * 0.12));
      rig.frontPivot.rotation.y = -2.75 * THREE.MathUtils.smoothstep(liftAmount, 0.35, 1);
      rig.motion.position.y = 0;
      return;
    }
    if (isProgress) {
      rig.root.quaternion.identity();
      rig.root.scale.setScalar(BOOK_SCALE);
    }
    rig.root.position.x = ease(rig.root.position.x, rig.home.x, 9);
    rig.root.position.y = ease(rig.root.position.y, rig.home.y, 9);
    rig.root.position.z = ease(rig.root.position.z, rig.home.z, 9);
    rig.motion.position.y = ease(rig.motion.position.y, hovered ? 0.05 : 0, 10);
    rig.frontPivot.rotation.y = ease(rig.frontPivot.rotation.y, hovered && isProgress ? -0.16 : 0, 10);
  });

  const moving = gap > 0.0005;
  if (moving) shadowStale = true;
  if (!moving && shadowStale) {
    renderer.shadowMap.needsUpdate = true;
    shadowStale = false;
  }
  renderer.render(scene, camera);
  if (moving) requestFrame();
}

/* ── Setup ──────────────────────────────────────────────────────────────── */

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  if (buildBookcase()) {
    books.forEach((book) => {
      const rig = rigs.get(book.id);
      if (rig) slotPosition(book, rig.home);
    });
    shadowStale = true;
  }
  frameCamera();
  requestFrame();
}

function bindEvents() {
  canvas.addEventListener("pointermove", (event) => {
    pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    if (openState === "shelf") setHovered(bookAtPointer());
  });
  canvas.addEventListener("pointerleave", () => setHovered(null));
  canvas.addEventListener("click", (event) => {
    pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    if (openState === "open") {
      if (bookAtPointer() !== "progress") closeProgress();
      return;
    }
    // Only Progress opens for now; the program books are placeholders.
    if (openState === "shelf" && bookAtPointer() === "progress") openProgress();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProgress();
  });
  window.addEventListener("resize", resize);
  viewAllButton.addEventListener("click", () => goTo("/shelf"));
  panelClose.addEventListener("click", closeProgress);
  openRoadmapButton.addEventListener("click", () => goTo("/roadmap"));
}

async function initialize() {
  if (!embedded) readStandaloneState();
  bindEvents();
  if (embedded) window.parent.postMessage({ type: "uci-shelf:ready" }, location.origin);

  try {
    const response = await fetch(new URL("programs.json", DATA_URL));
    programs = response.ok ? await response.json() : [];
  } catch {
    programs = [];
  }
  programsById = new Map(programs.map((program) => [program.id, program]));
  // the same A–Z order the full shelf uses, so a major keeps its binding
  programs
    .filter((program) => MAJOR_DEGREES[program.degree])
    .map((program) => ({ program, title: shortName(program.name) }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.program.degree.localeCompare(b.program.degree))
    .forEach(({ program }, index) => majorOrder.set(program.id, index));

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch {
    loading.hidden = true;
    fallback.hidden = false;
    return;
  }
  bindRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  RectAreaLightUniformsLib.init();
  applyOakFinish();
  addRoom();
  addLights();

  // wait briefly for the planner's state so the shelf does not build twice
  for (let tries = 0; tries < 20 && !stateReceived; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  ready = true;
  books = shelfBooks();
  buildBookcase();
  resize();
  refreshShelf();

  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  loading.style.opacity = "0";
  setTimeout(() => { loading.hidden = true; }, 500);
  home.classList.add("ready");
  requestFrame();
}

initialize().catch((error) => {
  loading.hidden = true;
  fallback.hidden = false;
  fallbackMessage.textContent = `Your shelf could not be drawn: ${error.message}`;
});

window.__homeShelf = {
  get books() {
    return books.map(({ id, title, kind, volume }) => ({ id, title, kind, volume }));
  },
  get openState() {
    return openState;
  },
  get layout() {
    return { ...layout };
  },
  open: () => openProgress(),
  close: () => closeProgress()
};
