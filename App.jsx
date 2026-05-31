import { useState, useRef, useEffect, useCallback } from "react";

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

const DEMO = [
  { time: 0,  text: "Carga tus canciones con el botón + MÚSICA" },
  { time: 5,  text: "Sube un archivo .lrc para la letra sincronizada" },
  { time: 10, text: "Toca cualquier pista de la lista" },
  { time: 15, text: "Disfruta tu música ♪" },
];

const isElectron = typeof window !== "undefined" && !!window.electronAPI;

/* ─── Visualizer ─── */
function Viz({ analyser, playing }) {
  const ref = useRef();
  const raf = useRef();
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext("2d");
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      if (!analyser || !playing) {
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= W; x++) {
          const y = H / 2 + Math.sin(x / 28 + Date.now() / 900) * 5;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const bw = W / buf.length * 2.2;
      buf.forEach((v, i) => {
        const h = (v / 255) * H * 0.9;
        ctx.fillStyle = `rgba(255,255,255,${0.12 + (v / 255) * 0.7})`;
        ctx.beginPath();
        ctx.roundRect(i * (bw + 1), H - h, bw, h, 2);
        ctx.fill();
      });
    };
    draw();
    return () => cancelAnimationFrame(raf.current);
  }, [analyser, playing]);
  return <canvas ref={ref} width={900} height={60} style={{ width: "100%", height: 60, display: "block" }} />;
}

