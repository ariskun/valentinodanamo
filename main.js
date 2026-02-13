
// Cozy Island 3D v5 (Snow + Bees + House)
// Gameplay:
// - Each tree yields at most 1 item (one-time shake).
// - Among ALL trees: peach x4, apple x4, orange x4. Others: no fruit.
// - Fruitless trees: 20% chance to drop a wasp nest once. Then bees chase.
// - If stung => GAME OVER (reset to start).
// - Strategy: run to the house at center and enter (A). Indoor cancels chase.
// - Once a tree triggered bees, it will never trigger again.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, az, bx, bz) => { const dx=ax-bx, dz=az-bz; return dx*dx+dz*dz; };
const randRange = (a,b) => a + Math.random()*(b-a);

// Deterministic RNG for fixed world layout
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Save
const SAVE_KEY = "cozy_island_3d_save_v5";
function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return { inv:{}, world:null };
    const p = JSON.parse(raw);
    return { inv: p.inv || {}, world: p.world || null };
  }catch{
    return { inv:{}, world:null };
  }
}
function writeSave(inv, world){ localStorage.setItem(SAVE_KEY, JSON.stringify({inv, world})); }

function resetGame(){
  localStorage.removeItem(SAVE_KEY);
  // also clear older versions if present
  try{ localStorage.removeItem("cozy_island_3d_save_v4"); }catch{}
  location.reload();
}

// UI
const toastEl = document.getElementById('toast');
const invEl = document.getElementById('inv');
const fadeEl = document.getElementById('fade');
let toastTimer = 0;
function toast(msg, sec=2.2){ toastEl.textContent = msg; toastEl.classList.add('show'); toastTimer = sec; }
function fade(on){ fadeEl.classList.toggle('on', !!on); }
const startScreenEl = document.getElementById('startScreen');
const startBtnEl = document.getElementById('startBtn');

function setStarted(v){
  state.started = !!v;
  if (state.started){
    startScreenEl?.classList.add('hidden');
    toast('Поехали!', 1.2); // “行こう！”的（いらなければ消してOK）
  }else{
    startScreenEl?.classList.remove('hidden');
  }
}

const save = loadSave();
const inv = save.inv;
const world = save.world;

const invGet = (k)=>inv[k]||0;
function invSet(k,v){ inv[k]=v; flushSave(); updateInvUI(); }
function invAdd(k,n){ inv[k]=(inv[k]||0)+n; flushSave(); updateInvUI(); }
function flushSave(){ writeSave(inv, state.world); }
function updateInvUI(){
  invEl.textContent = `🍑:${invGet('peach')}  🍎:${invGet('apple')}  🍊:${invGet('orange')}  🎫:${invGet('leaf_ticket')}`;
}
updateInvUI();

// three.js
const wrap = document.getElementById('wrap');
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
wrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.88);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.90);
sun.position.set(28, 38, 18);
scene.add(sun);

// Winter sky palette
const SKY = {
  day: new THREE.Color(0xbfe6ff),
  eve: new THREE.Color(0xffd9c8),
  night: new THREE.Color(0x1b2a55),
  dawn: new THREE.Color(0xd9f1ff),
};

// Groups (stage switching)
const outdoorGroup = new THREE.Group();
const indoorGroup = new THREE.Group();
scene.add(outdoorGroup);
scene.add(indoorGroup);
indoorGroup.visible = false;

// Island
const island = {
  rx: 42,
  rz: 32,
  sandInner: 0.72,
};
function onLand(x,z){
  const dx=x/island.rx, dz=z/island.rz;
  return (dx*dx + dz*dz) <= 1.0;
}
function onSand(x,z){
  const dx=x/island.rx, dz=z/island.rz;
  const v=(dx*dx + dz*dz);
  return v > island.sandInner && v <= 1.0;
}

// Fog
scene.fog = new THREE.Fog(0xcfe6ff, 30, 150);

// Ocean
const oceanMat = new THREE.MeshPhysicalMaterial({
  color: 0x1f6fb6,
  roughness: 0.18,
  metalness: 0.0,
  clearcoat: 0.6,
  clearcoatRoughness: 0.08,
  transparent: true,
  opacity: 0.98,
});
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), oceanMat);
ocean.rotation.x = -Math.PI/2;
ocean.position.y = -0.10;
outdoorGroup.add(ocean);

// Procedural textures (light)
function makeNoiseTexture({w=128,h=128, base='#f2f8ff', speck='#dbe8f7', seed=0, intensity=0.18}={}){
  const c = document.createElement('canvas');
  c.width=w; c.height=h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0,0,w,h);
  let s = (seed||1) >>> 0;
  const rnd = ()=>{ s = (1664525*s + 1013904223)>>>0; return (s/4294967296); };
  for (let i=0;i<w*h*intensity;i++){
    const x=(rnd()*w)|0, y=(rnd()*h)|0;
    const r=1 + (rnd()*2)|0;
    ctx.fillStyle = speck;
    ctx.globalAlpha = 0.12 + rnd()*0.25;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy?.()||1, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const snowTexA = makeNoiseTexture({ base:'#f3f9ff', speck:'#d9e8f7', seed:11, intensity:0.22 });
const snowTexB = makeNoiseTexture({ base:'#e8f2ff', speck:'#d3e2f5', seed:23, intensity:0.22 });
const sandTex  = makeNoiseTexture({ base:'#e9e1cf', speck:'#d7cfbd', seed:7,  intensity:0.20 });

const snowA = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, map: snowTexA });
const snowB = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, map: snowTexB });
const iceSand = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98, map: sandTex });

// Ground tiles
const groundGroup = new THREE.Group();
outdoorGroup.add(groundGroup);
const TILE = 2.0;
const halfW = Math.ceil(island.rx / TILE) * TILE;
const halfH = Math.ceil(island.rz / TILE) * TILE;
const tilesX = Math.floor((halfW*2) / TILE);
const tilesZ = Math.floor((halfH*2) / TILE);
const tileGeo = new THREE.PlaneGeometry(TILE, TILE);

