// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: "", authDomain: "", databaseURL: "", projectId: "",
  storageBucket: "", messagingSenderId: "", appId: ""
};

let db;
let useFirebase = false;

if (firebaseConfig.apiKey && typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  useFirebase = true;
  console.log("Firebase Realtime Sync Enabled!");
}

// --- ADMIN CONFIG ---
const ADMIN_ID = '186';
const AI_MODEL_ID = '052a23d8-d053-4fc6-a23b-4cdbb2f78a45';

const STORAGE_KEYS = {
  SPINS: 'obsidian_spins_v3',
  ROLLS: 'obsidian_rolls_v3',
  EXPOSURES: 'obsidian_exposures_v3',
  WHEEL: 'obsidian_wheel_v3'
};

const DEFAULT_WHEEL = ['edge', 'Walk out nude', 'Cage cock', 'inhale 15 sec', 'send daddy 15', 'Total ruin'];

const appState = {
  currentUser: '',
  isAdmin: false,
  wheelItems: [],
  spins: [],
  rolls: [],
  exposures: []
};

// --- AUDIO ENGINE ---
const AudioEngine = {
  ctx: null,
  muted: true,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(this.ctx.state === 'suspended') this.ctx.resume();
    this.muted = false;
  },
  playTone(freq, type, duration, vol) {
    if (this.muted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },
  tick() { this.playTone(600, 'sine', 0.05, 0.1); },
  clatter() { 
    let delay = 0;
    for(let i=0; i<6; i++) {
      setTimeout(() => this.playTone(400 + Math.random()*300, 'square', 0.05, 0.03), delay);
      delay += 40 + Math.random()*60;
    }
  },
  hum() { this.playTone(45, 'sawtooth', 3.0, 0.08); },
  success() {
     this.playTone(400, 'sine', 0.2, 0.1);
     setTimeout(() => this.playTone(600, 'sine', 0.4, 0.1), 150);
  },
  glitch() { this.playTone(100 + Math.random()*800, 'sawtooth', 0.05, 0.04); }
};

// --- DOM ELEMENTS ---
const elements = {
  loginModal: document.getElementById('login-modal'),
  loginInput: document.getElementById('piggy-id-input'),
  loginBtn: document.getElementById('login-btn'),
  mainHeader: document.getElementById('main-header'),
  mainContent: document.getElementById('main-content'),
  currentUserDisplay: document.getElementById('current-user-display'),
  logoutBtn: document.getElementById('logout-btn'),
  navBtns: document.querySelectorAll('.nav-btn'),
  viewSections: document.querySelectorAll('.view-section'),
  audioToggleBtn: document.getElementById('audio-toggle-btn'),
  audioStatusIcon: document.getElementById('audio-status-icon'),
  
  wheelCanvas: document.getElementById('wheel-canvas'),
  aiSpinBtn: document.getElementById('ai-spin-btn'),
  manualSpinBtn: document.getElementById('manual-spin-btn'),
  wheelResult: document.getElementById('wheel-result'),
  staticWheelList: document.getElementById('static-wheel-list'),
  
  premiumAd: document.getElementById('premium-ad'),
  adminWheelEditor: document.getElementById('admin-wheel-editor'),
  adminWheelList: document.getElementById('admin-wheel-list'),
  adminWheelInput: document.getElementById('admin-wheel-input'),
  adminWheelAddBtn: document.getElementById('admin-wheel-add-btn'),
  
  diceContainer: document.getElementById('dice-container'),
  rollDiceBtn: document.getElementById('roll-dice-btn'),
  diceResultContainer: document.getElementById('dice-result-container'),
  diceNumberDisplay: document.getElementById('dice-number'),
  diceTaskText: document.getElementById('dice-task-text'),
  
  exposureUpload: document.getElementById('exposure-upload'),
  exposureGallery: document.getElementById('exposure-gallery'),
  
  trainerSpinsList: document.getElementById('trainer-spins-list'),
  trainerRollsList: document.getElementById('trainer-rolls-list'),
  refreshTrainerBtn: document.getElementById('refresh-trainer-btn'),
  firebaseWarning: document.getElementById('firebase-warning'),
  adminClearLogsBtn: document.getElementById('admin-clear-logs-btn')
};

