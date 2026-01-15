import { useState, useRef, useEffect } from "react";
import "./App.css";

interface Song {
  name: string;
  path: string;
}

interface Playlist {
  id: string;
  name: string;
  songs: Song[];
}

const isElectron = () => {
  return window.electronAPI !== undefined;
};

function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(16).fill(5));
  const [showLibrary, setShowLibrary] = useState(true);
  const [draggedSong, setDraggedSong] = useState<Song | null>(null);
  const [dragOverPlaylistId, setDragOverPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newPlaylistInputRef = useRef<HTMLInputElement>(null);

  const currentPlaylist = selectedPlaylistId
    ? playlists.find((p) => p.id === selectedPlaylistId)
    : null;
  const displaySongs = currentPlaylist ? currentPlaylist.songs : songs;
  const currentSong = displaySongs[currentIndex];

  // Load saved data on mount
  useEffect(() => {
    loadSavedSongs();
    loadSavedPlaylists();
  }, []);

  // Auto-save playlists when they change
  useEffect(() => {
    if (playlists.length > 0 && isElectron()) {
      window.electronAPI.savePlaylists(playlists);
    }
  }, [playlists]);

  // Focus input when creating playlist
  useEffect(() => {
    if (isCreatingPlaylist && newPlaylistInputRef.current) {
      newPlaylistInputRef.current.focus();
    }
  }, [isCreatingPlaylist]);

  const loadSavedSongs = async () => {
    if (!isElectron()) return;
    try {
      const savedSongs = await window.electronAPI.loadSongs();
      setSongs(savedSongs);
    } catch {
      // Failed to load songs
    }
  };

  const loadSavedPlaylists = async () => {
    if (!isElectron()) return;
    try {
      const savedPlaylists = await window.electronAPI.loadPlaylists();
      setPlaylists(savedPlaylists);
    } catch {
      // Failed to load playlists
    }
  };

  const addSongs = async () => {
    if (isElectron()) {
      try {
        const filePaths = await window.electronAPI.openFileDialog();
        if (filePaths.length > 0) {
          const copiedSongs = await window.electronAPI.copyToSongs(filePaths);
          setSongs((prev) => [...prev, ...copiedSongs]);
        }
      } catch {
        // Failed to add songs
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newSongs: Song[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newSongs.push({
        name: file.name,
        path: URL.createObjectURL(file),
      });
    }

    setSongs((prev) => [...prev, ...newSongs]);
    e.target.value = "";
  };

  // Playlist management
  const createPlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const newPlaylist: Playlist = {
      id: Date.now().toString(),
      name: newPlaylistName.trim(),
      songs: [],
    };
    setPlaylists((prev) => [...prev, newPlaylist]);
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
    setSelectedPlaylistId(newPlaylist.id);
  };

  const deletePlaylist = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (selectedPlaylistId === id) {
      setSelectedPlaylistId(null);
      setCurrentIndex(0);
    }
  };

  const renamePlaylist = (id: string, newName: string) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
    );
  };

  // Drag and drop handlers
  const handleSongDragStart = (song: Song) => {
    setDraggedSong(song);
  };

  const handleSongDragEnd = () => {
    setDraggedSong(null);
    setDragOverPlaylistId(null);
  };

  const handlePlaylistDragOver = (e: React.DragEvent, playlistId: string) => {
    e.preventDefault();
    setDragOverPlaylistId(playlistId);
  };

  const handlePlaylistDragLeave = () => {
    setDragOverPlaylistId(null);
  };

  const handlePlaylistDrop = (playlistId: string) => {
    if (!draggedSong) return;

    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id === playlistId) {
          // Check if song already exists in playlist
          const exists = p.songs.some((s) => s.path === draggedSong.path);
          if (exists) return p;
          return { ...p, songs: [...p.songs, draggedSong] };
        }
        return p;
      })
    );

    setDraggedSong(null);
    setDragOverPlaylistId(null);
  };

  const removeSongFromPlaylist = (playlistId: string, songIndex: number) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id === playlistId) {
          const newSongs = p.songs.filter((_, i) => i !== songIndex);
          return { ...p, songs: newSongs };
        }
        return p;
      })
    );

    // Adjust current index if needed
    if (selectedPlaylistId === playlistId) {
      if (songIndex < currentIndex) {
        setCurrentIndex((prev) => prev - 1);
      } else if (songIndex === currentIndex) {
        setIsPlaying(false);
        if (currentIndex >= displaySongs.length - 1) {
          setCurrentIndex(0);
        }
      }
    }
  };

  // Audio setup and controls
  const setupAnalyzer = () => {
    if (!audioRef.current || analyserRef.current) return;

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 32;

    const source = audioContextRef.current.createMediaElementSource(audioRef.current);
    source.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);
  };

  useEffect(() => {
    if (!isPlaying || !analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const animate = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const normalized = Array.from(dataArray).map((v) => Math.max(2, (v / 255) * 30));
      setVisualizerData(normalized);
      if (isPlaying) requestAnimationFrame(animate);
    };

    animate();
  }, [isPlaying]);

  const togglePlay = async () => {
    if (!audioRef.current || !currentSong) return;

    if (!analyserRef.current) {
      setupAnalyzer();
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      try {
        await audioRef.current.play();
      } catch {
        // Play failed
      }
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    if (displaySongs.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % displaySongs.length);
    setIsPlaying(true);
  };

  const playPrev = () => {
    if (displaySongs.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + displaySongs.length) % displaySongs.length);
    setIsPlaying(true);
  };

  const playSong = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (audioRef.current && currentSong && isPlaying) {
      audioRef.current.play();
    }
  }, [currentIndex, selectedPlaylistId]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div className="app-container">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="audio/*"
        multiple
        onChange={handleFileInput}
      />

      {/* Sidebar - Playlists */}
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">PLAYLISTS</span>
          <button
            className="new-playlist-btn"
            onClick={() => setIsCreatingPlaylist(true)}
          >
            +
          </button>
        </div>

        {isCreatingPlaylist && (
          <div className="new-playlist-form">
            <input
              ref={newPlaylistInputRef}
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createPlaylist();
                if (e.key === "Escape") {
                  setIsCreatingPlaylist(false);
                  setNewPlaylistName("");
                }
              }}
              placeholder="Playlist name..."
            />
            <button onClick={createPlaylist}>OK</button>
          </div>
        )}

        <div className="playlist-list">
          <div
            className={`playlist-entry ${selectedPlaylistId === null ? "active" : ""}`}
            onClick={() => {
              setSelectedPlaylistId(null);
              setCurrentIndex(0);
              setShowLibrary(true);
            }}
          >
            <span className="playlist-icon">📚</span>
            <span className="playlist-name">Library ({songs.length})</span>
          </div>

          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className={`playlist-entry ${selectedPlaylistId === playlist.id ? "active" : ""} ${
                dragOverPlaylistId === playlist.id ? "drag-over" : ""
              }`}
              onClick={() => {
                setSelectedPlaylistId(playlist.id);
                setCurrentIndex(0);
                setShowLibrary(false);
              }}
              onDragOver={(e) => handlePlaylistDragOver(e, playlist.id)}
              onDragLeave={handlePlaylistDragLeave}
              onDrop={() => handlePlaylistDrop(playlist.id)}
            >
              <span className="playlist-icon">🎵</span>
              <span className="playlist-name">
                {playlist.name} ({playlist.songs.length})
              </span>
              <button
                className="delete-playlist-btn"
                onClick={(e) => deletePlaylist(playlist.id, e)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Player */}
      <div className="main-content">
        <div className="player">
          <div className="player-header">
            <span className="title-text">RETRO PLAYER</span>
          </div>

          <div className="visualizer">
            {visualizerData.map((height, i) => (
              <div key={i} className="bar" style={{ height: `${height}px` }} />
            ))}
          </div>

          <div className="display">
            <div className="song-info">
              <span className="marquee">
                {currentSong ? currentSong.name : "NO TRACK LOADED"}
              </span>
            </div>
            <div className="time-display">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="seek-bar">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
            />
          </div>

          <div className="controls">
            <button onClick={playPrev} className="ctrl-btn">
              ⏮
            </button>
            <button onClick={togglePlay} className="ctrl-btn play-btn">
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button onClick={playNext} className="ctrl-btn">
              ⏭
            </button>
          </div>

          <div className="volume-control">
            <span className="vol-icon">🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
            />
          </div>
        </div>

        {/* Songs Panel */}
        <div className="songs-panel">
          <div className="songs-header">
            <span>
              {selectedPlaylistId
                ? `${currentPlaylist?.name || "Playlist"}`
                : "LIBRARY"}
            </span>
            {!selectedPlaylistId && (
              <button className="add-btn" onClick={addSongs}>
                + ADD SONGS
              </button>
            )}
          </div>

          <div className="songs-list">
            {displaySongs.length === 0 ? (
              <div className="empty-songs" onClick={selectedPlaylistId ? undefined : addSongs}>
                {selectedPlaylistId
                  ? "Drag songs here from the library"
                  : "Drop audio files here or click to add"}
              </div>
            ) : (
              displaySongs.map((song, i) => (
                <div
                  key={i}
                  className={`song-item ${i === currentIndex ? "active" : ""}`}
                  draggable={!selectedPlaylistId}
                  onDragStart={() => handleSongDragStart(song)}
                  onDragEnd={handleSongDragEnd}
                  onClick={() => playSong(i)}
                >
                  <span className="track-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="track-name">{song.name}</span>
                  {selectedPlaylistId && (
                    <button
                      className="remove-song-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSongFromPlaylist(selectedPlaylistId, i);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={currentSong?.path}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={playNext}
      />
    </div>
  );
}

export default App;