for (let iz=0; iz<tilesZ; iz++) {
  for (let ix=0; ix<tilesX; ix++) {
    const x = -halfW + TILE*0.5 + ix*TILE;
    const z = -halfH + TILE*0.5 + iz*TILE;
    if (!onLand(x, z)) continue;
    const mat = onSand(x, z) ? iceSand : (((ix + iz) % 2 === 0) ? snowA : snowB);
    const tile = new THREE.Mesh(tileGeo, mat);
    tile.rotation.x = -Math.PI/2;
    tile.position.set(x, 0, z);
    if (tile.material && tile.material.map) {
      const t = tile.material.map;
      t.offset.set(((ix%4)*0.25), ((iz%4)*0.25));
      t.repeat.set(0.65, 0.65);
    }
    groundGroup.add(tile);
  }
}

// Ponds (frozen)
const ponds = [
  { x: 14.0, z: 2.0, rx: 3.0, rz: 2.2 },
  { x: -16.0, z: -7.0, rx: 2.6, rz: 1.8 },
];
const iceMat = new THREE.MeshStandardMaterial({ color: 0x9ad3ff, roughness: 0.10, metalness: 0.0, transparent:true, opacity: 0.70 });
for (const p of ponds) {
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(p.rx, p.rx*1.06, 0.10, 36), iceMat);
  pond.position.set(p.x, 0.05, p.z);
  outdoorGroup.add(pond);
}
function insideAnyPond(x, z){
  for (const p of ponds) {
    const dx = (x - p.x) / p.rx;
    const dz = (z - p.z) / p.rz;
    if ((dx*dx + dz*dz) < 1.0) return true;
  }
  return false;
}

// Shadows
function shadowBlob(r=0.7, a=0.14){
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent:true, opacity:a })
  );
  m.rotation.x = -Math.PI/2;
  m.position.y = 0.01;
  return m;
}

// Entities
const interactables = []; // outdoor interactables only
const pickups = [];
const particles = [];

// Footprints
const footprints = [];
const fpGeo = new THREE.PlaneGeometry(0.38, 0.52);
const fpMat = new THREE.MeshBasicMaterial({ color: 0x9fb1c6, transparent:true, opacity:0.26, depthWrite:false });
const fpMat2 = fpMat.clone(); fpMat2.opacity = 0.22;
let fpAcc = 0;
let lastFpX = 999, lastFpZ = 999;
function spawnFootprint(x, z, rotY){
  if (state.stage !== 'outdoor') return;
  if (onSand(x,z) || insideAnyPond(x,z)) return;
  const m = new THREE.Mesh(fpGeo, (Math.random()<0.5?fpMat:fpMat2));
  m.rotation.x = -Math.PI/2;
  m.rotation.z = (Math.random()*0.30 - 0.15);
  m.position.set(x, 0.012, z);
  m.rotateY(rotY);
  outdoorGroup.add(m);
  footprints.push({ mesh: m, life: 0.9 });
}
function updateFootprints(dt){
  for (let i=footprints.length-1;i>=0;i--){
    const f=footprints[i];
    f.life -= dt;
    const a = clamp(f.life/0.9, 0, 1);
    f.mesh.material.opacity = (f.mesh.material === fpMat ? 0.26 : 0.22) * a;
    if (f.life <= 0){
      outdoorGroup.remove(f.mesh);
      footprints.splice(i,1);
    }
  }
}

// World state
const state = {
  stage: 'outdoor',
  world: world || null,
  wasp: { active:false, obj:null, speed:7.2, treeId:null, t:0 },
  started: false,            // ★追加：ゲーム開始フラグ
};


function randomLandPoint(margin=2.0, rnd=Math.random){
  for (let i=0;i<220;i++) {
    const x = (-island.rx + margin) + rnd() * ((island.rx - margin) - (-island.rx + margin));
    const z = (-island.rz + margin) + rnd() * ((island.rz - margin) - (-island.rz + margin));
    if (!onLand(x,z)) continue;
    if (insideAnyPond(x,z)) continue;
    if (Math.abs(x) < 4.5 && Math.abs(z) < 7.0) continue;
    return {x,z};
  }
  return {x:0,z:0};
}

// Tree mesh
function makeSnowyTreeMesh(){
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.30, 1.45, 18),
    new THREE.MeshStandardMaterial({ color: 0x7a4b25, roughness: 0.98 })
  );
  trunk.position.y = 0.72;

  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2aa765, roughness: 0.90 });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.12, 24, 18), canopyMat);
  canopy.position.y = 2.05;

  const snowCapMat = new THREE.MeshStandardMaterial({ color: 0xf7fcff, roughness: 0.96 });
  const snowCap = new THREE.Mesh(new THREE.SphereGeometry(0.88, 24, 18), snowCapMat);
  snowCap.scale.y = 0.44;
  snowCap.position.y = 2.58;

  const cl1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), snowCapMat);
  const cl2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), snowCapMat);
  cl1.position.set(0.42, 2.30, 0.22);
  cl2.position.set(-0.36, 2.25, -0.10);

  const hi = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, transparent:true, opacity: 0.14 })
  );
  hi.position.set(0.46, 2.28, -0.38);

  group.add(shadowBlob(1.15, 0.13), trunk, canopy, snowCap, cl1, cl2, hi);
  group.userData = { canopy, snowCap, cl1, cl2, hasSnow: true };
  return group;
}

function makeRockMesh(){
  const group = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.80, 0),
    new THREE.MeshStandardMaterial({ color: 0xbcc6d3, roughness: 0.98 })
  );
  rock.position.y = 0.64;
  const snow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.96, transparent:true, opacity: 0.55 })
  );
  snow.scale.y = 0.35;
  snow.position.y = 1.00;
  group.add(shadowBlob(1.00, 0.12), rock, snow);
  return group;
}

