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

/* ─── Particle Visualizer ─── */
function Viz({ playing, analyserRef }) {
  const cvRef = useRef();
  const rafRef = useRef();

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const particles = [];

    const spawnParticle = (x, strength) => {
      particles.push({
        x, y: H,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(1 + strength * 4),
        size: 1 + strength * 3,
        alpha: 0.6 + strength * 0.4,
        life: 1,
      });
    };

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);

      const anl = analyserRef?.current;
      let freqData = null;
      if (anl && playing) {
        freqData = new Uint8Array(anl.frequencyBinCount);
        anl.getByteFrequencyData(freqData);
      }

      // Mirror bars from center
      const halfW = W / 2;
      const barCount = 48;
      for (let i = 0; i < barCount; i++) {
        const v = freqData ? (freqData[Math.floor(i * freqData.length / barCount / 2)] / 255) : (playing ? 0.1 + Math.random() * 0.15 : 0.03);
        const bh = v * H * 0.85;
        const bw = (halfW / barCount) - 1.5;
        const alpha = 0.1 + v * 0.7;

        // Right side
        const xr = halfW + i * (bw + 1.5);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath(); ctx.roundRect(xr, H - bh, bw, bh, 2); ctx.fill();

        // Left side (mirror)
        const xl = halfW - (i + 1) * (bw + 1.5);
        ctx.beginPath(); ctx.roundRect(xl, H - bh, bw, bh, 2); ctx.fill();

        // Spawn particles on bass
        if (playing && i < 4 && v > 0.6 && Math.random() < 0.3) {
          spawnParticle(halfW + (Math.random() - 0.5) * halfW * 0.5, v);
        }
      }

      // Update & draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life -= 0.018;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha * p.life})`;
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, analyserRef]);

  return <canvas ref={cvRef} width={900} height={80} style={{ width: "100%", height: 80, display: "block" }} />;
}