let wheelRotation = 0;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  switchTab('wheel-view');
  
  const savedId = sessionStorage.getItem('piggy_id');
  if (savedId) {
    appState.currentUser = savedId;
    await loginUser(savedId, true);
  }
});

function setupEventListeners() {
  elements.loginBtn.addEventListener('click', () => {
    const id = elements.loginInput.value.trim().toUpperCase();
    if (id) loginUser(id, false);
  });
  elements.loginInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.loginBtn.click();
  });
  elements.logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('piggy_id');
    location.reload();
  });

  elements.audioToggleBtn.addEventListener('click', () => {
    AudioEngine.muted = !AudioEngine.muted;
    if (!AudioEngine.muted) {
      AudioEngine.init();
      AudioEngine.success();
    }
    elements.audioStatusIcon.textContent = AudioEngine.muted ? '🔇' : '🔊';
  });

  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      AudioEngine.tick();
      switchTab(btn.target = btn.dataset.target);
    });
  });

  elements.aiSpinBtn.addEventListener('click', aiSpinWheel);
  elements.manualSpinBtn.addEventListener('click', manualSpinWheel);
  
  elements.adminWheelAddBtn.addEventListener('click', addAdminWheelItem);
  elements.adminWheelInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAdminWheelItem();
  });

  elements.rollDiceBtn.addEventListener('click', rollDice);
  elements.exposureUpload.addEventListener('change', handleExposureUpload);
  
  elements.refreshTrainerBtn.addEventListener('click', () => {
    AudioEngine.tick();
    if (!useFirebase) {
      loadData();
      showToast('SYNC COMPLETED (LOCAL)', '#00ffff', 'text-black');
    } else {
      showToast('SYNC COMPLETED (FIREBASE)', '#00ffff', 'text-black');
    }
  });

  elements.adminClearLogsBtn.addEventListener('click', clearLogs);

  // Live progress bar loop
  setInterval(updateExposureBars, 1000);
}

// --- UI Utilities ---
function showToast(message, bgColor, textColor = 'text-white') {
  const toast = document.createElement('div');
  toast.className = `px-4 py-2 rounded font-bold shadow-lg transform transition-all duration-300 translate-y-10 opacity-0 ${textColor} border border-black/50 uppercase tracking-widest text-xs flex items-center gap-2 z-[9999]`;
  toast.style.backgroundColor = bgColor;
  toast.innerHTML = `<span class="w-1.5 h-1.5 bg-current rounded-full animate-ping"></span> ${message}`;
  
  document.getElementById('toast-container').appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));
  
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-10');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function typewrite(element, text, colorClass = 'text-white') {
  element.innerHTML = `<span class="${colorClass} typewriter-cursor"></span>`;
  const cursor = element.querySelector('.typewriter-cursor');
  let currentText = '';
  for(let i=0; i<text.length; i++) {
    currentText += text[i];
    cursor.textContent = currentText;
    if(text[i] !== ' ' && Math.random() > 0.6) AudioEngine.glitch();
    await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
  }
  cursor.classList.remove('typewriter-cursor');
}