// House
function makeHouseMesh(){
  const g = new THREE.Group();
  g.add(shadowBlob(2.2, 0.14));

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.1, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.95 })
  );
  base.position.y = 1.05;

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 1.6, 4),
    new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.90 })
  );
  roof.position.y = 2.35;
  roof.rotation.y = Math.PI/4;

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.3, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.95 })
  );
  door.position.set(0, 0.75, 1.62);

  const snow = new THREE.Mesh(
    new THREE.BoxGeometry(3.24, 0.12, 3.24),
    new THREE.MeshStandardMaterial({ color: 0xf7fcff, roughness: 0.98, transparent:true, opacity:0.92 })
  );
  snow.position.y = 2.05;

  g.add(base, roof, door, snow);
  return g;
}

function buildIndoor(){
  // prison-like room with bars + normal furniture
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ color: 0x6c5538, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0;

  // concrete walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.98 });
  const wallGeo = new THREE.BoxGeometry(14, 4, 0.3);
  const w1 = new THREE.Mesh(wallGeo, wallMat); w1.position.set(0,2, -7);
  const w2 = new THREE.Mesh(wallGeo, wallMat); w2.position.set(0,2,  7);
  w2.rotation.y = Math.PI;
  const w3 = new THREE.Mesh(wallGeo, wallMat); w3.position.set(-7,2,0); w3.rotation.y = Math.PI/2;
  const w4 = new THREE.Mesh(wallGeo, wallMat); w4.position.set( 7,2,0); w4.rotation.y = -Math.PI/2;

  // barred window feel
  const barMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.65, metalness: 0.6 });
  const bars = new THREE.Group();
  const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.8, 10);
  for (let i=0;i<9;i++) {
    const b = new THREE.Mesh(barGeo, barMat);
    b.position.set(-3.2 + i*0.8, 2.1, -6.85);
    bars.add(b);
  }
  // horizontal beams
  const beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 7.0, 10);
  const beam1 = new THREE.Mesh(beamGeo, barMat); beam1.rotation.z = Math.PI/2; beam1.position.set(0, 3.2, -6.85);
  const beam2 = new THREE.Mesh(beamGeo, barMat); beam2.rotation.z = Math.PI/2; beam2.position.set(0, 1.2, -6.85);
  bars.add(beam1, beam2);

  // cell bars at the "exit" side but still open enough for gameplay
  const gate = new THREE.Group();
  for (let i=0;i<11;i++) {
    const b = new THREE.Mesh(barGeo, barMat);
    b.position.set(-4.0 + i*0.8, 1.6, 6.85);
    gate.add(b);
  }
  const gbeam1 = new THREE.Mesh(beamGeo, barMat); gbeam1.rotation.z = Math.PI/2; gbeam1.position.set(0, 2.9, 6.85);
  const gbeam2 = new THREE.Mesh(beamGeo, barMat); gbeam2.rotation.z = Math.PI/2; gbeam2.position.set(0, 0.9, 6.85);
  gate.add(gbeam1, gbeam2);

  // furniture: bed, table, chair, shelf
  const bed = new THREE.Group();
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 1.4), new THREE.MeshStandardMaterial({ color: 0x6b7a8f, roughness: 0.92 }));
  bedBase.position.y = 0.20;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 1.3), new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: 0.95 }));
  mattress.position.y = 0.42;
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.35), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
  pillow.position.set(-0.75, 0.53, -0.40);
  bed.add(bedBase, mattress, pillow);
  bed.position.set(-4.2, 0, -2.5);

  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.10, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.93 }));
  top.position.y = 0.75;
  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.72, 10);
  for (const sx of [-0.6,0.6]) for (const sz of [-0.35,0.35]) {
    const leg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x6a3c1f, roughness: 0.93 }));
    leg.position.set(sx, 0.36, sz);
    table.add(leg);
  }
  table.add(top);
  table.position.set(2.6, 0, -1.6);

  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.10, 0.65), new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.93 }));
  seat.position.y = 0.45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.10), new THREE.MeshStandardMaterial({ color: 0x6a3c1f, roughness: 0.93 }));
  back.position.set(0, 0.78, -0.28);
  chair.add(seat, back);
  chair.position.set(2.6, 0, -0.4);

  const shelf = new THREE.Group();
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x545454, roughness: 0.95 });
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.4), shelfMat); s1.position.y = 0.45;
  const s2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.4), shelfMat); s2.position.y = 0.90;
  const s3 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.10, 0.4), shelfMat); s3.position.y = 1.35;
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.55, 0.4), shelfMat); side.position.set(-0.55, 0.80, 0);
  const side2 = side.clone(); side2.position.set(0.55, 0.80, 0);
  shelf.add(s1,s2,s3,side,side2);
  shelf.position.set(4.8, 0, 2.2);

  // warm lamp
  const lamp = new THREE.PointLight(0xffe5b6, 1.2, 40);
  lamp.position.set(0, 3.2, 0);

  // rug stays cozy
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 28),
    new THREE.MeshStandardMaterial({ color: 0xb44a4a, roughness: 0.9 })
  );
  rug.rotation.x = -Math.PI/2;
  rug.position.set(0, 0.02, 0.6);

  indoorGroup.add(floor, w1,w2,w3,w4, bars, gate, rug, bed, table, chair, shelf, lamp);

  // indoor door interactable (exit)
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.1, 18),
    new THREE.MeshStandardMaterial({ color: 0x7ec8ff, roughness: 0.75, transparent:true, opacity:0.65 })
  );
  marker.position.set(0, 0.05, 6.0);
  indoorGroup.add(marker);

  state.indoorDoor = { type:'door', x:0, z:6.0, r:1.2, obj:marker };
}
buildIndoor();

