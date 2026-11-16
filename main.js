import * as THREE from "three";

const $ = (selector) => document.querySelector(selector);
const loading = $("#loading");
const overlay = $("#overlay");
const overlayTitle = $("#overlay-title");
const overlayCopy = $("#overlay-copy");
const startButton = $("#start-button");
const menuNote = $("#menu-note");
const hud = $("#hud");
const timerElement = $("#timer");
const enemyCountElement = $("#enemy-count");
const healthValueElement = $("#health-value");
const healthFillElement = $("#health-fill");
const ammoValueElement = $("#ammo-value");
const ammoNoteElement = $("#ammo-note");
const hitFlash = $("#hit-flash");
const hitMarker = $("#hit-marker");
const toast = $("#toast");

const ROUND_LENGTH = 90;
const MAGAZINE_SIZE = 12;
const PLAYER_RADIUS = 0.38;
const ARENA_LIMIT = 18;
const PROJECTILE_SPEED = 62;
const BOT_PROJECTILE_SPEED = 30;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$("#game").prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#87969a");
scene.fog = new THREE.Fog("#87969a", 26, 58);

const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 100);
camera.rotation.order = "YXZ";
camera.position.set(0, 1.65, 12);

const ambient = new THREE.HemisphereLight("#d9e3df", "#343b36", 2.1);
scene.add(ambient);

const sun = new THREE.DirectionalLight("#fff1d2", 3.2);
sun.position.set(-8, 16, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
scene.add(sun);

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: "#58645d", roughness: 0.94 }),
  wall: new THREE.MeshStandardMaterial({ color: "#88908a", roughness: 0.9 }),
  wallDark: new THREE.MeshStandardMaterial({ color: "#46514d", roughness: 0.88 }),
  cover: new THREE.MeshStandardMaterial({ color: "#a18a69", roughness: 0.83 }),
  coverDark: new THREE.MeshStandardMaterial({ color: "#65736b", roughness: 0.8 }),
  accent: new THREE.MeshStandardMaterial({ color: "#c8ff6a", roughness: 0.58, emissive: "#30431a" }),
  bot: new THREE.MeshStandardMaterial({ color: "#cf6949", roughness: 0.7 }),
  botDark: new THREE.MeshStandardMaterial({ color: "#403b36", roughness: 0.75 }),
  visor: new THREE.MeshStandardMaterial({ color: "#ffbf78", roughness: 0.4, emissive: "#6d2916" })
};

const obstacles = [];
const obstacleMeshes = [];
const bots = [];
const projectiles = [];
const projectileGeometry = new THREE.CapsuleGeometry(0.045, 0.3, 2, 6);
const projectileMaterials = {
  player: new THREE.MeshBasicMaterial({ color: "#ffe08a" }),
  bot: new THREE.MeshBasicMaterial({ color: "#ff6658" })
};
const keys = new Set();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const worldUp = new THREE.Vector3(0, 1, 0);

let yaw = 0;
let pitch = 0;
let gameState = "menu";
let playerHealth = 100;
let ammo = MAGAZINE_SIZE;
let reserveAmmo = 48;
let roundTime = ROUND_LENGTH;
let fireCooldown = 0;
let reloadTime = 0;
let hitFlashTime = 0;
let toastTime = 0;
let lastFrame = 0;
let locked = false;
let mouseFireHeld = false;

function addBox(name, x, y, z, width, height, depth, material, isObstacle = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (isObstacle) {
    obstacles.push({ x, z, halfX: width / 2, halfZ: depth / 2 });
    obstacleMeshes.push(mesh);
  }
  return mesh;
}

