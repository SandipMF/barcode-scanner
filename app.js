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
  const BTN_SAVE = document.getElementById('btn-save');
  const BTN_COPY = document.getElementById('btn-copy');
  const RESULT_ACTIONS = document.getElementById('result-actions');
  const BTN_INSTALL = document.getElementById('btn-install');
  const TOAST = document.getElementById('toast');
  const SCAN_LINE = document.querySelector('.scan-line');
  const SCAN_FRAME = document.querySelector('.scan-frame');

  let pendingResult = null; // Store result before saving to history

  const HISTORY_KEY = 'barcode-scanner-history';
  const HISTORY_MAX = 50;

  let stream = null;
  let scanning = false;
  let scanAnimationId = null;
  let quaggaIntervalId = null;
  let lastResult = '';
  const SCAN_INTERVAL_MS = 150;

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
      pendingResult = { value, format };
      RESULT_ACTIONS.hidden = false;
    } else {
      pendingResult = null;
      RESULT_ACTIONS.hidden = true;
    }
  }

  function saveToHistory() {
    if (pendingResult) {
      addToHistory(pendingResult.value, pendingResult.format);
      showToast('Saved to history', 'success');
      pendingResult = null;
      RESULT_ACTIONS.hidden = true;
    }
  }

  function copyResult() {
    const text = RESULT_VALUE.textContent;
    if (text && text !== '—') {
      navigator.clipboard.writeText(text).then(function() {
        showToast('Copied to clipboard', 'success');
      }).catch(function() {
        showToast('Failed to copy', 'error');
      });
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
        handleDetection(value, format);
      }
      scanAnimationId = requestAnimationFrame(tickNative);
    }).catch(() => {
      scanAnimationId = requestAnimationFrame(tickNative);
    });
  }

  function handleDetection(value, format) {
    if (!value) return;
    lastResult = value;
    setResult(value, format);
    showToast('Barcode detected!', 'success');
    // Vibrate on success if supported
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
    // Stop scanning after detection
    stopScanning();
  }

  function scanWithJsQR(imageData) {
    if (typeof jsQR === 'undefined') return null;
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      if (code && code.data) {
        return { value: code.data, format: 'QR Code' };
      }
    } catch (_) {}
    return null;
  }

  function scanWithQuagga(dataUrl, callback) {
    if (typeof Quagga === 'undefined') {
      callback(null);
      return;
    }
    try {
      Quagga.decodeSingle(
        {
          src: dataUrl,
          locator: { patchSize: 'medium', halfSample: true },
          numOfWorkers: 0,
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
              'code_39_reader',
              'codabar_reader',
              'i2of5_reader'
            ]
          }
        },
        function (result) {
          if (result && result.codeResult && result.codeResult.code) {
            callback({
              value: result.codeResult.code,
              format: result.codeResult.format || '1D Barcode'
            });
          } else {
            callback(null);
          }
        }
      );
    } catch (_) {
      callback(null);
    }
  }

  function runFallbackScan() {
    if (!scanning || !stream) return;
    if (!VIDEO.videoWidth || !VIDEO.videoHeight) return;

    const w = VIDEO.videoWidth;
    const h = VIDEO.videoHeight;
    CANVAS.width = w;
    CANVAS.height = h;
    const ctx = CANVAS.getContext('2d');
    ctx.drawImage(VIDEO, 0, 0, w, h);

    // Try QR code first with jsQR
    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const qrResult = scanWithJsQR(imageData);
      if (qrResult) {
        handleDetection(qrResult.value, qrResult.format);
        return;
      }
    } catch (_) {}

    // Try 1D barcodes with Quagga
    try {
      const dataUrl = CANVAS.toDataURL('image/jpeg', 0.85);
      scanWithQuagga(dataUrl, function (result) {
        if (result) {
          handleDetection(result.value, result.format);
        }
      });
    } catch (_) {}
  }

  function startFallbackScanning() {
    quaggaIntervalId = setInterval(runFallbackScan, SCAN_INTERVAL_MS);
  }

  function stopFallbackScanning() {
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
    VIDEO.setAttribute('autoplay', '');
    VIDEO.setAttribute('muted', '');
    VIDEO.setAttribute('playsinline', '');
    VIDEO.muted = true;
    VIDEO.playsInline = true;
    
    scanning = true;
    BTN_TOGGLE.classList.add('scanning');
    BTN_TOGGLE_TEXT.textContent = 'Stop scanning';
    SCAN_LINE.classList.add('active');
    SCAN_FRAME.classList.add('active');

    // iOS requires waiting for loadedmetadata before play()
    const onCanPlay = function () {
      VIDEO.removeEventListener('loadedmetadata', onCanPlay);
      VIDEO.removeEventListener('canplay', onCanPlay);
      VIDEO.play().then(function () {
        VIDEO.style.display = 'block';
        if (barcodeDetector) {
          CANVAS.hidden = false;
          tickNative();
        } else {
          startFallbackScanning();
        }
      }).catch(function (e) {
        console.warn('Video play failed', e);
        showToast('Camera preview failed. Tap Start again.', 'error');
        stopScanning();
      });
    };

    if (VIDEO.readyState >= 2) {
      onCanPlay();
    } else {
      VIDEO.addEventListener('loadedmetadata', onCanPlay);
      VIDEO.addEventListener('canplay', onCanPlay);
    }
  }

  function stopScanning() {
    scanning = false;
    SCAN_LINE.classList.remove('active');
    SCAN_FRAME.classList.remove('active');
    if (scanAnimationId != null) {
      cancelAnimationFrame(scanAnimationId);
      scanAnimationId = null;
    }
    stopFallbackScanning();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    try { VIDEO.pause(); } catch (_) {}
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
  BTN_SAVE.addEventListener('click', saveToHistory);
  BTN_COPY.addEventListener('click', copyResult);
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