// Player
function makeChibiHuman({ hair=0x3a2a1f, shirt=0x87d7ff, pants=0x4b5a86 } = {}) {
  const g = new THREE.Group();
  g.add(shadowBlob(0.62, 0.16));

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe2c6, roughness: 0.75 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 22, 18), skinMat);
  head.position.y = 1.42;

  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.60, 22, 18), hairMat);
  hairCap.scale.y = 0.62;
  hairCap.position.y = 1.66;

  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), hairMat);
  fringe.scale.set(1.0, 0.45, 0.75);
  fringe.position.set(0.0, 1.60, 0.45);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.16, 1.45, 0.55);
  eyeR.position.set( 0.16, 1.45, 0.55);

  const noseMat = new THREE.MeshStandardMaterial({ color: 0xffc1a6, roughness: 0.7 });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), noseMat);
  nose.position.set(0.0, 1.34, 0.60);

  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.42, 6, 12), shirtMat);
  body.position.y = 0.86;

  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 0.25, 16), pantsMat);
  hip.position.y = 0.56;

  const armMat = new THREE.MeshStandardMaterial({ color: 0xffe2c6, roughness: 0.75 });
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.32, 4, 10);
  const armL = new THREE.Mesh(armGeo, armMat);
  const armR = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.42, 0.92, 0);
  armR.position.set( 0.42, 0.92, 0);
  armL.rotation.z = 0.22;
  armR.rotation.z = -0.22;

  const legGeo = new THREE.CapsuleGeometry(0.10, 0.32, 4, 10);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.22, 0);
  legR.position.set( 0.16, 0.22, 0);

  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 });
  const shoeGeo = new THREE.SphereGeometry(0.12, 12, 10);
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat);
  shoeL.position.set(-0.16, 0.05, 0.10);
  shoeR.position.set( 0.16, 0.05, 0.10);

  g.add(head, hairCap, fringe, eyeL, eyeR, nose, body, hip, armL, armR, legL, legR, shoeL, shoeR);
  return g;
}

const player = makeChibiHuman({ shirt: 0x9ad6ff, pants: 0x4b5a86 });
outdoorGroup.add(player);

// NPC cats (unchanged simplified)
function makeCat({ fur=0xffd2e1, ear=0xffd2e1, nose=0xff7aa2, stripe=0xffffff } = {}) {
  const g = new THREE.Group();
  g.add(shadowBlob(0.62, 0.14));

  const furMat = new THREE.MeshStandardMaterial({ color: fur, roughness: 0.85 });
  const faceMat = new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.9, transparent:true, opacity: 0.18 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.56, 22, 18), furMat);
  head.position.y = 1.12;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 18), furMat);
  body.scale.set(0.95, 0.82, 0.95);
  body.position.y = 0.55;

  const earMat = new THREE.MeshStandardMaterial({ color: ear, roughness: 0.85 });
  const earGeo = new THREE.ConeGeometry(0.20, 0.32, 16);
  const earL = new THREE.Mesh(earGeo, earMat);
  const earR = new THREE.Mesh(earGeo, earMat);
  earL.position.set(-0.30, 1.55, 0.05);
  earR.position.set( 0.30, 1.55, 0.05);
  earL.rotation.x = Math.PI;
  earR.rotation.x = Math.PI;
  earL.rotation.z = 0.22;
  earR.rotation.z = -0.22;

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), faceMat);
  muzzle.scale.y = 0.55;
  muzzle.position.set(0, 1.02, 0.42);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.18, 1.18, 0.50);
  eyeR.position.set( 0.18, 1.18, 0.50);

  const noseMat = new THREE.MeshStandardMaterial({ color: nose, roughness: 0.65 });
  const n = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), noseMat);
  n.position.set(0, 1.05, 0.58);

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.50, 4, 10), furMat);
  tail.position.set(-0.40, 0.55, -0.45);
  tail.rotation.x = 0.55;
  tail.rotation.z = 0.55;

  g.add(body, head, earL, earR, muzzle, eyeL, eyeR, n, tail);
  return g;
}

function pickWanderTarget(avoidX, avoidZ){
  for (let i=0;i<40;i++) {
    const p = randomLandPoint(2.2);
    if (dist2(p.x, p.z, avoidX, avoidZ) < 9) continue;
    return { x: p.x, z: p.z };
  }
  return { x: 0, z: 0 };
}

function addCatNPC(name, x, z, palette){
  const group = makeCat(palette);
  group.position.set(x, 0, z);
  outdoorGroup.add(group);

  const npc = {
    type: 'npc',
    name,
    obj: group,
    x, z,
    r: 0.90,
    speed: randRange(1.05, 1.55),
    wait: randRange(0.2, 1.2),
    target: pickWanderTarget(x, z),
    mood: Math.random() < 0.5 ? 'cheer' : 'calm',
    freeze: 0,
  };
  interactables.push(npc);
}

// Pickups (fruits)
function spawnPickup(kind, x, z){
  const group = new THREE.Group();
  const sh = shadowBlob(0.42, 0.14);
  let mesh;

  if (kind === 'apple') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff4b5c, roughness: 0.75 }));
    mesh.position.y = 0.50;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0x2fbf71, roughness: 0.9 }));
    stem.position.set(0.02, 0.76, 0.02);
    group.add(sh, mesh, stem);
  } else if (kind === 'peach') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffb0c8, roughness: 0.78 }));
    mesh.position.y = 0.50;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3bd47a, roughness: 0.9 }));
    leaf.scale.set(1.4, 0.5, 1.0);
    leaf.position.set(0.10, 0.76, -0.02);
    group.add(sh, mesh, leaf);
  } else if (kind === 'orange') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffa53a, roughness: 0.80 }));
    mesh.position.y = 0.50;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), new THREE.MeshStandardMaterial({ color: 0x41c46f, roughness: 0.9 }));
    leaf.scale.set(1.3, 0.45, 1.0);
    leaf.position.set(-0.12, 0.76, 0.04);
    group.add(sh, mesh, leaf);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), new THREE.MeshStandardMaterial({ color: 0xfff1a8, roughness: 0.88 }));
    mesh.position.y = 0.56;
    group.add(sh, mesh);
  }

  group.position.set(x, 0, z);
  outdoorGroup.add(group);
  pickups.push({ kind, obj: group, x, z, r: 0.55 });
}