function buildArena() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(40, 40, "#9aa694", "#78847d");
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  addBox("north-wall", 0, 2, -20, 40, 4, 0.8, materials.wallDark);
  addBox("south-wall", 0, 2, 20, 40, 4, 0.8, materials.wallDark);
  addBox("west-wall", -20, 2, 0, 0.8, 4, 40, materials.wallDark);
  addBox("east-wall", 20, 2, 0, 0.8, 4, 40, materials.wallDark);

  addBox("central-cover-left", -3.2, 0.8, 0, 1.3, 1.6, 5.2, materials.cover, true);
  addBox("central-cover-right", 3.2, 0.8, 0, 1.3, 1.6, 5.2, materials.cover, true);
  addBox("north-crate-left", -9, 0.75, -9, 2.8, 1.5, 2.1, materials.coverDark, true);
  addBox("north-crate-right", 8.5, 0.65, -10.5, 2.2, 1.3, 2.5, materials.cover, true);
  addBox("south-crate-left", -9.5, 0.65, 10.5, 2.4, 1.3, 2.2, materials.cover, true);
  addBox("south-crate-right", 9, 0.8, 9.5, 2.8, 1.6, 2.1, materials.coverDark, true);
  addBox("mid-cover-north", 0, 0.55, -8, 4.5, 1.1, 1, materials.wall, true);
  addBox("mid-cover-south", 0, 0.55, 8, 4.5, 1.1, 1, materials.wall, true);

  for (const x of [-14, -7, 0, 7, 14]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.025, 0.8),
      materials.accent
    );
    stripe.position.set(x, 0.025, -19.55);
    scene.add(stripe);
  }

  for (const [x, z] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
    const lamp = new THREE.PointLight("#d6efc4", 12, 10, 2);
    lamp.position.set(x, 3.2, z);
    scene.add(lamp);
    addBox("lamp-post", x, 1.6, z, 0.12, 3.2, 0.12, materials.wallDark);
  }
}

function makeBot(x, z, id) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData.botId = id;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.75, 4, 8), materials.bot);
  body.position.y = 0.82;
  body.castShadow = true;
  body.userData.bot = group;
  group.add(body);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.47, 0.32), materials.botDark);
  vest.position.set(0, 0.88, 0.03);
  vest.castShadow = true;
  vest.userData.bot = group;
  group.add(vest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), materials.botDark);
  head.position.y = 1.6;
  head.castShadow = true;
  head.userData.bot = group;
  group.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.28), materials.visor);
  visor.position.set(0, 1.63, -0.12);
  visor.userData.bot = group;
  group.add(visor);

  group.userData = {
    id,
    health: 100,
    fireCooldown: 1 + Math.random() * 1.2,
    strafe: Math.random() > 0.5 ? 1 : -1,
    strafeChange: 1 + Math.random() * 2
  };
  scene.add(group);
  bots.push(group);
}

function resetBots() {
  for (const bot of bots) scene.remove(bot);
  bots.length = 0;
  makeBot(-12.5, -12, 1);
  makeBot(12.5, -13.5, 2);
  makeBot(0, -16, 3);
}

function hasCollision(x, z, radius = PLAYER_RADIUS) {
  if (Math.abs(x) > ARENA_LIMIT - radius || Math.abs(z) > ARENA_LIMIT - radius) return true;
  return obstacles.some((box) =>
    x + radius > box.x - box.halfX &&
    x - radius < box.x + box.halfX &&
    z + radius > box.z - box.halfZ &&
    z - radius < box.z + box.halfZ
  );
}

function movePlayer(dx, dz) {
  const nextX = camera.position.x + dx;
  if (!hasCollision(nextX, camera.position.z)) camera.position.x = nextX;
  const nextZ = camera.position.z + dz;
  if (!hasCollision(camera.position.x, nextZ)) camera.position.z = nextZ;
}

function hasLineOfSight(from, to) {
  const direction = to.clone().sub(from);
  const distance = direction.length();
  raycaster.set(from, direction.normalize());
  raycaster.far = distance;
  return raycaster.intersectObjects(obstacleMeshes, false).length === 0;
}

