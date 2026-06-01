import { useState, useRef, useEffect, useCallback } from "react";

/* ─── Utils ─── */
const fmt = (t) => {
  if (!t || isNaN(t)) return "0:00";
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
};
const parseLRC = (text) => {
  const re = /\[(\d+):(\d+)[.:](\d+)\]/g;
  const out = [];
  for (const line of text.split("\n")) {
    const matches = [...line.matchAll(re)];
    const lyric = line.replace(re, "").trim();
    if (!lyric) continue;
    for (const m of matches)
      out.push({ time: +m[1] * 60 + +m[2] + +m[3] / 100, text: lyric });
  }
  return out.sort((a, b) => a.time - b.time);
};
const fetchLyrics = async (filename) => {
  try {
    const clean = filename.replace(/^\d+[\s._-]+/, "").replace(/[_]/g, " ").trim();
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data.find(d => d.syncedLyrics) || data[0];
    if (!hit) return null;
    if (hit.syncedLyrics) return parseLRC(hit.syncedLyrics);
    return hit.plainLyrics
      ? hit.plainLyrics.split("\n").filter(Boolean).map((text, i) => ({ time: i * 3, text }))
      : null;
  } catch { return null; }
};
const isElectron = typeof window !== "undefined" && !!window.electronAPI;
const videoExts = ["mp4","mkv","avi","mov","webm"];
const FOLDER_KEY = "wave_last_folder";

/* ─── Icons ─── */
const IconPrev = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <rect x="3" y="3" width="2.5" height="14" rx="1.2"/>
    <path d="M16.5 4.2L7.5 10l9 5.8V4.2z"/>
  </svg>
);
const IconNext = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <rect x="14.5" y="3" width="2.5" height="14" rx="1.2"/>
    <path d="M3.5 4.2L12.5 10l-9 5.8V4.2z"/>
  </svg>
);
const IconPlay = ({ bg }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill={bg}>
    <path d="M5.5 3.8L17 10 5.5 16.2V3.8z"/>
  </svg>
);
const IconPause = ({ bg }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill={bg}>
    <rect x="4" y="3" width="4" height="14" rx="1.5"/>
    <rect x="12" y="3" width="4" height="14" rx="1.5"/>
  </svg>
);