// Snow burst particles
function spawnSnowBurst(x, y, z, count=22){
  const geo = new THREE.SphereGeometry(0.06, 8, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.95 });
  for (let i=0;i<count;i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + randRange(-0.25,0.25), y + randRange(-0.10,0.30), z + randRange(-0.25,0.25));
    outdoorGroup.add(m);
    particles.push({ obj:m, vy:randRange(0.5,1.4), vx:randRange(-0.4,0.4), vz:randRange(-0.4,0.4), life:randRange(0.7,1.2) });
  }
}
function updateParticles(dt){
  for (let i=particles.length-1; i>=0; i--) {
    const p=particles[i];
    p.life -= dt;
    p.vy -= 3.2*dt;
    p.obj.position.x += p.vx*dt;
    p.obj.position.y += p.vy*dt;
    p.obj.position.z += p.vz*dt;
    if (p.life <= 0 || p.obj.position.y < 0.02) {
      outdoorGroup.remove(p.obj);
      particles.splice(i,1);
    }
  }
}

// Bee
function makeBee(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd54a, roughness: 0.55 })
  );
  body.scale.z = 1.25;
  body.position.y = 0.35;

  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.7 });
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.20,0.05, 18), stripeMat);
  stripe.rotation.x = Math.PI/2;
  stripe.position.set(0, 0.35, 0.05);

  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent:true, opacity:0.35, roughness:0.2 });
  const wingGeo = new THREE.SphereGeometry(0.14, 14, 10);
  const w1 = new THREE.Mesh(wingGeo, wingMat);
  const w2 = new THREE.Mesh(wingGeo, wingMat);
  w1.scale.set(1.3,0.6,1.0);
  w2.scale.set(1.3,0.6,1.0);
  w1.position.set(-0.14, 0.45, -0.05);
  w2.position.set( 0.14, 0.45, -0.05);

  g.add(body, stripe, w1, w2);
  g.userData = { w1, w2 };
  return g;
}

function startWaspChase(treeId, x, z){
  if (state.wasp.active) return;
  const bee = makeBee();
  bee.position.set(x, 0, z);
  outdoorGroup.add(bee);

  state.wasp.active = true;
  state.wasp.obj = bee;
  state.wasp.treeId = treeId;
  state.wasp.t = 0;

  // 1s delay before it actually starts chasing
  state.wasp.delay = 2.0;
  state.wasp.originX = x;
  state.wasp.originZ = z;

  toast('🐝 蜂の巣だ…！(1秒後に追ってくる) 家に逃げろ！', 2.4);
}

function stopWaspChase(){
  if (!state.wasp.active) return;
  if (state.wasp.obj) outdoorGroup.remove(state.wasp.obj);
  state.wasp.active = false;
  state.wasp.obj = null;
  state.wasp.treeId = null;
  state.wasp.delay = 0;
  state.wasp.originX = 0;
  state.wasp.originZ = 0;
}

function updateWasp(dt){
  if (!state.wasp.active || !state.wasp.obj) return;
  state.wasp.t += dt;

  const bee = state.wasp.obj;

  // buzz wings always
  const u = bee.userData;
  if (u && u.w1 && u.w2) {
    const f = Math.sin(state.wasp.t * 32.0);
    u.w1.rotation.z = 0.5 + f*0.6;
    u.w2.rotation.z = -0.5 - f*0.6;
  }

  // 1s wait before chase begins
  if (state.wasp.delay > 0) {
    state.wasp.delay -= dt;
    bee.position.x = state.wasp.originX;
    bee.position.z = state.wasp.originZ;
    bee.position.y = 0.35 + Math.sin(state.wasp.t*9.0)*0.10;
    bee.rotation.y += dt * 2.0;
    return;
  }

  const px = player.position.x;
  const pz = player.position.z;

  // move toward player
  const dx = px - bee.position.x;
  const dz = pz - bee.position.z;
  const d = Math.hypot(dx, dz);
  const nx = d>1e-6 ? dx/d : 0;
  const nz = d>1e-6 ? dz/d : 0;

  const sp = state.wasp.speed;
  bee.position.x += nx * sp * dt;
  bee.position.z += nz * sp * dt;
  bee.position.y = 0.35 + Math.sin(state.wasp.t*9.0)*0.08;
  bee.rotation.y = Math.atan2(nx, nz);

  // sting
  if (d < 0.75) {
    toast('😵 刺された！ゲームオーバー…', 1.2);
    fade(true);
    setTimeout(()=>resetGame(), 900);
  }
}