// --- Auth & Data Loading ---
async function loginUser(id, isAuto = false) {
  if (!isAuto) {
    AudioEngine.init();
    elements.audioStatusIcon.textContent = '🔊';
  }
  
  appState.currentUser = id;
  appState.isAdmin = (id === ADMIN_ID);
  sessionStorage.setItem('piggy_id', id);
  
  if (appState.isAdmin) {
    elements.currentUserDisplay.innerHTML = `USR: ${id} <span class="bg-bloodred text-white text-[9px] font-black px-1.5 py-0.5 rounded ml-2 uppercase tracking-widest shadow-[0_0_10px_rgba(197,0,26,0.5)]">ROOT</span>`;
    elements.premiumAd.classList.add('hidden');
    elements.adminWheelEditor.classList.remove('hidden');
    elements.adminClearLogsBtn.classList.remove('hidden');
  } else {
    elements.currentUserDisplay.textContent = `USR: ${id}`;
    elements.premiumAd.classList.remove('hidden');
    elements.adminWheelEditor.classList.add('hidden');
    elements.adminClearLogsBtn.classList.add('hidden');
  }
  
  elements.loginModal.classList.replace('flex', 'hidden');
  elements.mainHeader.classList.remove('hidden');
  elements.mainContent.classList.remove('hidden');
  
  await loadData();
}

async function loadData() {
  if (!useFirebase && elements.firebaseWarning) elements.firebaseWarning.classList.remove('hidden');

  if (useFirebase) {
    db.ref('obsidian/wheel').on('value', snap => { appState.wheelItems = snap.val() || DEFAULT_WHEEL; renderWheel(); renderStaticWheelList(); if(appState.isAdmin) renderAdminWheelList(); });
    db.ref('obsidian/spins').on('value', snap => { appState.spins = snap.val() || []; renderTrainerBoard(); });
    db.ref('obsidian/rolls').on('value', snap => { appState.rolls = snap.val() || []; renderTrainerBoard(); });
    db.ref('obsidian/exposures').on('value', snap => { appState.exposures = snap.val() || []; cleanupExposures(); renderExposures(); });
  } else {
    try {
      const [wheelStr, spinsStr, rollsStr, expStr] = await Promise.all([
        window.miniappsAI.storage.getItem(STORAGE_KEYS.WHEEL),
        window.miniappsAI.storage.getItem(STORAGE_KEYS.SPINS),
        window.miniappsAI.storage.getItem(STORAGE_KEYS.ROLLS),
        window.miniappsAI.storage.getItem(STORAGE_KEYS.EXPOSURES)
      ]);
      appState.wheelItems = wheelStr ? JSON.parse(wheelStr) : DEFAULT_WHEEL;
      appState.spins = spinsStr ? JSON.parse(spinsStr) : [];
      appState.rolls = rollsStr ? JSON.parse(rollsStr) : [];
      appState.exposures = expStr ? JSON.parse(expStr) : [];
      cleanupExposures(); renderExposures(); renderTrainerBoard(); renderWheel(); renderStaticWheelList();
      if(appState.isAdmin) renderAdminWheelList();
    } catch (err) { console.error(err); }
  }
}

function cleanupExposures() {
  const now = Date.now();
  const valid = appState.exposures.filter(e => e.expires_at > now);
  if (valid.length !== appState.exposures.length) { appState.exposures = valid; saveExposures(); }
}

async function saveWheel() { useFirebase ? await db.ref('obsidian/wheel').set(appState.wheelItems) : await window.miniappsAI.storage.setItem(STORAGE_KEYS.WHEEL, JSON.stringify(appState.wheelItems)); }
async function saveSpins() { if (appState.spins.length > 250) appState.spins.length = 250; useFirebase ? await db.ref('obsidian/spins').set(appState.spins) : await window.miniappsAI.storage.setItem(STORAGE_KEYS.SPINS, JSON.stringify(appState.spins)); }
async function saveRolls() { if (appState.rolls.length > 250) appState.rolls.length = 250; useFirebase ? await db.ref('obsidian/rolls').set(appState.rolls) : await window.miniappsAI.storage.setItem(STORAGE_KEYS.ROLLS, JSON.stringify(appState.rolls)); }
async function saveExposures() { if (appState.exposures.length > 25) appState.exposures.length = 25; useFirebase ? await db.ref('obsidian/exposures').set(appState.exposures) : await window.miniappsAI.storage.setItem(STORAGE_KEYS.EXPOSURES, JSON.stringify(appState.exposures)); }