function updateBot(bot, delta) {
  const target = new THREE.Vector3(camera.position.x, 0, camera.position.z);
  const direction = target.clone().sub(bot.position);
  const distance = direction.length();
  if (distance < 0.001) return;
  direction.normalize();

  bot.rotation.y = Math.atan2(-direction.x, -direction.z);
  const botData = bot.userData;
  botData.strafeChange -= delta;
  if (botData.strafeChange <= 0) {
    botData.strafe *= -1;
    botData.strafeChange = 1.3 + Math.random() * 2;
  }

  const toPlayer = target.clone().sub(bot.position).normalize();
  const perpendicular = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(botData.strafe);
  const shouldApproach = distance > 7;
  const shouldRetreat = distance < 4.5;
  let moveDirection = new THREE.Vector3();
  if (shouldApproach) moveDirection.add(toPlayer);
  else if (shouldRetreat) moveDirection.sub(toPlayer);
  moveDirection.addScaledVector(perpendicular, distance < 10 ? 0.65 : 0.2);

  if (moveDirection.lengthSq() > 0) {
    moveDirection.normalize();
    const speed = shouldApproach || shouldRetreat ? 2.15 : 1.3;
    const nextX = bot.position.x + moveDirection.x * speed * delta;
    const nextZ = bot.position.z + moveDirection.z * speed * delta;
    const radius = 0.43;

    if (!hasCollision(nextX, bot.position.z, radius)) bot.position.x = nextX;
    if (!hasCollision(bot.position.x, nextZ, radius)) bot.position.z = nextZ;

    if (hasCollision(nextX, bot.position.z, radius) && hasCollision(bot.position.x, nextZ, radius)) {
      botData.strafe *= -1;
    }
  }

  botData.fireCooldown -= delta;
  if (distance < 17 && botData.fireCooldown <= 0) {
    botData.fireCooldown = 0.9 + Math.random() * 0.45;
    const from = bot.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    if (hasLineOfSight(from, camera.position)) {
      const spread = THREE.MathUtils.clamp(distance * 0.012, 0.08, 0.22);
      const target = camera.position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread
      ));
      spawnProjectile(from, target.sub(from).normalize(), "bot", 8, BOT_PROJECTILE_SPEED, 24);
    }
  }
}

function damagePlayer(amount) {
  if (gameState !== "playing") return;
  playerHealth = Math.max(0, playerHealth - amount);
  hitFlashTime = 0.16;
  updateHud();
  if (playerHealth <= 0) endRound(false);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("active");
  toastTime = 1.3;
}

