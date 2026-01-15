interface Song {
  name: string;
  path: string;
}

interface Playlist {
  id: string;
  name: string;
  songs: Song[];
}

interface ElectronAPI {
  openFileDialog: () => Promise<string[]>;
  copyToSongs: (filePaths: string[]) => Promise<Song[]>;
  loadSongs: () => Promise<Song[]>;
  getSongsDir: () => Promise<string>;
  loadPlaylists: () => Promise<Playlist[]>;
  savePlaylists: (playlists: Playlist[]) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