/* ─── Lyrics ─── */
function Lyrics({ lines, t, loading }) {
  const wrapRef = useRef();
  const activeRef = useRef();
  const idx = lines.reduce((a, l, i) => t >= l.time ? i : a, -1);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idx]);

  if (loading) return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", animation: "pulse 1.5s ease-in-out infinite" }}>
        Buscando letra...
      </p>
    </div>
  );

  return (
    <div ref={wrapRef} style={{
      height: "100%", overflowY: "auto", padding: "28px 24px",
      scrollbarWidth: "none",
      maskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
      WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
    }}>
      {lines.map((l, i) => {
        const on = i === idx;
        const dist = Math.abs(i - idx);
        const blur = on ? 0 : Math.min(dist * 1.2, 4);
        const opacity = on ? 1 : Math.max(0.12, 0.55 - dist * 0.12);
        return (
          <p key={i} ref={on ? activeRef : null} style={{
            margin: "0 0 24px", textAlign: "center",
            fontFamily: "'Syne', sans-serif",
            fontSize: on ? "clamp(1.15rem,3vw,1.45rem)" : "clamp(0.85rem,2.5vw,1.05rem)",
            fontWeight: on ? 700 : 400,
            color: "#fff",
            opacity,
            filter: `blur(${blur}px)`,
            transition: "all 0.45s cubic-bezier(.4,0,.2,1)",
            transform: on ? "scale(1.05)" : "scale(1)",
            lineHeight: 1.45,
          }}>{l.text}</p>
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

/* ─── Play/Pause SVG Button ─── */
function PlayButton({ playing, onClick, bg }) {
  return (
    <button onClick={onClick} style={{
      width: 52, height: 52, borderRadius: "50%", background: "#fff", border: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", flexShrink: 0, transition: "transform 0.12s, opacity 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      onMouseDown={e => e.currentTarget.style.transform = "scale(0.92)"}
      onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill={bg}>
        {playing ? (
          <>
            <rect x="4" y="3" width="4.5" height="16" rx="1.5"
              style={{ transition: "all 0.25s cubic-bezier(.4,0,.2,1)" }} />
            <rect x="13.5" y="3" width="4.5" height="16" rx="1.5"
              style={{ transition: "all 0.25s cubic-bezier(.4,0,.2,1)" }} />
          </>
        ) : (
          <path d="M6 3.5L19 11L6 18.5V3.5Z" rx="1"
            style={{ transition: "all 0.25s cubic-bezier(.4,0,.2,1)" }} />
        )}
      </svg>
    </button>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [playlist, setPlaylist] = useState([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ct, setCt] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.85);
  const [tab, setTab] = useState("lyrics");
  const [lyrics, setLyrics] = useState([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [progressHover, setProgressHover] = useState(false);

  const audioRef = useRef();
  const videoRef = useRef();
  const analyserRef = useRef();
  const actxRef = useRef();
  const srcRef = useRef();
  const fileIn = useRef();
  const lrcIn = useRef();
  const playingRef = useRef(false);
  const footerRef = useRef();

  const track = playlist[idx] || null;
  const isVideo = track?.type === "video";

  useEffect(() => { playingRef.current = playing; }, [playing]);

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

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track) return;
    el.src = track.url; el.load();
    setCt(0); setDur(0);
    if (playingRef.current) el.play().catch(() => {});
    setLyrics([]); setLyricsLoading(true);
    fetchLyrics(track.name).then(lines => { setLyrics(lines || []); setLyricsLoading(false); });
  }, [idx]);

  useEffect(() => {
    const vel = videoRef.current;
    if (!vel || !track || !isVideo) return;
    vel.src = track.url; vel.load();
    if (playingRef.current) vel.play().catch(() => {});
  }, [idx, isVideo]);

  useEffect(() => {
    const audio = audioRef.current, video = videoRef.current;
    if (!audio || !video || !isVideo) return;
    const sync = () => { if (Math.abs(video.currentTime - audio.currentTime) > 0.5) video.currentTime = audio.currentTime; };
    audio.addEventListener("timeupdate", sync);
    return () => audio.removeEventListener("timeupdate", sync);
  }, [isVideo, idx]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = vol; }, [vol]);

  // Scroll to change volume
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setVol(v => Math.max(0, Math.min(1, v - e.deltaY * 0.001)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const addFromInput = (files) => {
    const tracks = [...files].filter(f => f.type.startsWith("audio/") || f.type.startsWith("video/"))
      .map(f => ({ name: f.name.replace(/\.[^/.]+$/, ""), url: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" : "audio" }));
    if (!tracks.length) return;
    setPlaylist(p => { if (p.length === 0) setIdx(0); return [...p, ...tracks]; });
  };
  const addFromPaths = (paths) => {
    const ve = ["mp4","mkv","avi","mov","webm"];
    const tracks = paths.map(p => ({ name: p.split(/[\\/]/).pop().replace(/\.[^/.]+$/, ""), url: `file:///${p.replace(/\\/g, "/")}`, type: ve.includes(p.split(".").pop().toLowerCase()) ? "video" : "audio" }));
    setPlaylist(p => { if (p.length === 0) setIdx(0); return [...p, ...tracks]; });
  };
  const openFiles = async () => {
    if (isElectron) { const paths = await window.electronAPI.openFiles(); if (paths?.length) addFromPaths(paths); }
    else fileIn.current?.click();
  };
  const loadLRC = (file) => {
    const fr = new FileReader();
    fr.onload = e => { setLyrics(parseLRC(e.target.result)); setLyricsLoading(false); };
    fr.readAsText(file);
  };

  const go = useCallback((dir) => {
    setIdx(prev => { const n = prev + dir; if (n >= 0 && n < playlist.length) { setPlaying(true); return n; } return prev; });
  }, [playlist.length]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !track) return;
    if (actxRef.current?.state === "suspended") actxRef.current.resume();
    if (playing) { el.pause(); videoRef.current?.pause(); setPlaying(false); }
    else { setupAudio(el); await el.play(); if (isVideo) videoRef.current?.play().catch(() => {}); setPlaying(true); }
  };

  const seek = async (e) => {
    const el = audioRef.current;
    if (!el || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const v = Math.max(0, Math.min(((e.clientX - rect.left) / rect.width) * dur, dur));
    const wasPlaying = playingRef.current;
    el.pause(); el.currentTime = v;
    if (videoRef.current) videoRef.current.currentTime = v;
    setCt(v);
    if (wasPlaying) { try { await el.play(); if (isVideo) videoRef.current?.play().catch(() => {}); } catch {} }
  };

  const pct = dur ? (ct / dur) * 100 : 0;
  const bg = ["#0a0a0f","#0a0f0a","#0f0a0a","#0a0d12","#0e0a10","#0f0e08"][idx % 6];
  const auroraColors = [
    ["#3b1f6e","#1a3a5c","#1a4a3a"],
    ["#1a4a3a","#2d1f5e","#1a2a4a"],
    ["#4a1a2a","#1a3a5c","#2d1f5e"],
    ["#1a2a4a","#1a4a2a","#3b1f6e"],
    ["#2d1a4e","#1a4a3a","#4a2a1a"],
    ["#1a3a1a","#3b2a1a","#1a2a5c"],
  ][idx % 6];

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
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        .sidebar-enter { animation: slideIn 0.3s ease forwards; }
        .progress-bar:hover .progress-wave { animation: wave 1s ease-in-out infinite; }
        @keyframes wave { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.15)} }
        .shell { display:flex; flex:1; overflow:hidden; }
        .sidebar { width:248px; min-width:248px; display:flex; flex-direction:column; border-right:1px solid rgba(255,255,255,0.07); overflow-y:auto; transition: width 0.3s ease, min-width 0.3s ease, opacity 0.2s; }
        .sidebar.closed { width:0; min-width:0; opacity:0; pointer-events:none; }
        .main { flex:1; display:flex; flex-direction:column; min-width:0; }
        .btn-ghost { background:none; border:1px solid rgba(255,255,255,0.13); color:rgba(255,255,255,0.5); border-radius:6px; padding:6px 12px; font-size:0.68rem; font-weight:600; letter-spacing:0.1em; transition:border-color 0.2s,color 0.2s; }
        .btn-ghost:hover { border-color:rgba(255,255,255,0.45); color:#fff; }
        .pl-item { padding:9px 14px; cursor:pointer; display:flex; align-items:center; gap:10px; border-left:2px solid transparent; transition:background 0.15s,border-color 0.25s; position:relative; }
        .pl-item:hover { background:rgba(255,255,255,0.03); }
        .pl-item.active { background:rgba(255,255,255,0.06); border-left-color:#fff; }
        .tab-btn { background:none; border:none; padding:11px 18px; font-size:0.68rem; font-weight:700; letter-spacing:0.15em; color:rgba(255,255,255,0.25); border-bottom:2px solid transparent; margin-bottom:-1px; transition:color 0.2s,border-color 0.2s; }
        .tab-btn.active { color:#fff; border-bottom-color:#fff; }
        .ctrl-btn { background:none; border:none; color:rgba(255,255,255,0.38); font-size:1rem; padding:8px; border-radius:8px; transition:color 0.15s,transform 0.1s; }
        .ctrl-btn:hover { color:#fff; }
        .ctrl-btn:active { transform:scale(0.9); }
        @media (max-width:640px) {
          .shell { flex-direction:column; }
          .sidebar { width:100%!important; min-width:unset!important; border-right:none; border-bottom:1px solid rgba(255,255,255,0.07); max-height:34dvh; opacity:1!important; pointer-events:all!important; }
          .sidebar.closed { max-height:0; opacity:0!important; overflow:hidden; }
        }
      `}</style>

      {/* Aurora background */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {auroraColors.map((c, i) => (
          <div key={i} style={{
            position: "absolute",
            width: "55vw", height: "55vw",
            borderRadius: "50%",
            background: c,
            filter: "blur(90px)",
            opacity: 0.18,
            top: ["10%", "50%", "30%"][i],
            left: ["10%", "60%", "35%"][i],
            animation: [`auroraA`, `auroraB`, `auroraC`][i] + ` ${18 + i * 7}s ease-in-out infinite`,
          }} />
        ))}
      </div>

      {/* Content above aurora */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>

        {/* Hidden media */}
        <audio ref={audioRef}
          onTimeUpdate={() => setCt(audioRef.current?.currentTime || 0)}
          onDurationChange={() => setDur(audioRef.current?.duration || 0)}
          onEnded={() => go(1)} />
        {!isElectron && <input ref={fileIn} type="file" accept="audio/*,video/*" multiple hidden onChange={e => addFromInput(e.target.files)} />}
        <input ref={lrcIn} type="file" accept=".lrc" hidden onChange={e => { if (e.target.files[0]) loadLRC(e.target.files[0]); }} />

        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, WebkitAppRegion: "drag", backdropFilter: "blur(12px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, WebkitAppRegion: "no-drag" }}>
            <button onClick={() => setSidebarOpen(o => !o)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "0.9rem", padding: "4px 6px", cursor: "pointer", borderRadius: 6, transition: "color 0.2s", lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.color = "#fff"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"}
              title="Modo Zen"
            >
              {sidebarOpen ? "◧" : "▣"}
            </button>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "0.22em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>WAVE</span>
          </div>
          <div style={{ display: "flex", gap: 7, WebkitAppRegion: "no-drag" }}>
            <button className="btn-ghost" onClick={openFiles}>+ MÚSICA</button>
            <button className="btn-ghost" onClick={() => lrcIn.current?.click()}>+ .lrc</button>
          </div>
        </header>

        <div className="shell">
          {/* Sidebar */}
          <aside className={`sidebar${sidebarOpen ? " sidebar-enter" : " closed"}`}>
            <div style={{ padding: "13px 14px 7px", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.6rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.14em" }}>
                LISTA — {playlist.length}
              </span>
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
                onClick={() => { setIdx(i); setPlaying(true); }}>
                <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.56rem", color: "rgba(255,255,255,0.2)", minWidth: 16 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.78rem", color: i === idx ? "#fff" : "rgba(255,255,255,0.4)", fontWeight: i === idx ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.type === "video" ? "▷ " : ""}{t.name}
                </span>
                {i === idx && playing && (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 2, alignItems: "flex-end", height: 14, flexShrink: 0 }}>
                    {[1,1.5,0.8].map((h, j) => (
                      <div key={j} style={{ width: 2, background: "#fff", borderRadius: 1, height: `${h * 8}px`, opacity: 0.7, animation: `pulse ${0.6 + j * 0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="main">
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              {[["lyrics","LETRA"],["video","VIDEO"]].map(([k,l]) => (
                <button key={k} className={`tab-btn${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {tab === "lyrics"
                ? <Lyrics lines={lyrics} t={ct} loading={lyricsLoading} />
                : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", position: "relative" }}>
                    {isVideo
                      ? <video ref={videoRef} muted style={{ maxWidth: "100%", maxHeight: "100%", display: "block", position: "relative", zIndex: 1 }} />
                      : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.13)" }}>
                          <div style={{ fontSize: 44, marginBottom: 12 }}>▷</div>
                          <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.8rem" }}>
                            {track ? "Solo audio" : "Carga un video"}
                          </p>
                        </div>
                    }
                  </div>
                )
              }
            </div>
          </div>
        </div>

        {/* Visualizer */}
        <div style={{ background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <Viz playing={playing} analyserRef={analyserRef} />
        </div>

        {/* Controls */}
        <footer ref={footerRef} style={{ padding: "13px 20px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, backdropFilter: "blur(12px)" }}>
          <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "clamp(0.9rem,2.5vw,1.1rem)", color: "#fff", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {track?.name || "Sin canción"}
            </span>
            <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.66rem", color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
              {fmt(ct)} / {fmt(dur)}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="progress-bar"
            onClick={seek}
            onMouseEnter={() => setProgressHover(true)}
            onMouseLeave={() => setProgressHover(false)}
            style={{ height: progressHover ? 7 : 4, background: "rgba(255,255,255,0.1)", borderRadius: 99, cursor: "pointer", marginBottom: 15, position: "relative", transition: "height 0.2s" }}
          >
            <div className="progress-wave" style={{ height: "100%", background: "#fff", borderRadius: 99, width: `${pct}%`, transition: "width 0.1s linear", position: "relative" }}>
              <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: progressHover ? 12 : 0, height: progressHover ? 12 : 0, borderRadius: "50%", background: "#fff", transition: "width 0.2s, height 0.2s", boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Volume */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
              <span style={{ fontSize: "0.7rem", opacity: vol > 0 ? 0.35 : 0.15 }}>
                {vol === 0 ? "🔇" : vol < 0.5 ? "🔉" : "🔊"}
              </span>
              <input type="range" min={0} max={1} step={0.01} value={vol}
                onChange={e => setVol(+e.target.value)} style={{ maxWidth: 80 }} />
            </div>

            {/* Transport */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="ctrl-btn" onClick={() => go(-1)}>⏮</button>
              <PlayButton playing={playing} onClick={togglePlay} bg={bg} />
              <button className="ctrl-btn" onClick={() => go(1)}>⏭</button>
            </div>

            <div style={{ flex: 1 }} />
          </div>
        </footer>
      </div>
    </div>
  );
}