function switchTab(targetId) {
  elements.viewSections.forEach(sec => sec.classList.remove('active'));
  const activeSec = document.getElementById(targetId);
  if (activeSec) activeSec.classList.add('active');
  
  elements.navBtns.forEach(btn => {
    const isActive = btn.dataset.target === targetId;
    let colorClass = 'border-bloodred'; let textClass = 'text-bloodred';
    if (targetId === 'dice-view') { colorClass = 'border-neonpurple'; textClass = 'text-neonpurple'; }
    else if (targetId === 'exposure-view') { colorClass = 'border-warningyellow'; textClass = 'text-warningyellow'; }
    else if (targetId === 'trainer-view') { colorClass = 'border-terminalcyan'; textClass = 'text-terminalcyan'; }
    
    btn.className = 'nav-btn pb-1 px-3 whitespace-nowrap transition-colors ' + 
      (isActive ? `${textClass} border-b-2 ${colorClass} font-bold shadow-[0_4px_10px_rgba(0,0,0,0.5)]` : 'text-lightgray hover:text-white');
  });

  if(targetId === 'wheel-view') { renderWheel(); renderStaticWheelList(); }
  if(targetId === 'exposure-view') renderExposures();
  if(targetId === 'trainer-view') renderTrainerBoard();
}

// --- Admin Wheel Logic ---
async function addAdminWheelItem() {
  const text = elements.adminWheelInput.value.trim();
  if (!text) return;
  AudioEngine.tick();
  appState.wheelItems.push(text);
  elements.adminWheelInput.value = '';
  await saveWheel();
  if (!useFirebase) { renderWheel(); renderStaticWheelList(); renderAdminWheelList(); }
  showToast('PARAM APPENDED', '#C5001A');
}

window.removeAdminWheelItem = async function(index) {
  AudioEngine.tick();
  if(appState.wheelItems.length <= 2) { showToast('MINIMUM 2 PARAMS REQUIRED', '#C5001A'); return; }
  appState.wheelItems.splice(index, 1);
  await saveWheel();
  if (!useFirebase) { renderWheel(); renderStaticWheelList(); renderAdminWheelList(); }
};

function renderStaticWheelList() {
  elements.staticWheelList.innerHTML = '';
  appState.wheelItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = "py-1.5 px-2 border-b border-gray-800 text-xs";
    li.innerHTML = `<span class="text-bloodred/60 mr-2">[${index}]</span> ${item}`;
    elements.staticWheelList.appendChild(li);
  });
}

function renderAdminWheelList() {
  elements.adminWheelList.innerHTML = '';
  appState.wheelItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = "py-1.5 px-2 border-b border-bloodred/30 flex justify-between items-center text-xs";
    li.innerHTML = `<span><span class="text-bloodred/60 mr-2">[${index}]</span>${item}</span><button class="text-bloodred hover:text-white font-bold px-2 rounded hover:bg-bloodred/50 transition-colors" onclick="removeAdminWheelItem(${index})">X</button>`;
    elements.adminWheelList.appendChild(li);
  });
}

// --- Wheel Logic ---
function renderWheel() {
  const ctx = elements.wheelCanvas.getContext('2d');
  const items = appState.wheelItems;
  const numItems = items.length;
  if(numItems === 0) return;

  const w = elements.wheelCanvas.width;
  const h = elements.wheelCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2;
  const radius = Math.min(centerX, centerY) - 5;

  ctx.clearRect(0, 0, w, h);
  const sliceAngle = (2 * Math.PI) / numItems;

  for (let i = 0; i < numItems; i++) {
    const startAngle = i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    
    ctx.fillStyle = i % 2 === 0 ? '#111317' : '#C5001A';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    
    let text = items[i];
    if (text.length > 15) text = text.substring(0, 15) + '...';
    ctx.fillText(text, radius - 20, 0);
    ctx.restore();
  }
}