// Build / init world (persisted)
function shuffle(arr, rnd=Math.random){
  for (let i=arr.length-1;i>0;i--){
    const j=(rnd()*(i+1))|0;
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function initWorld(){
  if (state.world && state.world.trees && state.world.trees.length >= 12) return;

  // Fixed layout every new game: deterministic seed
  const rnd = mulberry32(20260212);

  const trees = [];
  const rocks = [];

  const TREE_COUNT = 44;
  const ROCK_COUNT = 12;

  for (let i=0;i<TREE_COUNT;i++) {
    const p = randomLandPoint(2.6, rnd);
    trees.push({ id: `t${i}`, x:p.x, z:p.z, fruit:null, coconut:false, shaken:false, hadWasp:false });
  }
  for (let i=0;i<ROCK_COUNT;i++) {
    const p = randomLandPoint(2.6, rnd);
    rocks.push({ id:`r${i}`, x:p.x, z:p.z });
  }

  // Assign fruits: peach x4, apple x4, orange x4
  const idx = shuffle([...Array(trees.length).keys()], rnd);
  const give = (kind, n, start)=>{ for(let k=0;k<n;k++) trees[idx[start+k]].fruit = kind; };
  give('peach', 4, 0);
  give('apple', 4, 4);
  give('orange',4, 8);

  // Among fruitless trees: 5% coconuts (instant KO on shake)
  for (const t of trees) {
    if (t.fruit) continue;
    if (rnd() < 0.05) t.coconut = true;
  }

  state.world = { trees, rocks };
  flushSave();
}

// Build meshes from world
function buildOutdoor(){
  initWorld();

  // House at center
  const houseMesh = makeHouseMesh();
  houseMesh.position.set(0, 0, 0);
  outdoorGroup.add(houseMesh);
  state.house = { type:'house', obj:houseMesh, x:0, z:0, r:2.0 };
  interactables.push(state.house);

  // Cat house near the main house
  const catHouse = new THREE.Group();
  catHouse.add(shadowBlob(1.3, 0.14));
  const chBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.1, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xf2a2b7, roughness: 0.92 })
  );
  chBase.position.y = 0.55;
  const chRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.55, 0.9, 4),
    new THREE.MeshStandardMaterial({ color: 0xb24a62, roughness: 0.90 })
  );
  chRoof.position.y = 1.35;
  chRoof.rotation.y = Math.PI/4;
  const chDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.95 })
  );
  chDoor.position.set(0, 0.35, 0.85);
  const paw = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent:true, opacity:0.75 })
  );
  paw.rotation.x = -Math.PI/2;
  paw.position.set(0, 0.02, 1.05);
  catHouse.add(chBase, chRoof, chDoor, paw);
  catHouse.position.set(4.4, 0, 2.2);
  outdoorGroup.add(catHouse);

  // Trees

  // Trees
  for (const t of state.world.trees) {
    const mesh = makeSnowyTreeMesh();
    mesh.position.set(t.x, 0, t.z);
    outdoorGroup.add(mesh);
    t.obj = mesh;
    // state visuals
    if (t.shaken) {
      // remove snow cap if already shaken before (optional): keep snow though for vibe
    }
    interactables.push({
      type:'tree',
      id: t.id,
      data: t,
      obj: mesh,
      x: t.x,
      z: t.z,
      r: 1.08,
      sway: 0,
      cooldown: 0,
    });
  }

  // Rocks (still there visually)
  for (const r of state.world.rocks) {
    const mesh = makeRockMesh();
    mesh.position.set(r.x, 0, r.z);
    outdoorGroup.add(mesh);
    interactables.push({ type:'rock', id:r.id, x:r.x, z:r.z, r:0.90, obj:mesh, cooldown:0 });
  }

  // NPCs
  addCatNPC('タマ',  -3.0,  2.0,  { fur: 0xffd2e1, ear: 0xffd2e1, nose: 0xff7aa2, stripe: 0xffffff });
  addCatNPC('ミケ',   9.0, -10.0, { fur: 0xffe8b6, ear: 0xffe8b6, nose: 0xffa0a0, stripe: 0xffffff });
  addCatNPC('シロ', -15.0,  10.0, { fur: 0xffffff, ear: 0xffffff, nose: 0xffa0a0, stripe: 0xffffff });
  addCatNPC('クロ',  18.0,  9.0,  { fur: 0x3b3b3b, ear: 0x3b3b3b, nose: 0xff7aa2, stripe: 0xffffff });

  // Player start
  player.position.set(0, 0, 10);
}

buildOutdoor();

// Interaction text
function npcTalk(npc){
  npc.freeze = 2.8;
  npc.wait = 0;
  toast(`${npc.name}「木は1回だけだにゃ。蜂が出たら家へ！」`);
}

// Action logic
function doAction(){
  if (state.stage === 'indoor') {
    // exit door
    if (!state.started) return;
    const dx = player.position.x - state.indoorDoor.x;
    const dz = player.position.z - state.indoorDoor.z;
    if (Math.hypot(dx,dz) < 1.6) {
      toast('そとへ出た', 1.2);
      fade(true);
      setTimeout(()=>{
        fade(false);
        switchToOutdoor();
      }, 220);
    } else {
      toast('ここでA: そとへ', 1.0);
    }
    return;
  }

  // If bees are chasing, let player focus on escape. Still allow house entry.

  const px = player.position.x;
  const pz = player.position.z;

  // Prefer house entry if close enough (even in normal times)
  const hd = Math.sqrt(dist2(px, pz, 0, 0));
  if (hd < 2.9) {
    toast('家に入った！', 1.2);
    fade(true);
    setTimeout(()=>{
      fade(false);
      switchToIndoor();
    }, 220);
    return;
  }

  let nearest = null;
  let best = 1e9;
  for (const o of interactables) {
    const d = Math.sqrt(dist2(px, pz, o.x, o.z));
    if (d < 2.3 && d < best) { best=d; nearest=o; }
  }
  if (!nearest) { toast('なにもない…'); return; }

  if (nearest.type === 'house') {
    // entering cancels chase
    toast('家に入った！', 1.2);
    fade(true);
    setTimeout(()=>{
      fade(false);
      switchToIndoor();
    }, 220);
    return;
  }

  if (nearest.type === 'tree') {
    const t = nearest.data;
    if (t.shaken) { toast('もう何もない…'); return; }

    // one-time shake now consumes the tree
    t.shaken = true;

    // visuals: sway + snow drop
    nearest.cooldown = 1.4;
    nearest.sway = 0.75;
    const ud = nearest.obj.userData;
    if (ud && ud.hasSnow) {
      ud.hasSnow = false;
      if (ud.snowCap) ud.snowCap.visible = false;
      if (ud.cl1) ud.cl1.visible = false;
      if (ud.cl2) ud.cl2.visible = false;
      spawnSnowBurst(nearest.x, 2.2, nearest.z, 26);
    }

    // fruit or coconut (instant KO) or nothing/wasps
    if (t.fruit) {
      spawnPickup(t.fruit, t.x + (Math.random()*0.9 - 0.45), t.z + 1.2);
      toast(`木をゆすった！ ${t.fruit==='peach'?'桃':t.fruit==='apple'?'リンゴ':'オレンジ'}が落ちた！`);
    } else if (t.coconut) {
      // immediate game over: "coconut fell" and got hit
      toast('ココナッツが落ちてた', 1.2);
      fade(true);
      setTimeout(()=>resetGame(), 900);
    } else {
      if (!t.hadWasp && Math.random() < 0.20) {
        t.hadWasp = true; // this tree will never trigger again
        spawnSnowBurst(nearest.x, 1.6, nearest.z, 12);
        startWaspChase(t.id, t.x, t.z);
      } else {
        toast('木をゆすった… 何もない');
      }
    }

    flushSave();
    return;
  }

  if (nearest.type === 'npc') {
    npcTalk(nearest);
    return;
  }

  if (nearest.type === 'rock') {
    toast('石だ。いまは何も起きない', 1.2);
    return;
  }
}