function updateHud() {
  healthValueElement.textContent = String(playerHealth);
  healthFillElement.style.width = `${playerHealth}%`;
  healthFillElement.style.background = playerHealth <= 30 ? "#ff725e" : "";
  ammoValueElement.textContent = String(ammo);
  ammoNoteElement.textContent = reloadTime > 0 ? "重新裝填中…" : "R 重新裝填";
  enemyCountElement.textContent = String(bots.length);
  const seconds = Math.max(0, Math.ceil(roundTime));
  timerElement.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function triggerHitMarker() {
  hitMarker.classList.remove("active");
  void hitMarker.offsetWidth;
  hitMarker.classList.add("active");
}

function spawnProjectile(origin, direction, owner, damage, speed, maxDistance) {
  const mesh = new THREE.Mesh(projectileGeometry, projectileMaterials[owner]);
  mesh.position.copy(origin).addScaledVector(direction, 0.35);
  mesh.quaternion.setFromUnitVectors(worldUp, direction);
  scene.add(mesh);
  projectiles.push({
    mesh,
    direction: direction.clone(),
    owner,
    damage,
    speed,
    maxDistance,
    traveled: 0,
    life: 1.5
  });
}

function damageBot(bot, amount) {
  if (!bots.includes(bot)) return;
  bot.userData.health -= amount;
  triggerHitMarker();
  if (bot.userData.health <= 0) {
    scene.remove(bot);
    bots.splice(bots.indexOf(bot), 1);
    showToast("目標已擊倒");
    updateHud();
    if (bots.length === 0) endRound(true);
  }
}

function removeProjectile(index) {
  scene.remove(projectiles[index].mesh);
  projectiles.splice(index, 1);
}

function clearProjectiles() {
  while (projectiles.length) removeProjectile(projectiles.length - 1);
}

function updateProjectiles(delta) {
  for (let index = projectiles.length - 1; index >= 0 && index < projectiles.length; index -= 1) {
    const projectile = projectiles[index];
    const step = Math.min(projectile.speed * delta, projectile.maxDistance - projectile.traveled);
    raycaster.set(projectile.mesh.position, projectile.direction);
    raycaster.far = step;

    const obstacleHit = raycaster.intersectObjects(obstacleMeshes, false)[0];
    let impactDistance = obstacleHit ? obstacleHit.distance : Infinity;

    if (projectile.owner === "player") {
      const botHit = raycaster.intersectObjects(bots.flatMap((bot) => bot.children), false)[0];
      if (botHit && botHit.distance < impactDistance) {
        damageBot(botHit.object.userData.bot, projectile.damage);
        if (projectiles.includes(projectile)) removeProjectile(projectiles.indexOf(projectile));
        continue;
      }
    } else {
      const toPlayer = camera.position.clone().sub(projectile.mesh.position);
      const closestDistance = THREE.MathUtils.clamp(toPlayer.dot(projectile.direction), 0, step);
      const closestPoint = projectile.mesh.position.clone().addScaledVector(projectile.direction, closestDistance);
      if (closestPoint.distanceToSquared(camera.position) < 0.5 * 0.5 && closestDistance < impactDistance) {
        damagePlayer(projectile.damage);
        if (projectiles.includes(projectile)) removeProjectile(projectiles.indexOf(projectile));
        continue;
      }
    }

    if (obstacleHit) {
      removeProjectile(index);
      continue;
    }

    projectile.mesh.position.addScaledVector(projectile.direction, step);
    projectile.traveled += step;
    projectile.life -= delta;
    if (projectile.life <= 0 || projectile.traveled >= projectile.maxDistance) removeProjectile(index);
  }
}

function shoot() {
  if (gameState !== "playing" || !locked || fireCooldown > 0 || reloadTime > 0) return;
  if (ammo <= 0) {
    mouseFireHeld = false;
    showToast("彈匣已空 — 按 R 重新裝填");
    fireCooldown = 0.25;
    return;
  }

  ammo -= 1;
  fireCooldown = 0.2;
  updateHud();
  raycaster.setFromCamera(center, camera);
  const direction = raycaster.ray.direction.clone();
  spawnProjectile(
    camera.position.clone().addScaledVector(direction, 0.4),
    direction,
    "player",
    34,
    PROJECTILE_SPEED,
    35
  );
}

function reload() {
  if (gameState !== "playing" || reloadTime > 0 || ammo >= MAGAZINE_SIZE || reserveAmmo <= 0) return;
  reloadTime = 1.15;
  ammoNoteElement.textContent = "重新裝填中…";
}

function finishReload() {
  const needed = MAGAZINE_SIZE - ammo;
  const loaded = Math.min(needed, reserveAmmo);
  ammo += loaded;
  reserveAmmo -= loaded;
  reloadTime = 0;
  updateHud();
}

function showOverlay(title, copy, buttonText, note) {
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  startButton.innerHTML = `${buttonText} <span>→</span>`;
  menuNote.textContent = note;
  overlay.classList.remove("hidden");
}

function startRound() {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }
  gameState = "playing";
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
}

function resetRound() {
  for (const bot of bots) scene.remove(bot);
  bots.length = 0;
  clearProjectiles();
  camera.position.set(0, 1.65, 13.5);
  yaw = 0;
  pitch = 0;
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  playerHealth = 100;
  ammo = MAGAZINE_SIZE;
  reserveAmmo = 48;
  roundTime = ROUND_LENGTH;
  fireCooldown = 0;
  reloadTime = 0;
  hitFlashTime = 0;
  hud.classList.add("hidden");
  resetBots();
  updateHud();
  gameState = "menu";
  showOverlay("激情四射", "在限時內擊敗所有敵人。善用掩體，保持移動。", "開始訓練", "建議使用桌面版 Chrome 或 Edge · 點擊後鎖定滑鼠");
}