function playWheelTicks(durationMs) {
  let elapsed = 0;
  let delay = 30; 
  const tick = () => {
    if (elapsed >= durationMs) return;
    AudioEngine.tick();
    delay = delay * 1.05;
    elapsed += delay;
    setTimeout(tick, delay);
  };
  tick();
}

function manualSpinWheel() {
  if (appState.wheelItems.length === 0) return;
  AudioEngine.tick();
  elements.aiSpinBtn.disabled = true;
  elements.manualSpinBtn.disabled = true;
  elements.wheelResult.innerHTML = '<span class="text-gray-500 font-mono text-sm uppercase tracking-widest">> EXECUTING...</span>';
  
  const winningIndex = Math.floor(Math.random() * appState.wheelItems.length);
  animateWheelToIndex(winningIndex, appState.wheelItems[winningIndex], false);
}

async function aiSpinWheel() {
  if (appState.wheelItems.length === 0) return;
  AudioEngine.tick();
  
  elements.aiSpinBtn.disabled = true;
  elements.manualSpinBtn.disabled = true;
  elements.wheelResult.innerHTML = '<span class="animate-pulse text-neonpurple font-mono text-sm uppercase tracking-widest">> CRAIG.SYS COMPUTING...</span>';
  
  AudioEngine.hum();

  try {
    const aiResponse = await window.miniappsAI.callModel({
      modelId: AI_MODEL_ID,
      messages: [
        { role: 'system', content: `You are 'CRAIG', a dominant AI. Choose exactly ONE of these wheel outcomes to inflict on the user: ${appState.wheelItems.join(', ')}. Reply ONLY with the exact text of the chosen outcome. No intro.` },
        { role: 'user', content: 'Master, pick my outcome.' }
      ]
    });
    
    let chosen = window.miniappsAI.extractText(aiResponse).trim();
    let winningIndex = appState.wheelItems.indexOf(chosen);
    if (winningIndex === -1) winningIndex = appState.wheelItems.findIndex(i => chosen.toLowerCase().includes(i.toLowerCase()));
    if (winningIndex === -1) { winningIndex = Math.floor(Math.random() * appState.wheelItems.length); chosen = appState.wheelItems[winningIndex]; } 
    else { chosen = appState.wheelItems[winningIndex]; }
    
    animateWheelToIndex(winningIndex, chosen, true);
  } catch (e) {
    console.error(e);
    const fallbackIndex = Math.floor(Math.random() * appState.wheelItems.length);
    animateWheelToIndex(fallbackIndex, appState.wheelItems[fallbackIndex], false);
  }
}

function animateWheelToIndex(index, resultText, isAI) {
  playWheelTicks(3800);
  const sliceAngle = 360 / appState.wheelItems.length;
  const targetSliceStart = index * sliceAngle;
  const randomOffset = Math.random() * (sliceAngle - 10) + 5; 
  const targetPointerAngle = targetSliceStart + randomOffset;
  
  let normalizedRotation = (270 - targetPointerAngle) % 360;
  if (normalizedRotation < 0) normalizedRotation += 360;
  
  const extraRotations = (Math.floor(Math.random() * 3) + 4) * 360; 
  const currentMod = wheelRotation % 360;
  let diff = normalizedRotation - currentMod;
  if (diff < 0) diff += 360;
  
  const totalRotation = wheelRotation + extraRotations + diff;
  elements.wheelCanvas.style.transform = `rotate(${totalRotation}deg)`;
  wheelRotation = totalRotation;
  
  setTimeout(async () => {
    if (isAI) {
      AudioEngine.success();
      elements.wheelResult.innerHTML = `<span class="text-neonpurple drop-shadow-[0_0_8px_rgba(176,38,255,0.8)] font-mono text-sm block mb-1">> SYS.CRAIG:</span> <span id="wheel-ai-text" class="text-white text-xl"></span>`;
      await typewrite(document.getElementById('wheel-ai-text'), resultText, 'text-white font-mono uppercase tracking-wide');
    } else {
      AudioEngine.success();
      elements.wheelResult.innerHTML = `<span class="text-bloodred font-mono text-sm block mb-1">> SYS.MANUAL:</span> <span id="wheel-ai-text" class="text-white text-xl"></span>`;
      await typewrite(document.getElementById('wheel-ai-text'), resultText, 'text-white font-mono uppercase tracking-wide');
    }
    
    appState.spins.unshift({
      id: Date.now().toString(),
      user: appState.currentUser,
      result: resultText,
      isAI: isAI,
      timestamp: Date.now()
    });
    
    await saveSpins();
    showToast('LOG APPENDED', isAI ? '#b026ff' : '#C5001A');
    
    elements.aiSpinBtn.disabled = false;
    elements.manualSpinBtn.disabled = false;
  }, 4000);
}