// Stage switching
function switchToIndoor(){
  state.stage = 'indoor';

  // cancel chase
  stopWaspChase();

  outdoorGroup.visible = false;
  indoorGroup.visible = true;
  // move player into room
  indoorGroup.add(player);
  player.position.set(0, 0, 4.0);
  player.rotation.y = Math.PI;

  // tighten fog feel
  scene.fog.near = 8; scene.fog.far = 36;
}

function switchToOutdoor(){
  state.stage = 'outdoor';
  indoorGroup.visible = false;
  outdoorGroup.visible = true;
  outdoorGroup.add(player);
  // spawn just outside house door
  player.position.set(0, 0, 3.6);
  player.rotation.y = Math.PI;

  scene.fog.near = 30; scene.fog.far = 150;
}

// Controls
const joy = { active:false, pid:null, centerX:0, centerY:0, dx:0, dy:0 };
const joyEl = document.getElementById('joystick');
const knobEl = document.getElementById('joyKnob');
function setKnob(x, y){ knobEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; }
function resetJoy(){ joy.active=false; joy.pid=null; joy.dx=0; joy.dy=0; setKnob(0,0); }
resetJoy();

function joyDown(e){
  const p = e.changedTouches ? e.changedTouches[0] : e;
  const rect = joyEl.getBoundingClientRect();
  const x = p.clientX, y = p.clientY;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
  joy.active = true;
  joy.pid = p.identifier ?? 'mouse';
  joy.centerX = x;
  joy.centerY = y;
  joyMoveCore(x, y);
  e.preventDefault();
}
function joyMoveCore(x, y){
  const maxR = 42;
  const dx = x - joy.centerX;
  const dy = y - joy.centerY;
  const d = Math.hypot(dx, dy);
  const k = d > maxR ? maxR / d : 1;
  const kx = dx * k;
  const ky = dy * k;
  setKnob(kx, ky);
  joy.dx = kx / maxR;
  joy.dy = ky / maxR;
}
function joyMove(e){
  if (!joy.active) return;
  const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
  const id = joy.pid;
  const p = touches.find(t => (t.identifier ?? 'mouse') === id);
  if (!p) return;
  joyMoveCore(p.clientX, p.clientY);
  e.preventDefault();
}
function joyUp(e){
  if (!joy.active) return;
  const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
  const id = joy.pid;
  const p = touches.find(t => (t.identifier ?? 'mouse') === id);
  if (!p) return;
  resetJoy();
  e.preventDefault();
}
joyEl.addEventListener('touchstart', joyDown, { passive:false });
joyEl.addEventListener('touchmove', joyMove, { passive:false });
joyEl.addEventListener('touchend', joyUp, { passive:false });
joyEl.addEventListener('touchcancel', joyUp, { passive:false });
joyEl.addEventListener('mousedown', (e)=>joyDown(e));
window.addEventListener('mousemove', (e)=>joyMove(e));
window.addEventListener('mouseup', (e)=>joyUp(e));

// Action
const actionEl = document.getElementById('action');
let actionHeld = false;
actionEl.addEventListener('touchstart', (e)=>{ actionHeld=true; actionEl.style.transform='scale(0.98)'; e.preventDefault(); }, { passive:false });
actionEl.addEventListener('touchend', (e)=>{ actionHeld=false; actionEl.style.transform='scale(1)'; doAction(); e.preventDefault(); }, { passive:false });
actionEl.addEventListener('touchcancel', (e)=>{ actionHeld=false; actionEl.style.transform='scale(1)'; e.preventDefault(); }, { passive:false });
actionEl.addEventListener('mousedown', (e)=>{ actionHeld=true; actionEl.style.transform='scale(0.98)'; e.preventDefault(); });
window.addEventListener('mouseup', ()=>{ if(!actionHeld) return; actionHeld=false; actionEl.style.transform='scale(1)'; doAction(); });

// Resize
function resize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Camera follow
const cam = {
  offset: new THREE.Vector3(11.5, 14.2, 13.5),
  smooth: 0.09,
  target: new THREE.Vector3(),
  pos: new THREE.Vector3(),
};
function updateCamera(dt){
  cam.target.set(player.position.x, 0.9, player.position.z);
  const desired = cam.target.clone().add(cam.offset);
  cam.pos.lerp(desired, 1 - Math.pow(1-cam.smooth, dt*60));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.target);
}

// Movement & collision
const clock = new THREE.Clock();
const playerSpeed = 4.9;
// Bees should be about as fast as the player
state.wasp.speed = 4.9;

function resolveToIndoor(x,z,oldX,oldZ){
  // keep inside 6.4 radius
  const lim = 6.2;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return {x:oldX, z:oldZ};
  return {x,z};
}

function resolveToLand(x,z,oldX,oldZ){
  if (!onLand(x,z)) return {x:oldX, z:oldZ};
  if (insideAnyPond(x,z)) return {x:oldX, z:oldZ};
  // collision with house
  const hd = Math.sqrt(dist2(x,z, 0,0));
  if (hd < 2.35) return {x:oldX, z:oldZ};
  // collision with trees/rocks (not NPC)
  for (const o of interactables) {
    if (o.type === 'npc' || o.type === 'house') continue;
    const d = Math.sqrt(dist2(x,z, o.x,o.z));
    if (d < (o.r + 0.70)) return {x:oldX, z:oldZ};
  }
  return {x,z};
}

function updateTreeSway(dt){
  for (const o of interactables) {
    if (o.type !== 'tree') continue;
    if (o.sway > 0) {
      o.sway = Math.max(0, o.sway - dt);
      const u = o.obj.userData;
      if (u && u.canopy) {
        const t = (0.75 - o.sway);
        const amp = 0.22 * (o.sway / 0.75);
        u.canopy.rotation.z = Math.sin(t * 18.0) * amp;
        u.canopy.rotation.x = Math.cos(t * 15.0) * amp * 0.5;
      }
    } else {
      const u = o.obj.userData;
      if (u && u.canopy) {
        u.canopy.rotation.z *= 0.85;
        u.canopy.rotation.x *= 0.85;
      }
    }
  }
}

