/**
 * Barcode Scanner PWA - Main Application
 * 
 * A Progressive Web App for scanning barcodes and QR codes using the device camera.
 * Supports native BarcodeDetector API with fallback to jsQR and Quagga libraries.
 * 
 * Features:
 * - QR code and 1D barcode scanning
 * - History management with localStorage
 * - Copy to clipboard functionality
 * - PWA installation support
 * - Offline capability via service worker
 */

(function () {
  'use strict';

  // ==========================================================================
  // DOM ELEMENTS
  // ==========================================================================

  const VIDEO = document.getElementById('video');                    // Camera video feed
  const CANVAS = document.getElementById('canvas');                  // Hidden canvas for frame capture
  const CAMERA_CONTAINER = document.getElementById('camera-container');
  const RESULT_VALUE = document.getElementById('result-value');      // Displays scanned value
  const RESULT_FORMAT = document.getElementById('result-format');    // Displays barcode format
  const HISTORY_LIST = document.getElementById('history');           // History list container
  const BTN_TOGGLE = document.getElementById('btn-toggle');          // Start/Stop button
  const BTN_TOGGLE_TEXT = document.getElementById('btn-toggle-text');
  const BTN_CLEAR = document.getElementById('btn-clear-history');    // Clear history button
  const BTN_SAVE = document.getElementById('btn-save');              // Save to history button
  const BTN_COPY = document.getElementById('btn-copy');              // Copy to clipboard button
  const RESULT_ACTIONS = document.getElementById('result-actions');  // Action buttons container
  const BTN_INSTALL = document.getElementById('btn-install');        // PWA install button
  const TOAST = document.getElementById('toast');                    // Toast notification element
  const SCAN_LINE = document.querySelector('.scan-line');            // Animated scan line
  const SCAN_FRAME = document.querySelector('.scan-frame');          // Scan area frame

  // ==========================================================================
  // CONFIGURATION & STATE
  // ==========================================================================

  const HISTORY_KEY = 'barcode-scanner-history';  // localStorage key for history
  const HISTORY_MAX = 50;                          // Maximum history items to store
  const SCAN_INTERVAL_MS = 150;                    // Fallback scan interval (ms)

  let stream = null;              // MediaStream from camera
  let scanning = false;           // Whether currently scanning
  let scanAnimationId = null;     // requestAnimationFrame ID for native scanning
  let quaggaIntervalId = null;    // setInterval ID for fallback scanning
  let lastResult = '';            // Last scanned result
  let pendingResult = null;       // Result waiting to be saved to history

  // ==========================================================================
  // BARCODE DETECTOR SETUP
  // ==========================================================================

  /**
   * Check if native BarcodeDetector API is available.
   * Supported in Chrome/Edge on Android and desktop.
   * Not supported in Safari/Firefox (falls back to jsQR + Quagga).
   */
  const hasBarcodeDetector = typeof BarcodeDetector !== 'undefined';
  let barcodeDetector = null;

  if (hasBarcodeDetector) {
    try {
      // Initialize with supported barcode formats
      barcodeDetector = new BarcodeDetector({
        formats: [
          'qr_code',    // QR codes
          'ean_13',     // EAN-13 (international product codes)
          'ean_8',      // EAN-8 (compact product codes)
          'upc_a',      // UPC-A (US/Canada product codes)
          'upc_e',      // UPC-E (compressed UPC)
          'code_128',   // Code 128 (alphanumeric)
          'code_39',    // Code 39 (alphanumeric uppercase)
          'codabar',    // Codabar (libraries, blood banks)
          'itf'         // ITF / Interleaved 2 of 5
        ]
      });
    } catch (_) {
      barcodeDetector = null;
    }
  }

  // ==========================================================================
  // HISTORY MANAGEMENT
  // ==========================================================================

  /**
   * Get scan history from localStorage
   * @returns {Array} Array of history items {value, format, at}
   */
  function getHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save history to localStorage
   * @param {Array} list - Array of history items
   */
  function setHistory(list) {
    try {
      // Keep only the most recent items up to HISTORY_MAX
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX)));
    } catch (_) {}
  }

  /**
   * Add a new item to history
   * @param {string} value - Scanned barcode value
   * @param {string} format - Barcode format (e.g., 'QR Code', 'EAN-13')
   */
  function addToHistory(value, format) {
    const list = getHistory();
    list.unshift({ value, format, at: Date.now() });
    setHistory(list);
    renderHistory();
  }

  /**
   * Render history list in the DOM
   */
  function renderHistory() {
    const list = getHistory();
    HISTORY_LIST.innerHTML = list
      .slice(0, 20) // Show only last 20 items
      .map(
        (item) =>
          `<li><span class="value">${escapeHtml(item.value)}</span><span class="format">${escapeHtml(item.format || '')}</span></li>`
      )
      .join('');
  }

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} s - String to escape
   * @returns {string} Escaped string
   */
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - Toast type: 'success', 'error', or '' (default)
   */
  function showToast(message, type = '') {
    TOAST.textContent = message;
    TOAST.className = 'toast show ' + (type ? type : '');
    clearTimeout(TOAST._tid);
    TOAST._tid = setTimeout(() => {
      TOAST.classList.remove('show');
    }, 2500);
  }

  // ==========================================================================
  // RESULT HANDLING
  // ==========================================================================

  /**
   * Display scan result and show action buttons
   * @param {string} value - Scanned value
   * @param {string} format - Barcode format
   */
  function setResult(value, format) {
    RESULT_VALUE.textContent = value || '—';
    RESULT_FORMAT.textContent = format ? String(format) : '';
    
    if (value) {
      // Store result for manual save
      pendingResult = { value, format };
      RESULT_ACTIONS.hidden = false;
    } else {
      pendingResult = null;
      RESULT_ACTIONS.hidden = true;
    }
  }

  /**
   * Save pending result to history
   */
  function saveToHistory() {
    if (pendingResult) {
      addToHistory(pendingResult.value, pendingResult.format);
      showToast('Saved to history', 'success');
      pendingResult = null;
      RESULT_ACTIONS.hidden = true;
    }
  }

  /**
   * Copy current result to clipboard
   */
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

  /**
   * Handle successful barcode detection
   * @param {string} value - Decoded barcode value
   * @param {string} format - Barcode format
   */
  function handleDetection(value, format) {
    if (!value) return;
    
    lastResult = value;
    setResult(value, format);
    showToast('Barcode detected!', 'success');
    
    // Vibrate on success if supported (mobile)
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
    
    // Stop scanning after detection
    stopScanning();
  }

  // ==========================================================================
  // NATIVE BARCODE DETECTOR (Chrome/Edge)
  // ==========================================================================

  /**
   * Detect barcodes using native BarcodeDetector API
   * @returns {Promise<Array>} Array of detected barcodes
   */
  function detectWithNativeApi() {
    if (!barcodeDetector) return Promise.resolve([]);
    return barcodeDetector.detect(CANVAS);
  }

  /**
   * Draw current video frame to canvas for processing
   * @returns {Object|undefined} Canvas context and dimensions, or undefined if not ready
   */
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

  /**
   * Continuous scanning loop using native BarcodeDetector
   * Uses requestAnimationFrame for smooth performance
   */
  function tickNative() {
    if (!scanning || !stream) return;
    
    const drawn = drawVideoToCanvas();
    if (!drawn) {
      scanAnimationId = requestAnimationFrame(tickNative);
      return;
    }
    
    detectWithNativeApi().then((results) => {
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

  // ==========================================================================
  // FALLBACK SCANNING (jsQR + Quagga for Safari/Firefox)
  // ==========================================================================

  /**
   * Scan for QR codes using jsQR library
   * @param {ImageData} imageData - Canvas image data
   * @returns {Object|null} Detected QR code {value, format} or null
   */
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

  /**
   * Scan for 1D barcodes using Quagga library
   * @param {string} dataUrl - Canvas data URL (JPEG)
   * @param {Function} callback - Callback with result {value, format} or null
   */
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
          numOfWorkers: 0, // Use main thread (required for decodeSingle)
          decoder: {
            readers: [
              'ean_reader',      // EAN-13
              'ean_8_reader',    // EAN-8
              'upc_reader',      // UPC-A
              'upc_e_reader',    // UPC-E
              'code_128_reader', // Code 128
              'code_39_reader',  // Code 39
              'codabar_reader',  // Codabar
              'i2of5_reader'     // ITF / Interleaved 2 of 5
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

  /**
   * Run one iteration of fallback scanning
   * Tries QR code detection first, then 1D barcode detection
   */
  function runFallbackScan() {
    if (!scanning || !stream) return;
    if (!VIDEO.videoWidth || !VIDEO.videoHeight) return;

    // Draw current frame to canvas
    const w = VIDEO.videoWidth;
    const h = VIDEO.videoHeight;
    CANVAS.width = w;
    CANVAS.height = h;
    const ctx = CANVAS.getContext('2d');
    ctx.drawImage(VIDEO, 0, 0, w, h);

    // Try QR code detection first (faster)
    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const qrResult = scanWithJsQR(imageData);
      if (qrResult) {
        handleDetection(qrResult.value, qrResult.format);
        return;
      }
    } catch (_) {}

    // Try 1D barcode detection with Quagga
    try {
      const dataUrl = CANVAS.toDataURL('image/jpeg', 0.85);
      scanWithQuagga(dataUrl, function (result) {
        if (result) {
          handleDetection(result.value, result.format);
        }
      });
    } catch (_) {}
  }

  /**
   * Start fallback scanning using setInterval
   */
  function startFallbackScanning() {
    quaggaIntervalId = setInterval(runFallbackScan, SCAN_INTERVAL_MS);
  }

  /**
   * Stop fallback scanning
   */
  function stopFallbackScanning() {
    if (quaggaIntervalId != null) {
      clearInterval(quaggaIntervalId);
      quaggaIntervalId = null;
    }
  }

  // ==========================================================================
  // CAMERA CONTROL
  // ==========================================================================

  /**
   * Start camera and begin scanning
   */
  async function startScanning() {
    if (scanning) return;
    
    // Request camera access
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch (e) {
      // Handle camera access errors
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

    // Attach stream to video element
    VIDEO.srcObject = stream;
    VIDEO.setAttribute('autoplay', '');
    VIDEO.setAttribute('muted', '');
    VIDEO.setAttribute('playsinline', '');
    VIDEO.muted = true;
    VIDEO.playsInline = true;
    
    // Update UI state
    scanning = true;
    BTN_TOGGLE.classList.add('scanning');
    BTN_TOGGLE_TEXT.textContent = 'Stop scanning';
    SCAN_LINE.classList.add('active');
    SCAN_FRAME.classList.add('active');

    /**
     * iOS Safari requires waiting for loadedmetadata event
     * before calling play() on the video element
     */
    const onCanPlay = function () {
      VIDEO.removeEventListener('loadedmetadata', onCanPlay);
      VIDEO.removeEventListener('canplay', onCanPlay);
      
      VIDEO.play().then(function () {
        VIDEO.style.display = 'block';
        
        // Choose scanning method based on API availability
        if (barcodeDetector) {
          // Use native BarcodeDetector (Chrome/Edge)
          CANVAS.hidden = false;
          tickNative();
        } else {
          // Use fallback libraries (Safari/Firefox)
          startFallbackScanning();
        }
      }).catch(function (e) {
        console.warn('Video play failed', e);
        showToast('Camera preview failed. Tap Start again.', 'error');
        stopScanning();
      });
    };

    // Check if video is already ready
    if (VIDEO.readyState >= 2) {
      onCanPlay();
    } else {
      VIDEO.addEventListener('loadedmetadata', onCanPlay);
      VIDEO.addEventListener('canplay', onCanPlay);
    }
  }

  /**
   * Stop camera and scanning
   */
  function stopScanning() {
    scanning = false;
    
    // Hide scan animation
    SCAN_LINE.classList.remove('active');
    SCAN_FRAME.classList.remove('active');
    
    // Cancel native scanning loop
    if (scanAnimationId != null) {
      cancelAnimationFrame(scanAnimationId);
      scanAnimationId = null;
    }
    
    // Stop fallback scanning
    stopFallbackScanning();
    
    // Release camera
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    
    // Reset video element
    try { VIDEO.pause(); } catch (_) {}
    VIDEO.srcObject = null;
    VIDEO.style.display = 'block';
    CANVAS.hidden = true;
    
    // Update UI state
    BTN_TOGGLE.classList.remove('scanning');
    BTN_TOGGLE_TEXT.textContent = 'Start scanning';
  }

  /**
   * Toggle scanning on/off
   */
  function toggleScanning() {
    if (scanning) {
      stopScanning();
    } else {
      startScanning();
    }
  }

  // ==========================================================================
  // EVENT LISTENERS
  // ==========================================================================

  // Scan toggle button
  BTN_TOGGLE.addEventListener('click', toggleScanning);

  // Save to history button
  BTN_SAVE.addEventListener('click', saveToHistory);

  // Copy to clipboard button
  BTN_COPY.addEventListener('click', copyResult);

  // Clear history button
  BTN_CLEAR.addEventListener('click', () => {
    setHistory([]);
    renderHistory();
    setResult('', '');
    showToast('History cleared');
  });

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  // Render saved history on page load
  renderHistory();

  // Show HTTPS warning if not in secure context
  if (!window.isSecureContext) {
    document.getElementById('https-banner').hidden = false;
  }

  // ==========================================================================
  // SERVICE WORKER REGISTRATION
  // ==========================================================================

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ==========================================================================
  // PWA INSTALLATION
  // ==========================================================================

  let deferredPrompt = null;

  // Capture the install prompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    BTN_INSTALL.hidden = false;
  });

  // Hide install button after installation
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    BTN_INSTALL.hidden = true;
  });

  // Handle install button click
  BTN_INSTALL.addEventListener('click', () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      BTN_INSTALL.hidden = true;
    });
  });

  // Hide install button if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    BTN_INSTALL.hidden = true;
  }

})();
