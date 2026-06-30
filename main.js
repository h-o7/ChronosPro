import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import convert from 'heic-convert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IPC Handlers for Renderer Communication
ipcMain.handle('select-directory', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('save-files-to-directory', async (event, { directory, files }) => {
  try {
    for (const file of files) {
      const { name, arrayBuffer } = file;
      const filePath = path.join(directory, name);
      await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('convert-heic', async (event, { arrayBuffer, quality }) => {
  try {
    const inputBuffer = Buffer.from(arrayBuffer);
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: quality
    });
    return new Uint8Array(outputBuffer);
  } catch (err) {
    throw new Error(err.message || String(err));
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#060606',
    title: 'ChronosPro'
  });

  // Remove menu bar on individual window as well just to be completely safe
  win.setMenu(null);

  // Load the built Vite index.html file
  win.loadFile(path.join(__dirname, 'dist/index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