/* ─── Lyrics ─── */
function Lyrics({ lines, t }) {
  const wrap = useRef();
  const active = useRef();
  const idx = lines.reduce((a, l, i) => t >= l.time ? i : a, -1);
  useEffect(() => {
    active.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idx]);
  return (
    <div ref={wrap} style={{ height: "100%", overflowY: "auto", padding: "28px 20px", scrollbarWidth: "none" }}>
      {lines.map((l, i) => {
        const on = i === idx, past = i < idx;
        return (
          <p key={i} ref={on ? active : null} style={{
            margin: "0 0 22px", textAlign: "center",
            fontFamily: "'Syne', sans-serif",
            fontSize: on ? "clamp(1.1rem,3vw,1.4rem)" : "clamp(0.85rem,2.5vw,1rem)",
            fontWeight: on ? 700 : 400,
            color: on ? "#fff" : past ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.42)",
            letterSpacing: on ? "0.01em" : "0.02em",
            transition: "all 0.35s cubic-bezier(.4,0,.2,1)",
            transform: on ? "scale(1.04)" : "scale(1)",
            lineHeight: 1.4,
          }}>{l.text}</p>
        );
      })}
      {lines.length === 0 && (
        <div style={{ textAlign: "center", marginTop: 60, color: "rgba(255,255,255,0.18)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>♩</div>
          <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.85rem" }}>
            Sube un archivo .lrc para ver la letra
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── App ─── */
export default function App() {
  const [playlist, setPlaylist] = useState([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ct, setCt] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.85);
  const [tab, setTab] = useState("lyrics");
  const [lyrics, setLyrics] = useState(DEMO);
  const [analyser, setAnalyser] = useState(null);

  const mediaRef = useRef();
  const actxRef = useRef();
  const srcRef = useRef();
  const fileIn = useRef();
  const lrcIn = useRef();

  const track = playlist[idx] || null;

  const setupAudio = useCallback((el) => {
    if (!el) return;
    if (!actxRef.current) actxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = actxRef.current;
    try { srcRef.current?.disconnect(); } catch {}
    const src = ctx.createMediaElementSource(el);
    const anl = ctx.createAnalyser();
    anl.fftSize = 512;
    src.connect(anl);
    anl.connect(ctx.destination);
    srcRef.current = src;
    setAnalyser(anl);
  }, []);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !track) return;
    el.src = track.url;
    el.load();
    if (playing) el.play().catch(() => {});
  }, [idx, track]);

  useEffect(() => { if (mediaRef.current) mediaRef.current.volume = vol; }, [vol]);

  const addFromInput = (files) => {
    const tracks = [...files]
      .filter(f => f.type.startsWith("audio/") || f.type.startsWith("video/"))
      .map(f => ({ name: f.name.replace(/\.[^/.]+$/, ""), url: URL.createObjectURL(f), type: f.type.startsWith("video/") ? "video" : "audio" }));
    if (!tracks.length) return;
    setPlaylist(p => { if (p.length === 0) setIdx(0); return [...p, ...tracks]; });
  };

  // REPARADO AQUÍ: Cambiado file:/// por media:/// para usar el protocolo de streaming de tu main.js
  const addFromPaths = (paths) => {
    const tracks = paths.map(p => {
      const name = p.split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
      const ext = p.split(".").pop().toLowerCase();
      const videoExts = ["mp4","mkv","avi","mov","webm"];
      return { 
        name, 
        url: `media:///${p.replace(/\\/g, "/")}`, 
        type: videoExts.includes(ext) ? "video" : "audio" 
      };
    });
    setPlaylist(p => { if (p.length === 0) setIdx(0); return [...p, ...tracks]; });
  };

  const openFiles = async () => {
    if (isElectron) {
      const paths = await window.electronAPI.openFiles();
      if (paths?.length) addFromPaths(paths);
    } else {
      fileIn.current?.click();
    }
  };

  const loadLRC = (file) => {
    const fr = new FileReader();
    fr.onload = e => setLyrics(parseLRC(e.target.result));
    fr.readAsText(file);
  };

  const go = (dir) => {
    const n = idx + dir;
    if (n >= 0 && n < playlist.length) { setIdx(n); setPlaying(true); }
  };

  const togglePlay = async () => {
    const el = mediaRef.current;
    if (!el || !track) return;
    if (actxRef.current?.state === "suspended") actxRef.current.resume();
    if (playing) { el.pause(); setPlaying(false); }
    else { await el.play(); setPlaying(true); }
  };

  const seek = (e) => {
    if (!mediaRef.current || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const v = ((e.clientX - rect.left) / rect.width) * dur;
    
    // Cambiar la posición del reproductor nativo primero y forzar renderizado
    mediaRef.current.currentTime = v;
    setCt(v);
  };

  const pct = dur ? (ct / dur) * 100 : 0;
  const bg = ["#0e0e0e","#0d1117","#0f0e0b","#0b0f14","#0e0b0f","#100e0a"][idx % 6];

  return (
    <div style={{ height: "100dvh", background: bg, display: "flex", flexDirection: "column", transition: "background 1s", userSelect: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Azeret+Mono:wght@300;400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        button { cursor: pointer; font-family: 'Syne', sans-serif; }
        input[type=range] { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.12); height: 3px; border-radius: 99px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; cursor: pointer; }
        .shell { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 250px; min-width: 250px; display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,0.06); overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .btn-ghost { background: none; border: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,0.55); border-radius: 6px; padding: 7px 13px; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em; transition: border-color 0.2s, color 0.2s; }
        .btn-ghost:hover { border-color: rgba(255,255,255,0.5); color: #fff; }
        .pl-item { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; border-left: 2px solid transparent; transition: background 0.15s; }
        .pl-item:hover { background: rgba(255,255,255,0.03); }
        .pl-item.active { background: rgba(255,255,255,0.06); border-left-color: #fff; }
        .tab-btn { background: none; border: none; padding: 12px 20px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.15em; color: rgba(255,255,255,0.25); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.2s, border-color 0.2s; }
        .tab-btn.active { color: #fff; border-bottom-color: #fff; }
        .ctrl-btn { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 1.1rem; padding: 8px; border-radius: 8px; transition: color 0.15s; }
        .ctrl-btn:hover { color: #fff; }
        @media (max-width: 640px) {
          .shell { flex-direction: column; }
          .sidebar { width: 100%; min-width: unset; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); max-height: 36dvh; }
        }
      `}</style>

      {!isElectron && (
        <>
          <input ref={fileIn} type="file" accept="audio/*,video/*" multiple hidden onChange={e => addFromInput(e.target.files)} />
          <input ref={lrcIn} type="file" accept=".lrc" hidden onChange={e => { if (e.target.files[0]) loadLRC(e.target.files[0]); }} />
        </>
      )}
      {isElectron && (
        <input ref={lrcIn} type="file" accept=".lrc" hidden onChange={e => { if (e.target.files[0]) loadLRC(e.target.files[0]); }} />
      )}

      {track?.type === "video"
        ? <video ref={mediaRef}
            onTimeUpdate={() => setCt(mediaRef.current?.currentTime || 0)}
            onDurationChange={() => setDur(mediaRef.current?.duration || 0)}
            onEnded={() => go(1)}
            onCanPlay={() => setupAudio(mediaRef.current)}
            style={tab === "video" ? { maxWidth: "100%", maxHeight: "100%", display: "block", margin: "auto" } : { position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
        : <audio ref={mediaRef}
            onTimeUpdate={() => setCt(mediaRef.current?.currentTime || 0)}
            onDurationChange={() => setDur(mediaRef.current?.duration || 0)}
            onEnded={() => go(1)}
            onCanPlay={() => setupAudio(mediaRef.current)} />
      }

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
        WebkitAppRegion: "drag",
      }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: "0.78rem", letterSpacing: "0.2em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
          WAVE
        </span>
        <div style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" }}>
          <button className="btn-ghost" onClick={openFiles}>+ MÚSICA</button>
          <button className="btn-ghost" onClick={() => lrcIn.current?.click()}>+ LETRA .lrc</button>
        </div>
      </header>

      <div className="shell">
        {/* Sidebar playlist */}
        <aside className="sidebar">
          <div style={{ padding: "14px 14px 8px", flexShrink: 0 }}>
            <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.62rem", color: "rgba(255,255,255,0.28)", letterSpacing: "0.14em" }}>
              LISTA — {playlist.length}
            </span>
          </div>

          {playlist.length === 0 && (
            <div onClick={openFiles}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (!isElectron) addFromInput(e.dataTransfer.files); }}
              style={{ margin: "8px 12px", borderRadius: 10, border: "1.5px dashed rgba(255,255,255,0.1)", padding: "30px 16px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
            >
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.35 }}>↑</div>
              <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.78rem", color: "rgba(255,255,255,0.28)" }}>
                {isElectron ? "Clic para abrir archivos" : "Arrastra o clic para cargar"}
              </p>
            </div>
          )}

          {playlist.map((t, i) => (
            <div key={i} className={`pl-item${i === idx ? " active" : ""}`} onClick={() => { setIdx(i); setPlaying(true); }}>
              <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.58rem", color: "rgba(255,255,255,0.22)", minWidth: 18 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.8rem", color: i === idx ? "#fff" : "rgba(255,255,255,0.42)", fontWeight: i === idx ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.type === "video" ? "▷ " : ""}{t.name}
              </span>
            </div>
          ))}
        </aside>

        {/* Content */}
        <div className="main">
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            {[["lyrics","LETRA"],["video","VIDEO"]].map(([k,l]) => (
              <button key={k} className={`tab-btn${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {tab === "lyrics"
              ? <Lyrics lines={lyrics} t={ct} />
              : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
                  {track?.type === "video"
                    ? <div id="video-container" style={{ width: "100%", height: "100%", display: "flex" }} />
                    : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.15)" }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>▷</div>
                        <p style={{ fontFamily: "'Syne',sans-serif", fontSize: "0.8rem" }}>
                          {track ? "Este archivo es solo audio" : "Carga un video"}
                        </p>
                      </div>
                  }
                </div>
              )
            }
          </div>
        </div>
      </div>

      {tab === "video" && track?.type === "video" && mediaRef.current && (
        <PortalToId targetId="video-container" element={mediaRef.current} />
      )}

      {/* Visualizer */}
      <div style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <Viz analyser={analyser} playing={playing} />
      </div>

      {/* Controls */}
      <footer style={{ padding: "14px 20px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: "clamp(0.9rem,2.5vw,1.1rem)", color: "#fff", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {track?.name || "Sin canción"}
          </span>
          <span style={{ fontFamily: "'Azeret Mono',monospace", fontSize: "0.68rem", color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
            {fmt(ct)} / {fmt(dur)}
          </span>
        </div>

        {/* Progress Bar */}
        <div onClick={seek} style={{ height: 12, display: 'flex', alignItems: 'center', cursor: "pointer", marginBottom: 12, position: "relative" }}>
          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 99, width: '100%', position: "relative" }}>
            <div style={{ height: "100%", background: "#fff", borderRadius: 99, width: `${pct}%`, position: "relative" }}>
              <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
            </div>
          </div>
        </div>

        {/* Transport */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <span style={{ fontSize: "0.75rem", opacity: 0.3 }}>♪</span>
            <input type="range" min={0} max={1} step={0.01} value={vol} onChange={e => setVol(+e.target.value)} style={{ maxWidth: 85 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="ctrl-btn" onClick={() => go(-1)}>⏮</button>
            <button onClick={togglePlay} style={{
              width: 50, height: 50, borderRadius: "50%", background: "#fff", border: "none",
              color: bg, fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "opacity 0.15s, transform 0.12s", flexShrink: 0,
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              onMouseDown={e => e.currentTarget.style.transform = "scale(0.93)"}
              onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            >{playing ? "⏸" : "▶"}</button>
            <button className="ctrl-btn" onClick={() => go(1)}>⏭</button>
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </footer>
    </div>
  );
}

function PortalToId({ targetId, element }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (target && element) {
      target.appendChild(element);
      return () => {
        document.body.appendChild(element);
      };
    }
  }, [targetId, element]);
  return null;
}
