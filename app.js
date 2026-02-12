(function () {
  'use strict';

  const VIDEO = document.getElementById('video');
  const CANVAS = document.getElementById('canvas');
  const CAMERA_CONTAINER = document.getElementById('camera-container');
  const RESULT_VALUE = document.getElementById('result-value');
  const RESULT_FORMAT = document.getElementById('result-format');
  const HISTORY_LIST = document.getElementById('history');
  const BTN_TOGGLE = document.getElementById('btn-toggle');
  const BTN_TOGGLE_TEXT = document.getElementById('btn-toggle-text');
  const BTN_CLEAR = document.getElementById('btn-clear-history');
  const BTN_INSTALL = document.getElementById('btn-install');
  const TOAST = document.getElementById('toast');

  const HISTORY_KEY = 'barcode-scanner-history';
  const HISTORY_MAX = 50;

  let stream = null;
  let scanning = false;
  let scanAnimationId = null;
  let quaggaIntervalId = null;
  let lastResult = '';
  let lastResultTime = 0;
  const DEBOUNCE_MS = 1500;
  const QUAGGA_INTERVAL_MS = 400;

  const hasBarcodeDetector = typeof BarcodeDetector !== 'undefined';
  let barcodeDetector = null;
  if (hasBarcodeDetector) {
    try {
      barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf'] });
    } catch (_) {
      barcodeDetector = null;
    }
  }

  function getHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function setHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX)));
    } catch (_) {}
  }

  function addToHistory(value, format) {
    const list = getHistory();
    list.unshift({ value, format, at: Date.now() });
    setHistory(list);
    renderHistory();
  }

  function renderHistory() {
    const list = getHistory();
    HISTORY_LIST.innerHTML = list
      .slice(0, 20)
      .map(
        (item) =>
          `<li><span class="value">${escapeHtml(item.value)}</span><span class="format">${escapeHtml(item.format || '')}</span></li>`
      )
      .join('');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function showToast(message, type = '') {
    TOAST.textContent = message;
    TOAST.className = 'toast show ' + (type ? type : '');
    clearTimeout(TOAST._tid);
    TOAST._tid = setTimeout(() => {
      TOAST.classList.remove('show');
    }, 2500);
  }

  function setResult(value, format) {
    RESULT_VALUE.textContent = value || '—';
    RESULT_FORMAT.textContent = format ? String(format) : '';
    if (value) {
      addToHistory(value, format);
    }
  }

  function detectWithNativeApi(ctx, width, height) {
    if (!barcodeDetector) return Promise.resolve([]);
    return barcodeDetector.detect(CANVAS);
  }

  function drawVideoToCanvas() {
    if (!stream || !VIDEO.videoWidth) return;
    const w = VIDEO.videoWidth;
    const h = VIDEO.videoHeight;
    CANVAS.width = w;
    CANVAS.height = h;
    const ctx = CANVAS.getContext('2d');
    ctx.drawImage(VIDEO, 0, 0, w, h);
    return { ctx, width: w, height: h };
  }

  function tickNative() {
    if (!scanning || !stream) return;
    const drawn = drawVideoToCanvas();
    if (!drawn) {
      scanAnimationId = requestAnimationFrame(tickNative);
      return;
    }
    detectWithNativeApi(drawn.ctx, drawn.width, drawn.height).then((results) => {
      if (!scanning) return;
      if (results.length > 0) {
        const r = results[0];
        const value = r.rawValue || '';
        const format = r.format || '';
        const now = Date.now();
        if (value && now - lastResultTime > DEBOUNCE_MS) {
          lastResultTime = now;
          lastResult = value;
          setResult(value, format);
          showToast('Barcode scanned', 'success');
        }
      }
      scanAnimationId = requestAnimationFrame(tickNative);
    }).catch(() => {
      scanAnimationId = requestAnimationFrame(tickNative);
    });
  }

  function runQuaggaDecode() {
    if (!scanning || !stream || typeof Quagga === 'undefined') return;
    if (!VIDEO.videoWidth) return;
    const w = VIDEO.videoWidth;
    const h = VIDEO.videoHeight;
    CANVAS.width = w;
    CANVAS.height = h;
    const ctx = CANVAS.getContext('2d');
    ctx.drawImage(VIDEO, 0, 0, w, h);
    try {
      const dataUrl = CANVAS.toDataURL('image/jpeg', 0.8);
      Quagga.decodeSingle(
        {
          src: dataUrl,
          locator: { patchSize: 'medium', halfSample: true },
          numOfWorkers: 0,
          decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'code_128_reader', 'code_39_reader'] }
        },
        (err, result) => {
          if (!scanning) return;
          if (err || !result) return;
          const value = result?.codeResult?.code;
          const format = result?.codeResult?.format?.name;
          if (!value) return;
          const now = Date.now();
          if (now - lastResultTime > DEBOUNCE_MS) {
            lastResultTime = now;
            lastResult = value;
            setResult(value, format);
            showToast('Barcode scanned', 'success');
          }
        }
      );
    } catch (_) {}
  }

  function startQuagga() {
    if (typeof Quagga === 'undefined') return;
    quaggaIntervalId = setInterval(runQuaggaDecode, QUAGGA_INTERVAL_MS);
  }

  function stopQuagga() {
    if (quaggaIntervalId != null) {
      clearInterval(quaggaIntervalId);
      quaggaIntervalId = null;
    }
  }

  async function startScanning() {
    if (scanning) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (e) {
      const name = e?.name || '';
      const msg = name === 'NotAllowedError'
        ? 'Camera blocked. Allow camera in browser/site settings and try again.'
        : name === 'NotFoundError'
          ? 'No camera found.'
          : !window.isSecureContext
            ? 'Camera requires HTTPS on mobile. Open this page via an HTTPS URL (see instructions below).'
            : 'Camera access denied or unavailable. Check site permissions.';
      showToast(msg, 'error');
      if (!window.isSecureContext) {
        document.getElementById('https-banner').hidden = false;
      }
      return;
    }

    VIDEO.srcObject = stream;
    VIDEO.muted = true;
    VIDEO.playsInline = true;
    scanning = true;
    BTN_TOGGLE.classList.add('scanning');
    BTN_TOGGLE_TEXT.textContent = 'Stop scanning';

    VIDEO.play().catch(function (e) {
      console.warn('Video play failed', e);
      showToast('Camera preview failed. Try again.', 'error');
    });

    if (barcodeDetector) {
      VIDEO.style.display = 'block';
      CANVAS.hidden = false;
      tickNative();
    } else {
      VIDEO.style.display = 'block';
      startQuagga();
    }
  }

  function stopScanning() {
    scanning = false;
    if (scanAnimationId != null) {
      cancelAnimationFrame(scanAnimationId);
      scanAnimationId = null;
    }
    stopQuagga();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    VIDEO.srcObject = null;
    VIDEO.style.display = 'block';
    CANVAS.hidden = true;
    BTN_TOGGLE.classList.remove('scanning');
    BTN_TOGGLE_TEXT.textContent = 'Start scanning';
  }

  function toggleScanning() {
    if (scanning) stopScanning();
    else startScanning();
  }

  BTN_TOGGLE.addEventListener('click', toggleScanning);
  BTN_CLEAR.addEventListener('click', () => {
    setHistory([]);
    renderHistory();
    setResult('', '');
    showToast('History cleared');
  });

  renderHistory();

  if (!window.isSecureContext) {
    document.getElementById('https-banner').hidden = false;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    BTN_INSTALL.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    BTN_INSTALL.hidden = true;
  });
  BTN_INSTALL.addEventListener('click', () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      BTN_INSTALL.hidden = true;
    });
  });

  if (window.matchMedia('(display-mode: standalone)').matches) {
    BTN_INSTALL.hidden = true;
  }
})();
