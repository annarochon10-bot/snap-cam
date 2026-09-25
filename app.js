(() => {
  'use strict';

  // ---------- Elements ----------
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const videoWrap = document.getElementById('video-wrap');
  const recordGlow = document.getElementById('record-glow');
  const flashEl = document.getElementById('flash-flash');
  const hint = document.getElementById('hint');

  const flipBtn = document.getElementById('flip-btn');
  const switchCameraBtn = document.getElementById('switch-camera-btn');
  const captureBtn = document.getElementById('capture-btn');
  const memoriesBtn = document.getElementById('memories-btn');
  const memoriesThumb = document.getElementById('memories-thumb');

  const cameraScreen = document.getElementById('camera-screen');
  const memoriesScreen = document.getElementById('memories-screen');
  const viewerScreen = document.getElementById('viewer-screen');
  const permissionScreen = document.getElementById('permission-screen');
  const permissionText = document.getElementById('permission-text');
  const permissionRetryBtn = document.getElementById('permission-retry-btn');

  const memoriesGrid = document.getElementById('memories-grid');
  const memoriesEmpty = document.getElementById('memories-empty');
  const memoriesCount = document.getElementById('memories-count');
  const closeMemoriesBtn = document.getElementById('close-memories-btn');

  const viewerContent = document.getElementById('viewer-content');
  const viewerCloseBtn = document.getElementById('viewer-close-btn');
  const viewerSaveBtn = document.getElementById('viewer-save-btn');
  const viewerDeleteBtn = document.getElementById('viewer-delete-btn');

  // ---------- State ----------
  let currentStream = null;
  let facing = 'user'; // 'user' = front, 'environment' = back
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let holdTimer = null;
  let pressStartTime = 0;
  let longPressFired = false;
  let currentViewerId = null;

  // ---------- IndexedDB ----------
  const DB_NAME = 'phantomcam';
  const STORE = 'memories';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function addMemory(blob, type, mime) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const rec = { type, mime, blob, createdAt: Date.now() };
      const req = store.add(rec);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllMemories() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function getMemory(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteMemory(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- Camera ----------
  async function startCamera(preferredFacing) {
    stopStream();
    const constraintsList = [
      { video: { facingMode: { exact: preferredFacing } }, audio: true },
      { video: { facingMode: preferredFacing }, audio: true },
      { video: true, audio: true },
    ];
    let lastErr = null;
    for (const constraints of constraintsList) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;
        video.classList.toggle('mirrored', preferredFacing === 'user');
        showScreen('camera');
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    handleCameraError(lastErr);
  }

  function stopStream() {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
  }

  function handleCameraError(err) {
    console.error('Camera error', err);
    let msg = "Autorise l'accès à la caméra et au micro pour utiliser Phantom Cam.";
    if (err && err.name === 'NotAllowedError') {
      msg = "L'accès à la caméra a été refusé. Autorise-le dans les réglages de ton navigateur puis réessaie.";
    } else if (err && err.name === 'NotFoundError') {
      msg = "Aucune caméra n'a été trouvée sur cet appareil.";
    } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      msg = "La caméra nécessite une connexion sécurisée (https://).";
    }
    permissionText.textContent = msg;
    showScreen('permission');
  }

  async function flipCamera() {
    facing = facing === 'user' ? 'environment' : 'user';
    flipBtn.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }],
      { duration: 320, easing: 'ease' }
    );
    await startCamera(facing);
  }

  // ---------- Double tap to flip ----------
  let lastTapTime = 0;
  let lastTapX = 0, lastTapY = 0;
  videoWrap.addEventListener('touchend', (e) => {
    if (isRecording) return;
    const now = Date.now();
    const touch = e.changedTouches[0];
    const dx = touch ? Math.abs(touch.clientX - lastTapX) : 0;
    const dy = touch ? Math.abs(touch.clientY - lastTapY) : 0;
    if (now - lastTapTime < 300 && dx < 40 && dy < 40) {
      flipCamera();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      if (touch) { lastTapX = touch.clientX; lastTapY = touch.clientY; }
    }
  });
  // Desktop fallback
  videoWrap.addEventListener('dblclick', () => { if (!isRecording) flipCamera(); });

  flipBtn.addEventListener('click', () => { if (!isRecording) flipCamera(); });
  switchCameraBtn.addEventListener('click', () => { if (!isRecording) flipCamera(); });

  // ---------- Capture button: tap = photo, hold = video ----------
  const HOLD_THRESHOLD = 280;

  function onPressStart(e) {
    e.preventDefault();
    if (captureBtn.setPointerCapture && e.pointerId != null) {
      try { captureBtn.setPointerCapture(e.pointerId); } catch (_) {}
    }
    captureBtn.classList.add('pressed');
    pressStartTime = Date.now();
    longPressFired = false;
    hint.classList.add('hidden');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      longPressFired = true;
      startRecording();
    }, HOLD_THRESHOLD);
  }

  function onPressEnd(e) {
    captureBtn.classList.remove('pressed');
    clearTimeout(holdTimer);
    if (isRecording) {
      stopRecording();
    } else if (!longPressFired) {
      takePhoto();
    }
  }

  captureBtn.addEventListener('pointerdown', onPressStart);
  captureBtn.addEventListener('pointerup', onPressEnd);
  captureBtn.addEventListener('pointercancel', onPressEnd);
  captureBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Photo capture ----------
  async function takePhoto() {
    if (!video.videoWidth) return;
    flashEl.classList.remove('flashing');
    void flashEl.offsetWidth;
    flashEl.classList.add('flashing');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.save();
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await addMemory(blob, 'photo', 'image/jpeg');
      refreshMemoriesThumb();
    }, 'image/jpeg', 0.92);
  }

  // ---------- Video recording ----------
  function pickMimeType() {
    const candidates = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const type of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  function startRecording() {
    if (!currentStream || isRecording) return;
    const mimeType = pickMimeType();
    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(currentStream, { mimeType })
        : new MediaRecorder(currentStream);
    } catch (err) {
      console.error('MediaRecorder init failed', err);
      return;
    }
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const type = mediaRecorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunks, { type });
      recordedChunks = [];
      if (blob.size > 0) {
        await addMemory(blob, 'video', type);
        refreshMemoriesThumb();
      }
    };
    mediaRecorder.start();
    isRecording = true;
    captureBtn.classList.add('recording');
    recordGlow.classList.add('on');
    if (navigator.vibrate) navigator.vibrate(20);
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    captureBtn.classList.remove('recording');
    recordGlow.classList.remove('on');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  // ---------- Screens ----------
  function showScreen(name) {
    [cameraScreen, memoriesScreen, viewerScreen, permissionScreen].forEach((s) => s.classList.remove('active'));
    const map = { camera: cameraScreen, memories: memoriesScreen, viewer: viewerScreen, permission: permissionScreen };
    map[name].classList.add('active');
  }

  // ---------- Memories UI ----------
  const objectUrls = new Set();
  function makeUrl(blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  }

  async function refreshMemoriesThumb() {
    const all = await getAllMemories();
    memoriesThumb.innerHTML = '';
    if (all.length === 0) {
      memoriesThumb.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zM11 12l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>';
      return;
    }
    const latest = all[0];
    const url = makeUrl(latest.blob);
    if (latest.type === 'photo') {
      const img = document.createElement('img');
      img.src = url;
      memoriesThumb.appendChild(img);
    } else {
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      memoriesThumb.appendChild(v);
    }
  }

  async function openMemories() {
    showScreen('memories');
    const all = await getAllMemories();
    memoriesCount.textContent = all.length ? `${all.length}` : '';
    memoriesGrid.innerHTML = '';
    memoriesEmpty.hidden = all.length !== 0;
    for (const item of all) {
      const tile = document.createElement('div');
      tile.className = 'memory-tile';
      tile.dataset.id = item.id;
      const url = makeUrl(item.blob);
      if (item.type === 'photo') {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        tile.appendChild(img);
      } else {
        const v = document.createElement('video');
        v.src = url;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'metadata';
        tile.appendChild(v);
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.innerHTML = '▶';
        tile.appendChild(badge);
      }
      tile.addEventListener('click', () => openViewer(item.id));
      memoriesGrid.appendChild(tile);
    }
  }

  async function openViewer(id) {
    currentViewerId = id;
    const item = await getMemory(id);
    if (!item) return;
    viewerContent.innerHTML = '';
    const url = makeUrl(item.blob);
    if (item.type === 'photo') {
      const img = document.createElement('img');
      img.src = url;
      viewerContent.appendChild(img);
    } else {
      const v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.playsInline = true;
      v.autoplay = true;
      v.loop = true;
      viewerContent.appendChild(v);
    }
    showScreen('viewer');
  }

  viewerSaveBtn.addEventListener('click', async () => {
    if (currentViewerId == null) return;
    const item = await getMemory(currentViewerId);
    if (!item) return;
    const ext = item.type === 'photo' ? 'jpg' : (item.mime.includes('mp4') ? 'mp4' : 'webm');
    const filename = `phantomcam-${item.createdAt}.${ext}`;

    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([item.blob], filename, { type: item.mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (_) { /* fall through to download */ }
    }
    const a = document.createElement('a');
    a.href = makeUrl(item.blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  viewerDeleteBtn.addEventListener('click', async () => {
    if (currentViewerId == null) return;
    await deleteMemory(currentViewerId);
    currentViewerId = null;
    showScreen('memories');
    openMemories();
    refreshMemoriesThumb();
  });

  viewerCloseBtn.addEventListener('click', () => {
    currentViewerId = null;
    showScreen('memories');
  });

  memoriesBtn.addEventListener('click', openMemories);
  closeMemoriesBtn.addEventListener('click', () => showScreen('camera'));
  permissionRetryBtn.addEventListener('click', () => startCamera(facing));

  // Hide hint after a while
  setTimeout(() => hint.classList.add('hidden'), 4500);

  // ---------- Init ----------
  window.addEventListener('beforeunload', () => {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
  });

  (async function init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      handleCameraError({ name: 'NotSupported' });
      return;
    }
    await startCamera(facing);
    refreshMemoriesThumb();
  })();
})();