// --- Dice Logic ---
async function rollDice() {
  AudioEngine.clatter();
  elements.rollDiceBtn.disabled = true;
  elements.diceContainer.classList.add('dice-rolling');
  elements.diceResultContainer.classList.add('hidden');
  elements.diceTaskText.innerHTML = '';
  
  const interval = setInterval(() => {
    elements.diceContainer.textContent = Math.floor(Math.random() * 6) + 1;
    AudioEngine.tick();
  }, 100);

  setTimeout(async () => {
    clearInterval(interval);
    elements.diceContainer.classList.remove('dice-rolling');
    
    const result = Math.floor(Math.random() * 6) + 1;
    elements.diceContainer.textContent = result;
    elements.diceContainer.classList.add('dice-bounce');
    AudioEngine.success();
    
    setTimeout(() => elements.diceContainer.classList.remove('dice-bounce'), 400);

    elements.diceNumberDisplay.textContent = result;
    elements.diceResultContainer.classList.remove('hidden');

    let task = "> NULL. MAINTAIN POSITION.";
    
    if ([3, 5, 6].includes(result)) {
      AudioEngine.hum();
      elements.diceTaskText.innerHTML = '<span class="animate-pulse glitch-text">> UPLINKING TO CRAIG...</span>';
      try {
        const aiResponse = await window.miniappsAI.callModel({
          modelId: AI_MODEL_ID,
          messages: [
            { role: 'system', content: 'You are CRAIG, an intense, strict physical fitness trainer. Respond with a VERY short, commanding physical training task. Max 10 words. No intro.' },
            { role: 'user', content: 'Give task.' }
          ]
        });
        task = "> " + window.miniappsAI.extractText(aiResponse).trim().toUpperCase();
      } catch (e) {
        console.error(e);
        task = '> EXECUTE 20 BURPEES NOW.';
      }
    }
    
    await typewrite(elements.diceTaskText, task, 'text-lightgray');
    
    appState.rolls.unshift({
      id: Date.now().toString(),
      user: appState.currentUser,
      result: result,
      task: task,
      timestamp: Date.now()
    });
    
    await saveRolls();
    showToast('LOG APPENDED', '#b026ff');
    elements.rollDiceBtn.disabled = false;
  }, 1500);
}