function endRound(won) {
  if (gameState === "gameover") return;
  gameState = "gameover";
  mouseFireHeld = false;
  clearProjectiles();
  if (document.pointerLockElement) document.exitPointerLock();
  hud.classList.add("hidden");
  showOverlay(
    won ? "訓練完成" : "任務失敗",
    won ? "所有目標已清除，做得好。準備好再來一回合。" : "你已被擊倒或時間用盡。調整位置，再試一次。",
    "再次訓練",
    won ? "目標清除" : "別忘了利用掩體與重新裝填"
  );
}

function handleLockChange() {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked) mouseFireHeld = false;
  if (locked) {
    if (gameState === "menu" || gameState === "paused") {
      gameState = "playing";
      overlay.classList.add("hidden");
      hud.classList.remove("hidden");
    }
    return;
  }

  if (gameState === "playing") {
    gameState = "paused";
    hud.classList.add("hidden");
    showOverlay("訓練暫停", "回合已暫停。準備好後即可繼續。", "繼續訓練", "按 ESC 也可解除滑鼠鎖定");
  }
}

function update(delta) {
  if (hitFlashTime > 0) {
    hitFlashTime -= delta;
    if (hitFlashTime <= 0) hitFlash.classList.remove("active");
  }
  if (toastTime > 0) {
    toastTime -= delta;
    if (toastTime <= 0) toast.classList.remove("active");
  }

  if (gameState !== "playing") return;

  roundTime -= delta;
  fireCooldown = Math.max(0, fireCooldown - delta);
  if (reloadTime > 0) {
    reloadTime -= delta;
    if (reloadTime <= 0) finishReload();
  }
  if (mouseFireHeld) shoot();

  const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const strafe = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  if (forward || strafe) {
    const movement = new THREE.Vector3(strafe, 0, -forward).normalize();
    movement.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const speed = 5.1 * delta;
    movePlayer(movement.x * speed, movement.z * speed);
  }

  for (const bot of [...bots]) updateBot(bot, delta);
  updateProjectiles(delta);
  updateHud();

  if (roundTime <= 0) endRound(false);
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastFrame) / 1000 || 0, 0.05);
  lastFrame = now;
  update(delta);
  renderer.render(scene, camera);
}

function init() {
  buildArena();
  resetBots();
  updateHud();
  loading.classList.add("hidden");
  requestAnimationFrame(animate);

  startButton.addEventListener("click", () => {
    if (gameState === "gameover") resetRound();
    if (gameState === "paused") {
      startRound();
      return;
    }
    startRound();
  });

  renderer.domElement.addEventListener("click", () => {
    if (gameState === "playing" && !locked) renderer.domElement.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", handleLockChange);
  document.addEventListener("pointerlockerror", () => {
    menuNote.textContent = "無法鎖定滑鼠，請使用桌面瀏覽器並透過本機伺服器開啟";
  });

  document.addEventListener("mousemove", (event) => {
    if (!locked || gameState !== "playing") return;
    yaw -= event.movementX * 0.0022;
    pitch -= event.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  });

  document.addEventListener("keydown", (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === "KeyR") reload();
  });

  document.addEventListener("keyup", (event) => keys.delete(event.code));
  document.addEventListener("mousedown", (event) => {
    if (event.button === 0 && gameState === "playing" && locked) {
      mouseFireHeld = true;
      shoot();
    }
  });
  document.addEventListener("mouseup", (event) => {
    if (event.button === 0) mouseFireHeld = false;
  });
  document.addEventListener("contextmenu", (event) => {
    if (gameState === "playing" && locked) event.preventDefault();
  });

  window.addEventListener("blur", () => {
    keys.clear();
    mouseFireHeld = false;
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

try {
  init();
} catch (error) {
  console.error(error);
  loading.classList.remove("hidden");
  loading.classList.add("error");
  loading.textContent = "遊戲載入失敗，請重新整理頁面或檢查網路連線。";
}
