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
  const [visualizerEnabled, setVisualizerEnabled] = useState(false); // Disabled to prevent OBS audio freezes
  const [showLibrary, setShowLibrary] = useState(true);
  const [draggedSong, setDraggedSong] = useState<Song | null>(null);
  const [dragOverPlaylistId, setDragOverPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);
  const superChatSoundRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newPlaylistInputRef = useRef<HTMLInputElement>(null);
  const obsBridgeRef = useRef<WebSocket | null>(null);

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

  // Refs to hold command handlers (updated when dependencies change)
  const skipHandlerRef = useRef<(() => void) | null>(null);
  const playlistHandlerRef = useRef<((name: string) => void) | null>(null);
  const libraryHandlerRef = useRef<(() => void) | null>(null);

  // Connect to OBS Audio Bridge
  useEffect(() => {
    const connectToOBS = () => {
      console.log('Attempting to connect to OBS Audio Bridge...');
      try {
        const ws = new WebSocket('ws://localhost:3456/electron');

        ws.onopen = () => {
          console.log('Connected to OBS Audio Bridge!');
          obsBridgeRef.current = ws;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received command from bridge:', data);
            if (data.command === 'skip' && skipHandlerRef.current) {
              console.log('Skipping song via chat command!');
              skipHandlerRef.current();
            } else if (data.command === 'playlist' && data.name && playlistHandlerRef.current) {
              console.log('Switching to playlist via chat command:', data.name);
              playlistHandlerRef.current(data.name);
            } else if (data.command === 'library' && libraryHandlerRef.current) {
              console.log('Switching to library via chat command');
              libraryHandlerRef.current();
            }
          } catch (e) {
            console.error('Invalid message from bridge:', e);
          }
        };

        ws.onclose = (e) => {
          console.log('Disconnected from OBS Audio Bridge:', e.code, e.reason);
          obsBridgeRef.current = null;
          setTimeout(connectToOBS, 3000);
        };

        ws.onerror = (e) => {
          console.error('OBS Bridge WebSocket error:', e);
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        setTimeout(connectToOBS, 3000);
      }
    };

    connectToOBS();

    return () => {
      obsBridgeRef.current?.close();
    };
  }, []);

  // Listen for superchat events and play sound
  useEffect(() => {
    const connectToSuperChatEvents = () => {
      console.log('Connecting to superchat events...');
      const eventSource = new EventSource('http://localhost:3457/superchat/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'superchat') {
            console.log('Superchat received:', data.username);
            // Play the superchat sound
            if (superChatSoundRef.current) {
              superChatSoundRef.current.currentTime = 0;
              superChatSoundRef.current.play().catch(e => console.error('Failed to play superchat sound:', e));
            }
          }
        } catch (e) {
          console.error('Failed to parse superchat event:', e);
        }
      };

      eventSource.onerror = () => {
        console.log('Superchat SSE disconnected, reconnecting...');
        eventSource.close();
        setTimeout(connectToSuperChatEvents, 3000);
      };

      return eventSource;
    };

    const eventSource = connectToSuperChatEvents();

    return () => {
      eventSource.close();
    };
  }, []);

  // Send state to OBS Bridge
  const sendToOBS = (data: Record<string, unknown>) => {
    if (obsBridgeRef.current?.readyState === WebSocket.OPEN) {
      obsBridgeRef.current.send(JSON.stringify(data));
    }
  };

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

    // GainNode for local volume control (OBS captures before this)
    gainNodeRef.current = audioContextRef.current.createGain();
    gainNodeRef.current.gain.value = volume;

    const source = audioContextRef.current.createMediaElementSource(audioRef.current);
    // Audio element (full volume) → Analyser → GainNode (local volume) → Speakers
    source.connect(analyserRef.current);
    analyserRef.current.connect(gainNodeRef.current);
    gainNodeRef.current.connect(audioContextRef.current.destination);
  };

  // Visualizer animation loop - disabled by default to prevent OBS audio freezes
  // The 60fps React state updates were blocking Electron's main thread
  useEffect(() => {
    if (!visualizerEnabled || !isPlaying || !analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const animate = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const normalized = Array.from(dataArray).map((v) => Math.max(2, (v / 255) * 30));
      setVisualizerData(normalized);
      if (isPlaying && visualizerEnabled) requestAnimationFrame(animate);
    };

    animate();
  }, [isPlaying, visualizerEnabled]);

  const togglePlay = async () => {
    if (!audioRef.current || !currentSong) return;

    if (!analyserRef.current) {
      setupAnalyzer();
    }

    if (isPlaying) {
      audioRef.current.pause();
      sendToOBS({ isPlaying: false });
    } else {
      try {
        await audioRef.current.play();
        sendToOBS({ isPlaying: true, currentTime: audioRef.current.currentTime });
      } catch {
        // Play failed
      }
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    if (displaySongs.length === 0) return;
    // Pick a random song, avoiding the current one if possible
    let nextIndex: number;
    if (displaySongs.length === 1) {
      nextIndex = 0;
    } else {
      do {
        nextIndex = Math.floor(Math.random() * displaySongs.length);
      } while (nextIndex === currentIndex);
    }
    const nextSong = displaySongs[nextIndex];
    setCurrentIndex(nextIndex);
    setIsPlaying(true);
    sendToOBS({ src: nextSong?.path, trackName: nextSong?.name, isPlaying: true, currentTime: 0 });
  };

  const playPrev = () => {
    if (displaySongs.length === 0) return;
    const prevIndex = (currentIndex - 1 + displaySongs.length) % displaySongs.length;
    const prevSong = displaySongs[prevIndex];
    setCurrentIndex(prevIndex);
    setIsPlaying(true);
    sendToOBS({ src: prevSong?.path, trackName: prevSong?.name, isPlaying: true, currentTime: 0 });
  };

  const playSong = (index: number) => {
    const song = displaySongs[index];
    setCurrentIndex(index);
    setIsPlaying(true);
    sendToOBS({ src: song?.path, trackName: song?.name, isPlaying: true, currentTime: 0 });
  };

  // Keep skip handler ref updated for chat commands
  useEffect(() => {
    skipHandlerRef.current = playNext;
  }, [displaySongs, currentIndex]);

  // Switch to playlist by name (for chat commands)
  const switchToPlaylist = (name: string) => {
    const playlist = playlists.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (playlist && playlist.songs.length > 0) {
      // Start at random song (shuffle mode)
      const randomIndex = Math.floor(Math.random() * playlist.songs.length);
      setSelectedPlaylistId(playlist.id);
      setCurrentIndex(randomIndex);
      setIsPlaying(true);
      const song = playlist.songs[randomIndex];
      sendToOBS({ src: song.path, trackName: song.name, isPlaying: true, currentTime: 0 });
      console.log('Switched to playlist:', name, 'starting at song', randomIndex + 1);
    } else {
      console.log('Playlist not found or empty:', name);
    }
  };

  // Keep playlist handler ref updated
  useEffect(() => {
    playlistHandlerRef.current = switchToPlaylist;
  }, [playlists]);

  // Switch to library (for chat commands)
  const switchToLibrary = () => {
    if (songs.length > 0) {
      // Start at random song (shuffle mode)
      const randomIndex = Math.floor(Math.random() * songs.length);
      setSelectedPlaylistId(null);
      setCurrentIndex(randomIndex);
      setIsPlaying(true);
      const song = songs[randomIndex];
      sendToOBS({ src: song.path, trackName: song.name, isPlaying: true, currentTime: 0 });
      console.log('Switched to library, starting at song', randomIndex + 1);
    }
  };

  // Keep library handler ref updated
  useEffect(() => {
    libraryHandlerRef.current = switchToLibrary;
  }, [songs]);

  useEffect(() => {
    if (audioRef.current && currentSong && isPlaying) {
      // Ensure analyzer/gainNode are set up before playing
      if (!analyserRef.current) {
        setupAnalyzer();
      }
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
    sendToOBS({ currentTime: time });
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
              // Start at random song (shuffle mode)
              const randomIndex = songs.length > 0 ? Math.floor(Math.random() * songs.length) : 0;
              setSelectedPlaylistId(null);
              setCurrentIndex(randomIndex);
              setShowLibrary(true);
              setIsPlaying(true);
              const song = songs[randomIndex];
              if (song) {
                sendToOBS({ src: song.path, trackName: song.name, isPlaying: true, currentTime: 0 });
              }
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
                // Start at random song (shuffle mode)
                const randomIndex = playlist.songs.length > 0 ? Math.floor(Math.random() * playlist.songs.length) : 0;
                setSelectedPlaylistId(playlist.id);
                setCurrentIndex(randomIndex);
                setShowLibrary(false);
                setIsPlaying(true);
                const song = playlist.songs[randomIndex];
                if (song) {
                  sendToOBS({ src: song.path, trackName: song.name, isPlaying: true, currentTime: 0 });
                }
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
                // Control GainNode for local volume (OBS still gets full audio)
                if (gainNodeRef.current) {
                  gainNodeRef.current.gain.value = v;
                } else if (audioRef.current) {
                  // Fallback if analyzer not set up yet
                  audioRef.current.volume = v;
                }
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
      {/* Superchat notification sound */}
      <audio
        ref={superChatSoundRef}
        src="media:///Users/dylan/Desktop/projects/music-player/electron-player/sounds/superchat.mp3"
        preload="auto"
      />
    </div>
  );
}

export default App;
