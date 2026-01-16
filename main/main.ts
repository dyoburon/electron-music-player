import { app, BrowserWindow, ipcMain, dialog, protocol, session } from "electron";
import * as path from "path";
import * as fs from "fs";
// Enable audio autoplay without user gesture (must be before app ready)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-background-media-suspend");
// Use system audio service for better capture compatibility
app.commandLine.appendSwitch("disable-features", "AudioServiceOutOfProcess");

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

// Get the playlists file path
const getPlaylistsPath = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "playlists.json");
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 800,
    minHeight: 500,
    resizable: true,
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
  // Remove CSP headers to allow WebSocket connections to OBS bridge
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['']
      }
    });
  });

  // Register custom protocol for serving local audio files
  protocol.handle("media", (request) => {
    const filePath = decodeURIComponent(request.url.replace("media://", ""));
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
      copiedFiles.push({
        name: fileName,
        path: mediaUrl,
      });
    } catch {
      // Failed to copy file
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
        return {
          name: file,
          path: mediaUrl,
        };
      });

    return songs;
  } catch {
    return [];
  }
});

// Get songs directory path
ipcMain.handle("get-songs-dir", () => {
  return getSongsDir();
});

// Load playlists from file
ipcMain.handle("load-playlists", async () => {
  const playlistsPath = getPlaylistsPath();
  try {
    if (fs.existsSync(playlistsPath)) {
      const data = fs.readFileSync(playlistsPath, "utf-8");
      return JSON.parse(data);
    }
    return [];
  } catch {
    return [];
  }
});

// Save playlists to file
ipcMain.handle("save-playlists", async (_, playlists) => {
  const playlistsPath = getPlaylistsPath();
  try {
    fs.writeFileSync(playlistsPath, JSON.stringify(playlists, null, 2));
    return true;
  } catch {
    return false;
  }
});
