# Barcode Scanner PWA

A fast, lightweight Progressive Web App for scanning barcodes and QR codes using your device camera. Built with vanilla HTML, CSS, and JavaScript.

## Features

- **QR Code & Barcode Support** - Scans QR codes and 1D barcodes (EAN, UPC, Code128, Code39, etc.)
- **Works Offline** - Service worker caches the app for offline use
- **Installable** - Add to home screen on mobile for a native app experience
- **Cross-Platform** - Works on desktop (Chrome, Edge) and mobile (iOS Safari, Android Chrome)
- **History** - Save scanned results to local history
- **Copy to Clipboard** - One-tap copy of scanned results
- **Vibration Feedback** - Haptic feedback on successful scan (mobile)
- **Dark Theme** - Modern dark UI optimized for scanning

## Supported Barcode Formats

| Format | Type | Description |
|--------|------|-------------|
| QR Code | 2D | Text, URLs, contact info, etc. |
| EAN-13 | 1D | International product codes |
| EAN-8 | 1D | Compact product codes |
| UPC-A | 1D | US/Canada product codes |
| UPC-E | 1D | Compressed UPC codes |
| Code 128 | 1D | Alphanumeric (text + numbers) |
| Code 39 | 1D | Alphanumeric (uppercase) |
| Codabar | 1D | Libraries, blood banks |
| ITF | 1D | Interleaved 2 of 5 |

## Project Structure

```
barcode-scanner/
├── index.html      # Main HTML structure
├── styles.css      # Styling and animations
├── app.js          # Core application logic
├── sw.js           # Service worker for offline support
├── manifest.json   # PWA manifest for installation
├── icon-192.png    # App icon (192x192)
├── icon-512.png    # App icon (512x512)
└── README.md       # This file
```

## How to Use

1. **Start Scanning** - Tap the "Start scanning" button
2. **Point Camera** - Aim at a barcode or QR code
3. **Auto-Detection** - Scanning stops when a code is detected
4. **Save or Copy** - Use buttons to save to history or copy to clipboard
5. **Scan Again** - Tap "Start scanning" for the next code

## Run Locally

### Desktop (localhost)

```bash
# Navigate to project folder
cd barcode-scanner

# Start a local server (Python 3)
python3 -m http.server 8080

# Or with Node.js
npx serve -p 8080
```

Open **http://localhost:8080** in your browser.

### Mobile (requires HTTPS)

Mobile browsers require HTTPS for camera access. Use one of these options:

#### Option 1: ngrok (recommended)

```bash
# Install ngrok
brew install ngrok

# Start local server
python3 -m http.server 8080

# In another terminal, create tunnel
ngrok http 8080
```

Open the HTTPS URL (e.g., `https://abc123.ngrok-free.app`) on your phone.

#### Option 2: localtunnel

```bash
# Start local server
python3 -m http.server 8080

# Create tunnel (no signup required)
npx localtunnel --port 8080
```

#### Option 3: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## Browser Support

| Browser | Native API | Fallback |
|---------|------------|----------|
| Chrome (Android) | BarcodeDetector | - |
| Edge (Desktop) | BarcodeDetector | - |
| Safari (iOS) | - | jsQR + Quagga |
| Firefox | - | jsQR + Quagga |
| Chrome (iOS) | - | jsQR + Quagga |

- **BarcodeDetector API**: Native browser API (faster, more accurate)
- **jsQR**: JavaScript QR code decoder (fallback for QR codes)
- **Quagga**: JavaScript 1D barcode decoder (fallback for barcodes)

## Troubleshooting

### Camera not working

1. **Check HTTPS**: Mobile requires `https://` (not `http://`)
2. **Allow Permission**: Grant camera access when prompted
3. **Site Settings**: If blocked, go to browser settings → Site Settings → Camera → Allow

### Black screen on iOS

1. Clear Safari cache: Settings → Safari → Clear History and Website Data
2. Reload the page and allow camera again

### Barcode not detected

1. Ensure good lighting
2. Hold the code steady in the frame
3. Fill 50-70% of the frame with the barcode
4. Try moving closer or farther

## Dependencies

External libraries loaded via CDN:

- [Quagga](https://github.com/serratus/quaggaJS) - 1D barcode detection
- [jsQR](https://github.com/cozmo/jsQR) - QR code detection

## License

MIT License - feel free to use and modify.
