# 🎬 ChronosPro Studio

ChronosPro Studio is a powerful, privacy-first, offline-ready desktop and web-based timelapse creator, video compiler, and HEIC batch converter. Built with **React 19**, **Vite**, **TypeScript**, and **Tailwind CSS**, and wrapped in an **Electron** desktop container, this comprehensive two-part application lets you seamlessly batch-convert raw HEIC/HEIF images and bundle high-resolution photo folders directly into beautifully-timed, visually stunning cinematic motion sequences entirely within your local browser sandbox or desktop environment.

No servers, no queues, and **zero data uploads**—your original high-resolution photos and converted files never leave your machine.

---

## 🌐 Live Development & Preview URLs

ChronosPro Studio is fully deployed and accessible online in both development and shared staging environments:
*   **💻 Active Development Staging**: [https://ais-dev-6vp6gnl5b6bjovtyl6rgwk-593733727083.us-east1.run.app](https://ais-dev-6vp6gnl5b6bjovtyl6rgwk-593733727083.us-east1.run.app)
*   **🔗 Shared Preview & Live App**: [https://ais-pre-6vp6gnl5b6bjovtyl6rgwk-593733727083.us-east1.run.app](https://ais-pre-6vp6gnl5b6bjovtyl6rgwk-593733727083.us-east1.run.app)

---

## ✨ Features

*   **🔒 Complete Local Privacy**: Image parsing, rendering, and video assembly run entirely locally in the client-side browser context or the desktop app sandbox using standard canvas capturing APIs.
*   **🔄 Persistent Multi-Tab Workspace**: Switch seamlessly between the **Timelapse Workspace**, the **HEIC Converter**, and the **Work Log Console** without losing any uploaded sequence frames or active conversion queues.
*   **💾 Offline Backup & Restore (Save/Import Workspace)**: Explicitly package, export, and download your entire active timeline state (including full base64-encoded file buffers, active logs, and custom profiles) as a `.json` backup file. Easily import this file at any time to recover your project in the event of browser/system crashes.
*   **⚡ Built-in HEIC Batch Converter**: A high-performance, offline batch converter that translates raw HEIC/HEIF images (and compressed PNG, WEBP, BMP, etc.) into baseline JPEGs with customizable sub-sampling quality and resolution constraints.
*   **📐 Resolution Safety & Aspect Auto-Correction**: Automatically detects discrepancies in photo dimensions. Includes an intelligent even-pixel resize algorithm to enforce exact codec specifications and prevent hardware video encoder crashes.
*   **🏎️ Custom Speed Engine**: Adjust frame rate limits (FPS) and multiplier speeds (frame skipping or repeating) to match your desired timeline pace.
*   **🎯 Multiple Aspect Ratios & Resizing**: Supports **Original (Match Source)**, **16:9 Cinema Wide**, **4:3 Vintage Film**, **1:1 Social Square**, and **9:16 Portrait Reel**, keeping your original dimensions cleanly centered.
*   **🎛️ Three-Tier Visual Bitrate Profiles**:
    *   **Pristine / Lossless (95 Mbps Master)**: Absolute highest-fidelity. Designed for photographers who want the absolute closest match to original RAW/JPEG image detail.
    *   **High (45 Mbps Studio)**: Balanced full-HD/4K production quality with minimal compression artifacts.
    *   **Standard (5 Mbps Compact)**: Ideal for fast uploads, social media sharing, and lightweight email attachments.
*   **📼 Flexible Formats**: Render and download directly to lossless-bounded **WebM**, container-wrapped **MP4**, or dynamic sequential **Frame ZIPs**.

---

## 🛠️ Installation & Setup

Ensure you have [Node.js (v18+)](https://nodejs.org/) installed before proceeding.

### 1. Clone & Install Dependencies
To install all required packages—including the packaging and converter components—run:
```bash
git clone https://github.com/h-o7/chronospro-studio.git
cd chronospro-studio
npm install
```

### 2. Run in Development Mode
You can spin up ChronosPro Studio either in the standard web-browser interface or inside the native Electron desktop application frame:

*   **Launch in Web Browser**:
    ```bash
    npm run dev
    ```
    This launches a hot-reloading development server available at `http://localhost:3000`.

*   **Launch in Electron Desktop App**:
    ```bash
    npm run dev:electron
    ```
    This directly opens the application window locally on your desktop for native-feel interactions.

### 3. Build & Local Preview (Web Output)
If you want to construct the optimized web assets and verify performance:
```bash
npm run build
```

---

## 📦 Packaging Instructions (Desktop Apps)

ChronosPro Studio uses `electron-builder` to package the web build into standalone, zero-dependency desktop executable installers.

### Resolving "Command Not Recognized" (e.g. electron-builder missing):
If you get an error that `'electron-builder' is not recognized` when running `npm run package`, it means your local `node_modules` does not have the packaging binaries yet. 
Simply run:
```bash
# 1. Re-run local installation to populate electron and electron-builder binaries
npm install

# 2. Package your production desktop build
npm run package
```

To package ChronosPro Studio for your operating system:

```bash
# This compiles the web bundle and creates the platform-specific desktop installers
npm run package
```

### What Happens During Packaging?
1. The app compiles and optimizes the React workspace into directory `dist/`.
2. `electron-builder` wraps the `dist/` directory and active electron module files (`main.js`, `package.json`).
3. Binary executables are placed in the newly created **`/release`** directory.

### Build Targets Configurations:
The configuration specified in `package.json` compiles the following assets inside the `/release` directory based on your current operating system:
*   **macOS**: Generates a disk image platform mount (`.dmg`) target under app ID `com.chronospro.studio`.
*   **Windows**: Generates a zero-install, completely self-contained desktop executable (`.exe` Portable).
*   **Linux**: Generates a standard portable visual app format package (`.AppImage`).

---

## 🚀 How to Use the Program (Step-by-Step)

Follow these simple steps to construct high-quality timelapse clips from your pictures:

### Step 1: Upload Your Workspace Photos
Drag and drop your sorted sequence images directly into the centered **Upload Box** or click on it to use your system's native file explorer. 
* *Tip*: Ensure all frames are named sequentially (e.g., `img_001.jpg`, `img_002.jpg`) so that the timeline arranges them in order automatically.

### Step 2: Convert Unsupported HEIC Files
If you have raw iPhone or Samsung photos captured in HEIC/HEIF, switch to the **HEIC Converter** tab:
1. Drag and drop your HEIC folder or selected HEIC files.
2. Adjust the custom **JPEG Quality** slider (styled in visible slate-gray for easy adjustment).
3. If desired, check **Enable Resizing** and select your output width/height.
4. Click **Start Batch Conversion** to transcode files fully offline.
5. Save files directly into a local folder (using modern Web Directory Picker API) or download them as a ZIP, then add the converted JPEGs straight to your Timelapse Timeline!

### Step 3: Manage the Timeline and Preview
Use the bottom **Timeline Slider** to scan through individual frames. You can click on specific frames to preview details, rotate/flip/duplicate them individually, or hit the **Spacebar / Play Button** to watch the video playback animation in real-time.

### Step 4: Choose Aspect Ratio and Dimensions
In the left **Control Panel**, you can:
* Select **Original (Match Source)** to automatically adjust render dimensions to your image format.
* Switch to other presets like **16:9** or **1:1**.
* Set frame rates dynamically (e.g., `24 FPS`, `30 FPS`, `60 FPS`).

### Step 5: Configure Output and Encoding Quality
1. Verify the output format in the **Export Format** section: **WebM** (optimized browser video), **MP4** (universal compatibility), or **Frame ZIP** (perfect for sequential archival repackaging).
2. For video outputs, choose your **Video Encoding Quality**:
    * Tap **Pristine** for maximum visual detail with a **95 Mbps** bitrate limit.
    * Tap **High** for a robust **45 Mbps** studio-grade bitrate.
    * Tap **Standard** for a lighter weight **5 Mbps** sharing profile.

### Step 6: Render and Download the Timelapse Video
1. Click the large, green **Export Timelapse** button on the bottom layout. 
2. Inside the rendering pop-up window, click **Start Export Process**.
3. Watch the applet draw and compile every image in lock-step onto the video stream.
4. Once completed, the download starts automatically, saving your crystal-clear timelapse video directly to your computer!

---

## 🎨 Tech Stack & Libraries

*   **Vite & React**: Lightning-fast compilation and highly interactive user components.
*   **Tailwind CSS**: Crisp interface layouts, dark slate backgrounds, and custom UI transitions.
*   **Lucide React**: Clean vector-drawn UI iconography.
*   **JSZip**: Fast in-memory sequence compression for offline ZIP packaging.
*   **Electron & Electron-Builder**: Simplified native desktop framing and compiler tools.