/* ─── Visualizer ─── */
function Viz({ playing, analyserRef }) {
  const cvRef = useRef();
  const rafRef = useRef();
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const particles = [];
    const spawnParticle = (x, strength) => {
      particles.push({ x, y: H, vx: (Math.random() - 0.5) * 1.5, vy: -(1 + strength * 4), size: 1 + strength * 2.5, alpha: 0.5 + strength * 0.4, life: 1 });
    };
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);
      const anl = analyserRef?.current;
      let fd = null;
      if (anl && playing) { fd = new Uint8Array(anl.frequencyBinCount); anl.getByteFrequencyData(fd); }
      const halfW = W / 2, barCount = 48;
      for (let i = 0; i < barCount; i++) {
        const v = fd ? (fd[Math.floor(i * fd.length / barCount / 2)] / 255) : (playing ? 0.08 + Math.random() * 0.12 : 0.03);
        const bh = v * H * 0.85;
        const bw = (halfW / barCount) - 1.5;
        ctx.fillStyle = `rgba(255,255,255,${0.08 + v * 0.7})`;
        const xr = halfW + i * (bw + 1.5);
        ctx.beginPath(); ctx.roundRect(xr, H - bh, bw, bh, 2); ctx.fill();
        const xl = halfW - (i + 1) * (bw + 1.5);
        ctx.beginPath(); ctx.roundRect(xl, H - bh, bw, bh, 2); ctx.fill();
        if (playing && i < 4 && v > 0.6 && Math.random() < 0.25)
          spawnParticle(halfW + (Math.random() - 0.5) * halfW * 0.5, v);
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= 0.02;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha * p.life})`; ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, analyserRef]);
  return <canvas ref={cvRef} width={900} height={80} style={{ width: "100%", height: 80, display: "block" }} />;
}

/* ─── Lyrics — tight RAF sync ─── */
function Lyrics({ lines, mediaRef, loading }) {
  const [ct, setCt] = useState(0);
  const wrapRef = useRef();
  const activeRef = useRef();

  useEffect(() => {
    let id;
    const tick = () => {
      if (mediaRef.current) setCt(mediaRef.current.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mediaRef]);

  const idx = lines.reduce((a, l, i) => ct >= l.time ? i : a, -1);
  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [idx]);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", animation: "pulse 1.5s ease-in-out infinite" }}>Buscando letra...</p>
    </div>
  );

  return (
    <div ref={wrapRef} style={{ height: "100%", overflowY: "auto", padding: "28px 24px", scrollbarWidth: "none", maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)" }}>
      {lines.map((l, i) => {
        const on = i === idx, dist = Math.abs(i - idx);
        return (
          <p key={i} ref={on ? activeRef : null} style={{ margin: "0 0 24px", textAlign: "center", fontFamily: "'Syne',sans-serif", fontSize: on ? "clamp(1.1rem,3vw,1.4rem)" : "clamp(0.85rem,2.5vw,1rem)", fontWeight: on ? 700 : 400, color: "#fff", opacity: on ? 1 : Math.max(0.12, 0.5 - dist * 0.1), filter: `blur(${on ? 0 : Math.min(dist * 1.2, 4)}px)`, transition: "opacity 0.35s ease, filter 0.35s ease, font-size 0.35s ease, transform 0.35s ease", transform: on ? "scale(1.04)" : "scale(1)", lineHeight: 1.45 }}>{l.text}</p>
        );
      })}
      {lines.length === 0 && (
        <div style={{ textAlign: "center", marginTop: 80, color: "rgba(255,255,255,0.18)" }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>♩</div>
          <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.85rem" }}>No se encontró letra</p>
          <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.75rem", marginTop: 6, opacity: 0.6 }}>Puedes subir un .lrc manualmente</p>
        </div>
      )}
    </div>
  );
}

/* ─── Welcome Modal ─── */
function WelcomeModal({ onOpenFolder, onSkip }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <div style={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "40px 44px", textAlign: "center", maxWidth: 380, boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>♫</div>
        <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "1.3rem", color: "#fff", marginBottom: 10 }}>Bienvenido a Wave</h2>
        <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", marginBottom: 28, lineHeight: 1.6 }}>
          ¿Quieres cargar una carpeta con tu música para empezar?
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onOpenFolder} style={{ background: "#fff", border: "none", borderRadius: 10, padding: "11px 24px", fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", transition: "opacity 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >Abrir carpeta</button>
          <button onClick={onSkip} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "11px 24px", fontFamily: "'Syne',sans-serif", fontWeight: 600, fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", cursor: "pointer", transition: "border-color 0.2s,color 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          >Más tarde</button>
        </div>
      </div>
    </div>
  );
}

/* ─── App ─── */
export default function App() {
  const [playlist, setPlaylist] = useState([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.85);
  const [tab, setTab] = useState("lyrics");
  const [lyrics, setLyrics] = useState([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ct, setCt] = useState(0);
  const [showWelcome, setShowWelcome] = useState(() => isElectron && !localStorage.getItem(FOLDER_KEY));

  const audioRef = useRef();   // for audio-only tracks
  const videoRef = useRef();   // for video tracks — handles its OWN audio
  const analyserRef = useRef();
  const actxRef = useRef();
  const srcRef = useRef();
  const progressFillRef = useRef();
  const fileIn = useRef();
  const lrcIn = useRef();
  const footerRef = useRef();
  const playingRef = useRef(false);
  const loadedIdxRef = useRef(-1);

  const track = playlist[idx] || null;
  const isVideo = track?.type === "video";

  // The active media element — video handles itself when playing video
  const activeRef = isVideo ? videoRef : audioRef;

  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Progress bar via direct DOM — smooth, no React re-render
  useEffect(() => {
    let id;
    const tick = () => {
      const el = activeRef.current;
      if (el) {
        const pct = el.duration ? (el.currentTime / el.duration) * 100 : 0;
        if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
        setCt(el.currentTime);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [isVideo]);

  const setupAudio = useCallback((el) => {
    if (!el || el._waveSetup) return;
    el._waveSetup = true;
    if (!actxRef.current) actxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = actxRef.current;
    try { srcRef.current?.disconnect(); } catch {}
    const src = ctx.createMediaElementSource(el);
    const anl = ctx.createAnalyser();
    anl.fftSize = 256;
    src.connect(anl); anl.connect(ctx.destination);
    srcRef.current = src; analyserRef.current = anl;
  }, []);

  // Load saved folder on startup
  useEffect(() => {
    if (!isElectron) return;
    const saved = localStorage.getItem(FOLDER_KEY);
    if (saved) {
      window.electronAPI.openFolderPath(saved).then(paths => {
        if (paths?.length) { loadedIdxRef.current = -1; setIdx(0); setPlaylist(pathsToTracks(paths)); }
      }).catch(() => {});
    }
  }, []);

  // Load track — route to correct element
  useEffect(() => {
    if (!track) return;
    if (loadedIdxRef.current === idx) return;
    loadedIdxRef.current = idx;

    if (isVideo) {
      // Stop audio if it was playing
      const ael = audioRef.current;
      if (ael) { ael.pause(); ael.src = ""; }
      const vel = videoRef.current;
      if (vel) {
        vel.src = track.url; vel.load();
        vel.volume = vol;
        if (playingRef.current) vel.play().catch(() => {});
      }
    } else {
      // Stop video if it was playing
      const vel = videoRef.current;
      if (vel) { vel.pause(); vel.src = ""; }
      const ael = audioRef.current;
      if (ael) {
        ael.src = track.url; ael.load();
        ael.volume = vol;
        if (playingRef.current) ael.play().catch(() => {});
      }
    }

    setCt(0); setDur(0);
    setLyrics([]); setLyricsLoading(true);
    fetchLyrics(track.name).then(lines => { setLyrics(lines || []); setLyricsLoading(false); });
  }, [idx, playlist, isVideo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol;
    if (videoRef.current) videoRef.current.volume = vol;
  }, [vol]);

  // Scroll = volume
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const onWheel = (e) => { e.preventDefault(); setVol(v => Math.max(0, Math.min(1, v - e.deltaY * 0.001))); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pathsToTracks = (paths) => paths.map(p => ({
    name: p.split(/[\\/]/).pop().replace(/\.[^/.]+$/, ""),
    url: `file:///${p.replace(/\\/g, "/")}`,
    type: videoExts.includes(p.split(".").pop().toLowerCase()) ? "video" : "audio"
  }));

  const addFromInput = (files) => {
    const tracks = [...files].filter(f => f.type.startsWith("audio/") || f.type.startsWith("video/"))
      .map(f => ({ name: f.name.replace(/\.[^/.]+$/, ""), url: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" : "audio" }));
    if (!tracks.length) return;
    setPlaylist(p => { if (p.length === 0) { loadedIdxRef.current = -1; setIdx(0); } return [...p, ...tracks]; });
  };

  const addFromPaths = (paths) => {
    const tracks = pathsToTracks(paths);
    if (!tracks.length) return;
    setPlaylist(p => { if (p.length === 0) { loadedIdxRef.current = -1; setIdx(0); } return [...p, ...tracks]; });
  };

  const openFiles = async () => {
    if (isElectron) { const paths = await window.electronAPI.openFiles(); if (paths?.length) addFromPaths(paths); }
    else fileIn.current?.click();
  };

  const openFolder = async () => {
    if (isElectron) {
      const result = await window.electronAPI.openFolder();
      if (result?.paths?.length) {
        if (result.folderPath) localStorage.setItem(FOLDER_KEY, result.folderPath);
        loadedIdxRef.current = -1; setIdx(0); setPlaylist(pathsToTracks(result.paths));
      }
    } else fileIn.current?.click();
    setShowWelcome(false);
  };

  const loadLRC = (file) => {
    const fr = new FileReader();
    fr.onload = e => { setLyrics(parseLRC(e.target.result)); setLyricsLoading(false); };
    fr.readAsText(file);
  };

  const handleEnded = useCallback(() => {
    setIdx(prev => {
      if (prev + 1 < playlist.length) { loadedIdxRef.current = -1; setPlaying(true); return prev + 1; }
      setPlaying(false); return prev;
    });
  }, [playlist.length]);

  const go = useCallback((dir) => {
    setIdx(prev => {
      const n = prev + dir;
      if (n >= 0 && n < playlist.length) { loadedIdxRef.current = -1; setPlaying(true); return n; }
      return prev;
    });
  }, [playlist.length]);

  const togglePlay = async () => {
    const el = activeRef.current;
    if (!el || !track) return;
    if (!isVideo && actxRef.current?.state === "suspended") actxRef.current.resume();
    if (playing) {
      el.pause(); setPlaying(false);
    } else {
      if (!isVideo) setupAudio(el);
      await el.play(); setPlaying(true);
    }
  };

  const seek = async (e) => {
    const el = activeRef.current;
    if (!el || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const v = Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * dur, dur));
    const wasPlaying = playingRef.current;
    el.pause(); el.currentTime = v; setCt(v);
    if (wasPlaying) { try { await el.play(); } catch {} }
  };

  const pct = dur ? (ct / dur) * 100 : 0;
  const bg = ["#0a0a0f","#0a0f0a","#0f0a0a","#0a0d12","#0e0a10","#0f0e08"][idx % 6];
  const auroraColors = [["#3b1f6e","#1a3a5c","#1a4a3a"],["#1a4a3a","#2d1f5e","#1a2a4a"],["#4a1a2a","#1a3a5c","#2d1f5e"],["#1a2a4a","#1a4a2a","#3b1f6e"],["#2d1a4e","#1a4a3a","#4a2a1a"],["#1a3a1a","#3b2a1a","#1a2a5c"]][idx % 6];

  return (
    <div style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Azeret+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        button { cursor: pointer; font-family: 'Syne', sans-serif; }
        input[type=range] { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.1); height: 3px; border-radius: 99px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #fff; cursor: pointer; }
        @keyframes auroraA { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,50px) scale(0.95)} }
        @keyframes auroraB { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-70px,30px) scale(1.05)} 66%{transform:translate(50px,-60px) scale(1.1)} }
        @keyframes auroraC { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,60px) scale(0.95)} 66%{transform:translate(-60px,-30px) scale(1.1)} }
        @keyframes pulse { 0%,100%{opacity:0.35} 50%{opacity:1} }
        .shell { display:flex; flex:1; overflow:hidden; }
        .sidebar { width:248px; min-width:248px; display:flex; flex-direction:column; border-right:1px solid rgba(255,255,255,0.07); overflow-y:auto; transition:width 0.3s ease,min-width 0.3s ease,opacity 0.25s; }
        .sidebar.closed { width:0!important; min-width:0!important; opacity:0; pointer-events:none; overflow:hidden; }
        .main { flex:1; display:flex; flex-direction:column; min-width:0; }
        .btn-ghost { background:none; border:1px solid rgba(255,255,255,0.13); color:rgba(255,255,255,0.5); border-radius:6px; padding:6px 12px; font-size:0.68rem; font-weight:600; letter-spacing:0.1em; transition:border-color 0.2s,color 0.2s; }
        .btn-ghost:hover { border-color:rgba(255,255,255,0.45); color:#fff; }
        .pl-item { padding:9px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; border-left:2px solid transparent; transition:background 0.15s,border-color 0.3s; }
        .pl-item:hover { background:rgba(255,255,255,0.03); }
        .pl-item.active { background:rgba(255,255,255,0.06); border-left-color:#fff; }
        .tab-btn { background:none; border:none; padding:11px 18px; font-size:0.68rem; font-weight:700; letter-spacing:0.15em; color:rgba(255,255,255,0.25); border-bottom:2px solid transparent; margin-bottom:-1px; transition:color 0.2s,border-color 0.2s; }
        .tab-btn.active { color:#fff; border-bottom-color:#fff; }
        .ctrl-btn { background:none; border:none; color:rgba(255,255,255,0.38); padding:8px; border-radius:8px; transition:color 0.15s,transform 0.1s; display:flex; align-items:center; justify-content:center; }
        .ctrl-btn:hover { color:#fff; }
        .ctrl-btn:active { transform:scale(0.88); }
        .play-btn { width:52px; height:52px; border-radius:50%; background:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:transform 0.12s,opacity 0.15s; }
        .play-btn:hover { opacity:0.85; }
        .play-btn:active { transform:scale(0.91); }
        .progress-track { height:4px; background:rgba(255,255,255,0.1); border-radius:99px; cursor:pointer; position:relative; transition:height 0.2s; }
        .progress-track:hover { height:7px; }
        .progress-track:hover .progress-dot { width:12px!important; height:12px!important; }
        @media (max-width:640px) {
          .shell { flex-direction:column; }
          .sidebar { width:100%!important; min-width:unset!important; border-right:none; border-bottom:1px solid rgba(255,255,255,0.07); max-height:34dvh; opacity:1!important; pointer-events:all!important; }
          .sidebar.closed { max-height:0!important; opacity:0!important; }
        }
      `}</style>

      {/* Aurora */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {auroraColors.map((c, i) => (
          <div key={i} style={{ position: "absolute", width: "55vw", height: "55vw", borderRadius: "50%", background: c, filter: "blur(90px)", opacity: 0.18, top: ["10%","50%","30%"][i], left: ["10%","60%","35%"][i], animation: [`auroraA`,`auroraB`,`auroraC`][i] + ` ${18 + i * 7}s ease-in-out infinite` }} />
        ))}
      </div>

      {showWelcome && <WelcomeModal onOpenFolder={openFolder} onSkip={() => setShowWelcome(false)} />}

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>

        {/* Audio element — only used for audio tracks */}
        <audio ref={audioRef} onDurationChange={() => { if (!isVideo) setDur(audioRef.current?.duration || 0); }} onEnded={handleEnded} />

        {/* Video element — used for video tracks, handles its own audio */}
        <video ref={videoRef} style={{ display: "none" }} onDurationChange={() => { if (isVideo) setDur(videoRef.current?.duration || 0); }} onEnded={handleEnded} />

        {!isElectron && <input ref={fileIn} type="file" accept="audio/*,video/*" multiple hidden onChange={e => addFromInput(e.target.files)} />}
        <input ref={lrcIn} type="file" accept=".lrc" hidden onChange={e => { if (e.target.files[0]) loadLRC(e.target.files[0]); }} />

        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, WebkitAppRegion: "drag", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, WebkitAppRegion: "no-drag" }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.38)", fontSize: "1rem", padding: "4px 6px", cursor: "pointer", borderRadius: 6, transition: "color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.color = "#fff"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.38)"}
            >{sidebarOpen ? "◧" : "▣"}</button>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "0.22em", color: "rgba(255,255,255,0.38)", textTransform: "uppercase" }}>WAVE</span>
          </div>
          <div style={{ display: "flex", gap: 7, WebkitAppRegion: "no-drag" }}>
            {isElectron && <button className="btn-ghost" onClick={openFolder}>📁 Carpeta</button>}
            <button className="btn-ghost" onClick={openFiles}>+ Música</button>
            <button className="btn-ghost" onClick={() => lrcIn.current?.click()}>+ .lrc</button>
          </div>
        </header>

        <div className="shell">
          <aside className={`sidebar${sidebarOpen ? "" : " closed"}`}>
            <div style={{ padding: "13px 14px 7px", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.6rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.14em" }}>LISTA — {playlist.length}</span>
            </div>
            {playlist.length === 0 && (
              <div onClick={openFiles}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (!isElectron) addFromInput(e.dataTransfer.files); }}
                style={{ margin: "8px 10px", borderRadius: 10, border: "1.5px dashed rgba(255,255,255,0.09)", padding: "28px 14px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
              >
                <div style={{ fontSize: 26, marginBottom: 7, opacity: 0.3 }}>↑</div>
                <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.76rem", color: "rgba(255,255,255,0.26)" }}>
                  {isElectron ? "Clic para abrir" : "Arrastra o clic"}
                </p>
              </div>
            )}
            {playlist.map((t, i) => (
              <div key={i} className={`pl-item${i === idx ? " active" : ""}`}
                onClick={() => { loadedIdxRef.current = -1; setIdx(i); setPlaying(true); }}>
                <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.56rem", color: "rgba(255,255,255,0.2)", minWidth: 16 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.78rem", color: i === idx ? "#fff" : "rgba(255,255,255,0.4)", fontWeight: i === idx ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.type === "video" ? "▷ " : ""}{t.name}
                </span>
                {i === idx && playing && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 2, alignItems: "flex-end", height: 14, flexShrink: 0 }}>
                    {[1,1.5,0.8].map((h, j) => (
                      <div key={j} style={{ width: 2, background: "#fff", borderRadius: 1, height: `${h * 8}px`, opacity: 0.6, animation: `pulse ${0.6 + j * 0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </aside>

          <div className="main">
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              {[["lyrics","LETRA"],["video","VIDEO"]].map(([k,l]) => (
                <button key={k} className={`tab-btn${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              {/* Lyrics */}
              <div style={{ position: "absolute", inset: 0, display: tab === "lyrics" ? "block" : "none" }}>
                <Lyrics lines={lyrics} mediaRef={activeRef} loading={lyricsLoading} />
              </div>
              {/* Video */}
              <div style={{ position: "absolute", inset: 0, display: tab === "video" ? "flex" : "none", alignItems: "center", justifyContent: "center", background: "#000" }}>
                {isVideo
                  ? <video
                      key={track?.url}
                      src={track?.url}
                      style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
                      ref={el => {
                        // Keep this display video in sync with the hidden videoRef
                        if (!el) return;
                        el.currentTime = videoRef.current?.currentTime || 0;
                        if (playing) el.play().catch(() => {});
                      }}
                      onPlay={() => { if (videoRef.current) videoRef.current.pause(); }}
                      muted={false}
                    />
                  : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.13)" }}>
                      <div style={{ fontSize: 44, marginBottom: 12 }}>▷</div>
                      <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.8rem" }}>{track ? "Solo audio" : "Carga un video"}</p>
                    </div>
                }
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <Viz playing={playing} analyserRef={analyserRef} />
        </div>

        <footer ref={footerRef} style={{ padding: "13px 20px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, backdropFilter: "blur(12px)" }}>
          <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "clamp(0.9rem,2.5vw,1.1rem)", color: "#fff", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {track?.name || "Sin canción"}
            </span>
            <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.66rem", color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
              {fmt(ct)} / {fmt(dur)}
            </span>
          </div>

          <div className="progress-track" onClick={seek} style={{ marginBottom: 15 }}>
            <div ref={progressFillRef} style={{ height: "100%", background: "#fff", borderRadius: 99, width: `${pct}%`, position: "relative" }}>
              <div className="progress-dot" style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderRadius: "50%", background: "#fff", transition: "width 0.2s,height 0.2s", boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
              <span style={{ fontSize: "0.7rem", opacity: 0.35 }}>{vol === 0 ? "🔇" : vol < 0.5 ? "🔉" : "🔊"}</span>
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={e => setVol(+e.target.value)} style={{ maxWidth: 80 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="ctrl-btn" onClick={() => go(-1)}><IconPrev /></button>
              <button className="play-btn" onClick={togglePlay}>
                {playing ? <IconPause bg={bg} /> : <IconPlay bg={bg} />}
              </button>
              <button className="ctrl-btn" onClick={() => go(1)}><IconNext /></button>
            </div>
            <div style={{ flex: 1 }} />
          </div>
        </footer>
      </div>
    </div>
  );
}
