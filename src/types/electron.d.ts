interface Song {
  name: string;
  path: string;
}

interface ElectronAPI {
  openFileDialog: () => Promise<string[]>;
  copyToSongs: (filePaths: string[]) => Promise<Song[]>;
  loadSongs: () => Promise<Song[]>;
  getSongsDir: () => Promise<string>;
  log: (message: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