function updatePlayer(dt){
  if (!state.started) return;
  let vx = joy.dx;
  let vz = joy.dy;
  const len = Math.hypot(vx, vz);
  if (len > 1) { vx/=len; vz/=len; }

  if (len > 0.06) player.rotation.y = Math.atan2(vx, vz);

  const dx = vx * playerSpeed * dt;
  const dz = vz * playerSpeed * dt;

  const oldX = player.position.x;
  const oldZ = player.position.z;

  const nx = oldX + dx;
  const nz = oldZ + dz;

  const col = (state.stage==='indoor')
    ? resolveToIndoor(nx,nz,oldX,oldZ)
    : resolveToLand(nx,nz,oldX,oldZ);

  player.position.x = col.x;
  player.position.z = col.z;

  // footprints (only outdoor and on snow)
  fpAcc += dt;
  const moved = Math.hypot(player.position.x - oldX, player.position.z - oldZ);
  if (state.stage==='outdoor' && moved > 0.004 && fpAcc > 0.12) {
    const d2 = dist2(player.position.x, player.position.z, lastFpX, lastFpZ);
    if (d2 > 0.45*0.45) {
      const dir = player.rotation.y;
      const side = ((Math.floor((Date.now()/150))%2)===0) ? -1 : 1;
      const ox = Math.sin(dir) * 0.12 + Math.cos(dir) * 0.10 * side;
      const oz = Math.cos(dir) * 0.12 - Math.sin(dir) * 0.10 * side;
      spawnFootprint(player.position.x - ox, player.position.z - oz, dir);
      lastFpX = player.position.x; lastFpZ = player.position.z;
    }
    fpAcc = 0;
  }
}

function updatePickups(){
  if (state.stage !== 'outdoor') return;
  const px=player.position.x, pz=player.position.z;
  for (let i=pickups.length-1;i>=0;i--) {
    const p=pickups[i];
    const d=Math.sqrt(dist2(px,pz,p.x,p.z));
    if (d < 1.1) {
      invAdd(p.kind, 1);
      outdoorGroup.remove(p.obj);
      pickups.splice(i,1);
      const name = p.kind==='peach'?'桃':p.kind==='apple'?'リンゴ':p.kind==='orange'?'オレンジ':p.kind;
      toast(`${name}を1こ手に入れた！`);
    }
  }
}

function updateNPCs(dt){
  if (state.stage !== 'outdoor') return;
  const px=player.position.x, pz=player.position.z;
  for (const o of interactables) {
    if (o.type !== 'npc') continue;
    if (o.freeze > 0) { o.freeze -= dt; continue; }
    if (o.wait > 0) { o.wait -= dt; continue; }

    const tx=o.target.x, tz=o.target.z;
    const dx=tx-o.x, dz=tz-o.z;
    const d=Math.hypot(dx,dz);
    if (d < 0.35) {
      o.target = pickWanderTarget(px,pz);
      o.wait = randRange(0.4, 1.6);
      continue;
    }
    let nx=dx/d, nz=dz/d;
    const pd = Math.sqrt(dist2(o.x,o.z, px,pz));
    if (pd < 2.0) {
      nx += ((o.x-px)/Math.max(pd,0.001))*0.9;
      nz += ((o.z-pz)/Math.max(pd,0.001))*0.9;
    }
    const vl=Math.hypot(nx,nz);
    if (vl > 0.0001){ nx/=vl; nz/=vl; }

    const step=o.speed*dt;
    const x2=o.x + nx*step;
    const z2=o.z + nz*step;
    if (!onLand(x2,z2) || insideAnyPond(x2,z2)) {
      o.target = pickWanderTarget(px,pz);
      o.wait = randRange(0.3, 1.0);
      continue;
    }
    // avoid house
    if (Math.sqrt(dist2(x2,z2,0,0)) < 2.8) {
      o.target = pickWanderTarget(px,pz);
      o.wait = randRange(0.3, 1.0);
      continue;
    }

    o.x=x2; o.z=z2;
    o.obj.position.x=x2;
    o.obj.position.z=z2;
    o.obj.rotation.y=Math.atan2(nx,nz);
  }
}

// Day/Night
function timePhase(){ const now = new Date(); return now.getHours() + now.getMinutes()/60; }
function updateDayNight(){
  const t = timePhase();
  let sky = SKY.day, amb=0.90, sunI=0.90, sunColor=0xffffff;
  if (t >= 17 && t < 19) { sky=SKY.eve; amb=0.78; sunI=0.82; sunColor=0xfff1e1; }
  else if (t >= 19 || t < 5) { sky=SKY.night; amb=0.58; sunI=0.55; sunColor=0xcad0ff; }
  else if (t >= 5 && t < 7) { sky=SKY.dawn; amb=0.84; sunI=0.86; sunColor=0xf2fff2; }
  scene.background = sky;
  scene.fog.color.copy(sky);
  ambient.intensity = amb;
  sun.intensity = sunI;
  sun.color.setHex(sunColor);
}

// Ocean shimmer
function updateOcean(){
  const t = Date.now() * 0.001;
  ocean.material.roughness = 0.18 + 0.04 * Math.sin(t * 1.2);
  ocean.material.clearcoatRoughness = 0.08 + 0.02 * Math.sin(t * 1.6);
}

// Prevent page scroll
document.addEventListener('touchmove', (e)=>e.preventDefault(), { passive:false });

// Main loop
function loop(){
  const dt = Math.min(clock.getDelta(), 0.033);

  updateTreeSway(dt);
  updatePlayer(dt);
  updateNPCs(dt);
  updatePickups();
  updateParticles(dt);
  updateFootprints(dt);

  // bees only outdoors
  if (state.stage === 'outdoor') updateWasp(dt);

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toastEl.classList.remove('show');
  }

  updateDayNight();
  updateOcean();
  updateCamera(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
setStarted(false);
startBtnEl?.addEventListener('click', () => {
  // 開始時は家の前に必ず置く（後述のスポーン固定と二重で安全）
  player.position.set(0, 0, 3.6);
  player.rotation.y = Math.PI;

  setStarted(true);
});

toast('雪の島へようこそ！木は1回だけ。蜂が出たら家(真ん中)へ！', 3.2)
