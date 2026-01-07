import { app, BrowserWindow, ipcMain, dialog, protocol } from "electron";
import * as path from "path";
import * as fs from "fs";
import { pathToFileURL } from "url";

// Safe logging wrapper to handle EPIPE errors when stdout is closed
const safeLog = (...args: unknown[]) => {
  try {
    console.log(...args);
  } catch (e: unknown) {
    // Ignore EPIPE errors (stdout closed)
    if (e instanceof Error && (e as NodeJS.ErrnoException).code !== "EPIPE") {
      throw e;
    }
  }
};

const safeError = (...args: unknown[]) => {
  try {
    console.error(...args);
  } catch (e: unknown) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code !== "EPIPE") {
      throw e;
    }
  }
};

// Enable audio autoplay without user gesture (must be before app ready)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-background-media-suspend");

let mainWindow: BrowserWindow | null = null;

// Get the songs directory in app data
const getSongsDir = () => {
  const userDataPath = app.getPath("userData");
  const songsDir = path.join(userDataPath, "songs");
  if (!fs.existsSync(songsDir)) {
    fs.mkdirSync(songsDir, { recursive: true });
  }
  return songsDir;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 520,
    resizable: false,
    title: "RETRO PLAYER",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  // Load the app
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

// Register protocol as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  // Register custom protocol for serving local audio files
  protocol.handle("media", (request) => {
    const filePath = decodeURIComponent(request.url.replace("media://", ""));
    safeLog("[protocol] Serving file:", filePath);

    // Use file:// URL fetch for proper streaming support
    const fileUrl = `file://${filePath}`;
    return require("electron").net.fetch(fileUrl);
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers

// Log messages from renderer
ipcMain.on("renderer-log", (_, message: string) => {
  safeLog("[renderer]", message);
});

// Open file dialog to select audio files
ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Audio Files", extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac"] },
    ],
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});

// Copy files to songs directory
ipcMain.handle("copy-to-songs", async (_, filePaths: string[]) => {
  const songsDir = getSongsDir();
  const copiedFiles: { name: string; path: string }[] = [];

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const destPath = path.join(songsDir, fileName);

    try {
      fs.copyFileSync(filePath, destPath);
      const mediaUrl = `media://${encodeURIComponent(destPath)}`;
      safeLog("[copy-to-songs] Created URL:", mediaUrl);
      copiedFiles.push({
        name: fileName,
        path: mediaUrl,
      });
    } catch (e) {
      safeError(`Failed to copy ${fileName}:`, e);
    }
  }

  return copiedFiles;
});

// Load saved songs from songs directory
ipcMain.handle("load-songs", async () => {
  const songsDir = getSongsDir();
  const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"];

  try {
    const files = fs.readdirSync(songsDir);
    const songs = files
      .filter((file) => audioExtensions.includes(path.extname(file).toLowerCase()))
      .map((file) => {
        const fullPath = path.join(songsDir, file);
        const mediaUrl = `media://${encodeURIComponent(fullPath)}`;
        safeLog("[load-songs] File:", file, "URL:", mediaUrl);
        return {
          name: file,
          path: mediaUrl,
        };
      });

    safeLog("[load-songs] Loaded", songs.length, "songs");
    return songs;
  } catch (e) {
    safeError("Failed to load songs:", e);
    return [];
  }
});

// Get songs directory path
ipcMain.handle("get-songs-dir", () => {
  return getSongsDir();
});
