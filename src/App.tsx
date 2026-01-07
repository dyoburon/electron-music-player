import { useState, useRef, useEffect } from "react";

interface Song {
  name: string;
  path: string;
}

// Check if running in Electron
const isElectron = () => {
  return window.electronAPI !== undefined;
};

function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(16).fill(5));
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const currentSong = songs[currentIndex];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load saved songs on mount
  useEffect(() => {
    loadSavedSongs();
  }, []);

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter((f) =>
      f.type.startsWith("audio/") ||
      /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name)
    );

    if (audioFiles.length === 0) return;

    if (isElectron()) {
      const filePaths = audioFiles.map((f) => (f as any).path);
      if (filePaths[0]) {
        const copiedSongs = await window.electronAPI.copyToSongs(filePaths);
        setSongs((prev) => [...prev, ...copiedSongs]);
      }
    } else {
      const newSongs = audioFiles.map((file) => ({
        name: file.name,
        path: URL.createObjectURL(file),
      }));
      setSongs((prev) => [...prev, ...newSongs]);
    }
  };

  const loadSavedSongs = async () => {
    if (!isElectron()) return;

    try {
      const savedSongs = await window.electronAPI.loadSongs();
      setSongs(savedSongs);
    } catch {
      // Failed to load songs
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

  // Handle browser file input change
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
    e.target.value = ""; // Reset input
  };

  // Setup audio analyzer for visualizer
  const setupAnalyzer = () => {
    if (!audioRef.current || analyserRef.current) return;

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 32;

    const source = audioContextRef.current.createMediaElementSource(audioRef.current);
    source.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);
  };

  // Visualizer animation
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
    if (songs.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % songs.length);
    setIsPlaying(true);
  };

  const playPrev = () => {
    if (songs.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + songs.length) % songs.length);
    setIsPlaying(true);
  };

  const deleteSong = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSongs((prev) => {
      const newSongs = prev.filter((_, i) => i !== index);
      return newSongs;
    });

    // Adjust current index if needed
    if (index < currentIndex) {
      setCurrentIndex((prev) => prev - 1);
    } else if (index === currentIndex) {
      setIsPlaying(false);
      if (currentIndex >= songs.length - 1) {
        setCurrentIndex(0);
      }
    }
  };

  const clearPlaylist = () => {
    setSongs([]);
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  useEffect(() => {
    if (audioRef.current && currentSong && isPlaying) {
      audioRef.current.play();
    }
  }, [currentIndex]);

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
    <div
      className={`crt ${isDragging ? "dragging" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for browser mode */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="audio/*"
        multiple
        onChange={handleFileInput}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-text">DROP AUDIO FILES HERE</div>
        </div>
      )}

      <div className="player">
        <div className="player-header">
          <span className="title-text">RETRO PLAYER</span>
        </div>

        <div className="visualizer">
          {visualizerData.map((height, i) => (
            <div
              key={i}
              className="bar"
              style={{ height: `${height}px` }}
            />
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
          <button onClick={playPrev} className="ctrl-btn">⏮</button>
          <button onClick={togglePlay} className="ctrl-btn play-btn">
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button onClick={playNext} className="ctrl-btn">⏭</button>
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

        <div className="playlist">
          <div className="playlist-header">
            <span>PLAYLIST ({songs.length})</span>
            <div className="playlist-actions">
              {songs.length > 0 && (
                <button className="clear-btn" onClick={clearPlaylist}>CLEAR</button>
              )}
              <button className="add-btn" onClick={addSongs}>+ ADD</button>
            </div>
          </div>
          <div className="playlist-items">
            {songs.length === 0 ? (
              <div className="empty-playlist" onClick={addSongs}>
                Drop audio files here or click to add
              </div>
            ) : (
              songs.map((song, i) => (
                <div
                  key={i}
                  className={`playlist-item ${i === currentIndex ? "active" : ""}`}
                  onClick={() => {
                    setCurrentIndex(i);
                    setIsPlaying(true);
                  }}
                >
                  <span className="track-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="track-name">{song.name}</span>
                  <button
                    className="delete-btn"
                    onClick={(e) => deleteSong(i, e)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <audio
          ref={audioRef}
          src={currentSong?.path}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
          onEnded={playNext}
          onCanPlay={() => {
            if (isPlaying && audioRef.current?.paused) {
              audioRef.current.play();
            }
          }}
        />
      </div>
    </div>
  );
}

export default App;
