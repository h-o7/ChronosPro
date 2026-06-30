import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Inject the Electron IPC API bridge if running in an Electron desktop shell context
if (typeof window !== 'undefined' && (window as any).process?.versions?.electron) {
  try {
    const { ipcRenderer } = (window as any).require('electron');
    (window as any).electronAPI = {
      selectDirectory: () => ipcRenderer.invoke('select-directory'),
      saveFilesToDirectory: (directory: string, files: any[]) => ipcRenderer.invoke('save-files-to-directory', { directory, files }),
      convertHeic: (arrayBuffer: ArrayBuffer, quality: number) => ipcRenderer.invoke('convert-heic', { arrayBuffer, quality }),
    };
  } catch (err) {
    console.error('Failed to initialize local Electron IPC channel bridge:', err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