// --- Exposure Logic ---
function handleExposureUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  AudioEngine.tick();
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = async function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 400;
      let width = img.width; let height = img.height;
      if (width > height) { if (width > MAX_SIZE) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; } } 
      else { if (height > MAX_SIZE) { width = Math.round((width * MAX_SIZE) / height); height = MAX_SIZE; } }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      appState.exposures = appState.exposures.filter(exp => exp.user !== appState.currentUser);
      
      appState.exposures.unshift({
        id: Date.now().toString(),
        user: appState.currentUser,
        image_url: dataUrl,
        expires_at: Date.now() + 3600000, 
        timestamp: Date.now()
      });
      
      await saveExposures();
      if (!useFirebase) renderExposures();
      showToast('EVIDENCE LOGGED', '#ffea00', 'text-black');
      AudioEngine.success();
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function renderExposures() {
  elements.exposureGallery.innerHTML = '';
  const now = Date.now();
  if (appState.exposures.length === 0) {
    elements.exposureGallery.innerHTML = '<p class="col-span-full text-center text-warningyellow/40 py-10 font-mono text-sm">> NO ACTIVE EVIDENCE.</p>';
    return;
  }
  
  appState.exposures.forEach(exp => {
    const timeLeft = exp.expires_at - now;
    if(timeLeft <= 0) return;
    const minutesLeft = Math.ceil(timeLeft / 60000);
    
    const div = document.createElement('div');
    div.className = 'bg-obsidian border border-warningyellow/30 rounded overflow-hidden shadow-[0_0_20px_rgba(255,234,0,0.1)] group relative flex flex-col p-3';
    
    div.innerHTML = `
      <div class="h-64 w-full bg-black relative cursor-zoom-in rounded border border-warningyellow/20 overflow-hidden" onclick="showFullscreenImage('${exp.image_url}')">
        <div class="absolute inset-0 bg-warningyellow/5 mix-blend-overlay pointer-events-none z-10 crt-overlay"></div>
        <img src="${exp.image_url}" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-300 grayscale hover:grayscale-0 scale-100 group-hover:scale-105">
        <div class="absolute top-2 left-2 bg-black/90 px-2 py-1 rounded-sm text-[10px] font-black text-warningyellow border border-warningyellow/30 font-mono z-20">@${exp.user}</div>
        <div class="absolute top-2 right-2 bg-warningyellow/90 px-2 py-1 rounded-sm text-[10px] font-black text-black shadow-lg shadow-black/50 font-mono z-20"><span class="timer-text">${minutesLeft}m</span> REMAINING</div>
      </div>
      
      <div class="mt-3 h-1.5 bg-black w-full rounded-full overflow-hidden border border-warningyellow/20 relative">
        <div class="h-full bg-warningyellow progress-bar-fill shadow-[0_0_10px_#ffea00]" data-expires="${exp.expires_at}" data-created="${exp.timestamp}"></div>
      </div>

      <div class="mt-3 flex justify-between items-center bg-darkgray/40 rounded px-2 py-1.5 border border-warningyellow/10">
        <span class="text-[10px] text-warningyellow/60 font-mono">${new Date(exp.timestamp).toLocaleTimeString()}</span>
        <div class="flex gap-2">
          ${appState.isAdmin ? `<button class="bg-bloodred/10 hover:bg-bloodred text-bloodred hover:text-white border border-bloodred/50 text-[10px] px-2 py-1 rounded-sm transition-colors font-mono" onclick="deleteExposure('${exp.id}')">[DEL]</button>` : ''}
          <button class="bg-warningyellow/10 hover:bg-warningyellow text-warningyellow hover:text-black border border-warningyellow/50 text-[10px] px-2 py-1 rounded-sm transition-colors uppercase tracking-widest font-bold font-mono" onclick="boostExposure('${exp.id}')">[+10M]</button>
        </div>
      </div>
    `;
    elements.exposureGallery.appendChild(div);
  });
  updateExposureBars(); // initial set
}

function updateExposureBars() {
  const now = Date.now();
  document.querySelectorAll('.progress-bar-fill').forEach(bar => {
    const expires = parseInt(bar.dataset.expires);
    const created = parseInt(bar.dataset.created);
    const total = expires - created;
    const left = expires - now;
    let pct = Math.max(0, Math.min(100, (left / total) * 100));
    bar.style.width = pct + '%';
    
    if(pct < 15) {
      bar.classList.replace('bg-warningyellow', 'bg-bloodred');
      bar.classList.replace('shadow-[0_0_10px_#ffea00]', 'shadow-[0_0_10px_#C5001A]');
    }
  });
}

