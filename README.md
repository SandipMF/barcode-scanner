# Barcode Scanner PWA

A fast barcode scanner Progressive Web App (HTML/CSS/JS). Works on desktop and mobile when served over **HTTPS** (required for camera on phones).

## Run locally (desktop)

```bash
cd /Users/sandips/Documents/MERN/pwa/barcode-scanner
python3 -m http.server 8080
```

Open **http://localhost:8080** in your browser. Camera works on localhost without HTTPS.

---

## Run on your phone (camera required)

Mobile browsers only allow camera access on **secure contexts** (HTTPS or localhost). So when you open the app on your phone via `http://YOUR_IP:8080`, the camera will be blocked.

Use one of these options to get an **HTTPS** URL and open that on your phone.

### Option 1: ngrok (recommended)

1. Install ngrok: https://ngrok.com/download (or `brew install ngrok`).
2. Start your local server (see above) on port 8080.
3. In another terminal run:
   ```bash
   ngrok http 8080
   ```
4. Copy the **HTTPS** URL ngrok shows (e.g. `https://abc123.ngrok.io`).
5. Open that URL on your phone. Allow camera when prompted.

### Option 2: localtunnel (no signup)

1. Start your local server on port 8080.
2. In another terminal run:
   ```bash
   npx localtunnel --port 8080
   ```
3. Use the HTTPS URL it prints (e.g. `https://something.loca.lt`) on your phone. You may need to click “Click to Continue” once.

### Option 3: Deploy to a host with HTTPS

Upload the project folder to any static host with HTTPS (e.g. Netlify, Vercel, GitHub Pages, your own server with SSL). Open the deployed URL on your phone.

---

## Tips

- **Allow camera**: When the browser asks for camera permission, choose “Allow”.
- **Site settings**: If you previously blocked the camera, open the site’s settings (e.g. lock icon → Site settings) and set Camera to “Allow”.
- **iOS**: Use Safari or Chrome; “Add to Home Screen” then open from the home screen for a full-screen app experience.