window.boostExposure = async function(id) {
  AudioEngine.tick();
  const exp = appState.exposures.find(e => e.id === id);
  if (exp) {
    exp.expires_at += 600000; 
    await saveExposures();
    if (!useFirebase) renderExposures();
    showToast('TIME EXTENDED', '#ffea00', 'text-black');
  }
};

window.deleteExposure = async function(id) {
  if(!appState.isAdmin) return;
  AudioEngine.tick();
  appState.exposures = appState.exposures.filter(e => e.id !== id);
  await saveExposures();
  if (!useFirebase) renderExposures();
  showToast('EVIDENCE PURGED', '#C5001A');
};

window.showFullscreenImage = function(url) {
  AudioEngine.tick();
  document.getElementById('fullscreen-image').src = url;
  document.getElementById('image-modal').classList.replace('hidden', 'flex');
};

// --- Trainer Logic ---
window.clearLogs = async function() {
  if(!appState.isAdmin) return;
  if(!confirm('PURGE ALL LOGS?')) return;
  AudioEngine.tick();
  
  appState.spins = [];
  appState.rolls = [];
  await saveSpins();
  await saveRolls();
  
  if (!useFirebase) renderTrainerBoard();
  showToast('LOGS PURGED', '#C5001A');
};

function renderTrainerBoard() {
  elements.trainerSpinsList.innerHTML = '';
  if(appState.spins.length === 0) {
    elements.trainerSpinsList.innerHTML = '<p class="text-terminalcyan/40 text-xs">> NO DATA.</p>';
  } else {
    appState.spins.forEach(s => {
      const li = document.createElement('li');
      li.className = `bg-obsidian/80 p-2.5 rounded border-l-2 ${s.isAI ? 'border-neonpurple' : 'border-terminalcyan'} flex justify-between items-center border border-gray-800`;
      li.innerHTML = `
        <div class="flex flex-col">
          <span class="font-bold ${s.isAI ? 'text-neonpurple' : 'text-terminalcyan'} text-[10px] tracking-widest">> USR:${s.user} ${s.isAI ? '[AI]' : ''}</span>
          <span class="text-[9px] ${s.isAI ? 'text-neonpurple/50' : 'text-terminalcyan/50'}">${new Date(s.timestamp).toLocaleTimeString()}</span>
        </div>
        <span class="text-white font-bold break-words max-w-[50%] text-right text-xs">${s.result}</span>
      `;
      elements.trainerSpinsList.appendChild(li);
    });
  }

  elements.trainerRollsList.innerHTML = '';
  if(appState.rolls.length === 0) {
    elements.trainerRollsList.innerHTML = '<p class="text-terminalcyan/40 text-xs">> NO DATA.</p>';
  } else {
    appState.rolls.forEach(r => {
      const li = document.createElement('li');
      li.className = 'bg-obsidian/80 p-2.5 rounded border-l-2 border-terminalcyan border border-gray-800 mb-2';
      const isTask = r.task && r.task !== '> NULL. MAINTAIN POSITION.';
      li.innerHTML = `
        <div class="flex justify-between items-start mb-1.5">
          <div class="flex flex-col">
            <span class="font-bold text-terminalcyan text-[10px] tracking-widest">> USR:${r.user}</span>
            <span class="text-[9px] text-terminalcyan/50">${new Date(r.timestamp).toLocaleTimeString()}</span>
          </div>
          <span class="bg-darkgray border border-terminalcyan/50 text-terminalcyan w-6 h-6 flex items-center justify-center font-black rounded-sm text-xs">${r.result}</span>
        </div>
        <div class="bg-black/50 p-1.5 rounded text-[10px] ${isTask ? 'text-white border border-terminalcyan/20' : 'text-terminalcyan/40'}">
          ${r.task}
        </div>
      `;
      elements.trainerRollsList.appendChild(li);
    });
  }
}