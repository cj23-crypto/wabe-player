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
const THEME_KEY  = "wave_theme";

/* ─── Themes ─── */
const THEMES = {
  wave: {
    name: "Wave", icon: "◈",
    bg: ["#0a0a0f","#0a0f0a","#0f0a0a","#0a0d12","#0e0a10","#0f0e08"],
    aurora: [["#3b1f6e","#1a3a5c","#1a4a3a"],["#1a4a3a","#2d1f5e","#1a2a4a"],["#4a1a2a","#1a3a5c","#2d1f5e"],["#1a2a4a","#1a4a2a","#3b1f6e"],["#2d1a4e","#1a4a3a","#4a2a1a"],["#1a3a1a","#3b2a1a","#1a2a5c"]],
    accent: "#ffffff", vizColor: (v) => `rgba(255,255,255,${0.08 + v * 0.7})`,
  },
  cyber: {
    name: "Cyberpunk", icon: "⬡",
    bg: ["#000000","#000000","#000000","#000000","#000000","#000000"],
    aurora: [["#ff00aa","#00ffff","#7700ff"],["#00ffff","#ff00aa","#7700ff"],["#7700ff","#00ffff","#ff00aa"],["#ff00aa","#7700ff","#00ffff"],["#00ffff","#7700ff","#ff00aa"],["#7700ff","#ff00aa","#00ffff"]],
    accent: "#ff00cc", vizColor: (v) => `rgba(${v > 0.5 ? "0,255,255" : "255,0,204"},${0.08 + v * 0.85})`,
  },
  amber: {
    name: "Retro Amber", icon: "◉",
    bg: ["#100c06","#100c06","#100c06","#100c06","#100c06","#100c06"],
    aurora: [["#3a1a00","#2a1500","#1a0a00"],["#2a1500","#3a1a00","#1a0a00"],["#1a0a00","#3a1a00","#2a1500"],["#3a1a00","#1a0a00","#2a1500"],["#2a1500","#1a0a00","#3a1a00"],["#1a0a00","#2a1500","#3a1a00"]],
    accent: "#e8820a", vizColor: (v) => `rgba(232,130,10,${0.08 + v * 0.85})`,
  },
  nordic: {
    name: "Nordic", icon: "◇",
    bg: ["#0f1318","#0f1318","#0f1318","#0f1318","#0f1318","#0f1318"],
    aurora: [["#0d2818","#102030","#0a1f28"],["#102030","#0d2818","#0a1f28"],["#0a1f28","#0d2818","#102030"],["#0d2818","#0a1f28","#102030"],["#102030","#0a1f28","#0d2818"],["#0a1f28","#102030","#0d2818"]],
    accent: "#5ec994", vizColor: (v) => `rgba(94,201,148,${0.08 + v * 0.85})`,
  },
  stealth: {
    name: "Stealth", icon: "▪",
    bg: ["#000000","#000000","#000000","#000000","#000000","#000000"],
    aurora: [["#111111","#0a0a0a","#080808"],["#0a0a0a","#111111","#080808"],["#080808","#111111","#0a0a0a"],["#111111","#080808","#0a0a0a"],["#0a0a0a","#080808","#111111"],["#080808","#0a0a0a","#111111"]],
    accent: "#ffffff", vizColor: (v) => `rgba(255,255,255,${0.04 + v * 0.5})`,
  },
};

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
const IconPlay = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill={color}>
    <path d="M5.5 3.8L17 10 5.5 16.2V3.8z"/>
  </svg>
);
const IconPause = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill={color}>
    <rect x="4" y="3" width="4" height="14" rx="1.5"/>
    <rect x="12" y="3" width="4" height="14" rx="1.5"/>
  </svg>
);

/* ─── Visualizer ─── */
function Viz({ playing, analyserRef, theme }) {
  const cvRef = useRef();
  const rafRef = useRef();
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const particles = [];
    const spawnParticle = (x, strength) => {
      particles.push({ x, y: H, vx: (Math.random()-0.5)*1.5, vy: -(1+strength*4), size: 1+strength*2.5, alpha: 0.5+strength*0.4, life: 1 });
    };
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);
      const anl = analyserRef?.current;
      let fd = null;
      if (anl && playing) {
        try { fd = new Uint8Array(anl.frequencyBinCount); anl.getByteFrequencyData(fd); } catch {}
      }
      const halfW = W/2, barCount = 48;
      for (let i = 0; i < barCount; i++) {
        const v = fd ? (fd[Math.floor(i*fd.length/barCount/2)]/255) : (playing ? 0.08+Math.random()*0.12 : 0.03);
        const bh = v*H*0.85, bw = (halfW/barCount)-1.5;
        ctx.fillStyle = theme.vizColor(v);
        const xr = halfW + i*(bw+1.5);
        ctx.beginPath(); ctx.roundRect(xr, H-bh, bw, bh, 2); ctx.fill();
        const xl = halfW - (i+1)*(bw+1.5);
        ctx.beginPath(); ctx.roundRect(xl, H-bh, bw, bh, 2); ctx.fill();
        if (playing && i<4 && v>0.6 && Math.random()<0.25)
          spawnParticle(halfW+(Math.random()-0.5)*halfW*0.5, v);
      }
      for (let i = particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.x+=p.vx; p.y+=p.vy; p.vy+=0.04; p.life-=0.02;
        if (p.life<=0) { particles.splice(i,1); continue; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size*p.life, 0, Math.PI*2);
        ctx.fillStyle = theme.vizColor(p.alpha*p.life); ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, analyserRef, theme]);
  return <canvas ref={cvRef} width={900} height={80} style={{ width:"100%", height:80, display:"block" }} />;
}

/* ─── Lyrics ─── */
function LyricsOverlay({ lines, mediaRef, loading, accent }) {
  const [ct, setCt] = useState(0);
  const wrapRef = useRef();
  const activeRef = useRef();
  useEffect(() => {
    let id;
    const tick = () => { if (mediaRef.current) setCt(mediaRef.current.currentTime); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [mediaRef]);
  const idx = lines.reduce((a, l, i) => ct >= l.time ? i : a, -1);
  useEffect(() => { activeRef.current?.scrollIntoView({ behavior:"smooth", block:"center" }); }, [idx]);
  return (
    <div ref={wrapRef} style={{ height:"100%", overflowY:"auto", padding:"20px 32px", scrollbarWidth:"none", maskImage:"linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)", WebkitMaskImage:"linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)" }}>
      {loading && <div style={{ textAlign:"center", paddingTop:60, color:"rgba(255,255,255,0.4)", fontFamily:"'Syne',sans-serif", fontSize:"0.85rem" }}>Buscando letra...</div>}
      {lines.map((l, i) => {
        const on = i===idx, dist = Math.abs(i-idx);
        return (
          <p key={i} ref={on ? activeRef : null} style={{ margin:"0 0 20px", textAlign:"center", fontFamily:"'Syne',sans-serif", fontSize: on?"clamp(1.1rem,3vw,1.4rem)":"clamp(0.85rem,2.5vw,1rem)", fontWeight: on?700:400, color: on ? accent : "#fff", opacity: on?1:Math.max(0.12,0.5-dist*0.1), filter:`blur(${on?0:Math.min(dist*1.2,4)}px)`, transition:"all 0.35s ease", transform: on?"scale(1.04)":"scale(1)", lineHeight:1.45, textShadow: on?`0 0 20px ${accent}88`:"none" }}>{l.text}</p>
        );
      })}
      {!loading && lines.length===0 && (
        <div style={{ textAlign:"center", paddingTop:60, color:"rgba(255,255,255,0.25)", fontFamily:"'Syne',sans-serif" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>♩</div>
          <p style={{ fontSize:"0.85rem" }}>No se encontró letra</p>
        </div>
      )}
    </div>
  );
}

/* ─── Welcome Modal ─── */
function WelcomeModal({ onOpenFolder, onSkip, accent }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(14px)" }}>
      <div style={{ background:"rgba(14,14,20,0.97)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:20, padding:"40px 44px", textAlign:"center", maxWidth:380, boxShadow:"0 40px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize:"2.4rem", marginBottom:16 }}>♫</div>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:"1.25rem", color:"#fff", marginBottom:10 }}>Bienvenido a Wave</h2>
        <p style={{ fontFamily:"'Syne',sans-serif", fontSize:"0.82rem", color:"rgba(255,255,255,0.4)", marginBottom:28, lineHeight:1.6 }}>¿Cargar una carpeta con tu música?</p>
        <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
          <button onClick={onOpenFolder} style={{ background:accent, border:"none", borderRadius:10, padding:"11px 24px", fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"0.8rem", cursor:"pointer", color: accent==="#ffffff"?"#111":"#000", transition:"opacity 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity="0.85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}
          >Abrir carpeta</button>
          <button onClick={onSkip} style={{ background:"none", border:"1px solid rgba(255,255,255,0.14)", borderRadius:10, padding:"11px 24px", fontFamily:"'Syne',sans-serif", fontWeight:600, fontSize:"0.8rem", color:"rgba(255,255,255,0.45)", cursor:"pointer", transition:"border-color 0.2s,color 0.2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.4)";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.14)";e.currentTarget.style.color="rgba(255,255,255,0.45)";}}
          >Más tarde</button>
        </div>
      </div>
    </div>
  );
}

/* ─── App ─── */
export default function App() {
  const [playlist, setPlaylist]   = useState([]);
  const [idx, setIdx]             = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [dur, setDur]             = useState(0);
  const [ct, setCt]               = useState(0);
  const [vol, setVol]             = useState(0.85);
  const [tab, setTab]             = useState("lyrics");
  const [lyrics, setLyrics]       = useState([]);
  const [lyricsLoading, setLL]    = useState(false);
  const [sidebarOpen, setSidebar] = useState(true);
  const [videoLyrics, setVL]      = useState(false);
  const [themeKey, setThemeKey]   = useState(() => localStorage.getItem(THEME_KEY) || "wave");
  const [showWelcome, setWelcome] = useState(() => isElectron && !localStorage.getItem(FOLDER_KEY));

  const audioRef    = useRef();
  const videoRef    = useRef();
  const analyserRef = useRef();
  const actxRef     = useRef();
  const progressRef = useRef();
  const fileIn      = useRef();
  const lrcIn       = useRef();
  const footerRef   = useRef();
  const playingRef  = useRef(false);
  const loadedRef   = useRef(-1);

  const theme    = THEMES[themeKey] || THEMES.wave;
  const track    = playlist[idx] || null;
  const isVideo  = track?.type === "video";
  const mediaRef = isVideo ? videoRef : audioRef;

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { localStorage.setItem(THEME_KEY, themeKey); }, [themeKey]);

  // Progress bar — direct DOM, no re-render
  useEffect(() => {
    let id;
    const tick = () => {
      const el = mediaRef.current;
      if (el && progressRef.current) {
        const pct = el.duration ? (el.currentTime/el.duration)*100 : 0;
        progressRef.current.style.width = `${pct}%`;
        setCt(el.currentTime);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [isVideo]);

  // ─── Web Audio setup ───
  // Key insight: createMediaElementSource can only be called ONCE per element.
  // So we create it once per element and reuse the analyser.
  // When switching between audio/video, we disconnect the old source and connect the new one.
  const connectElement = useCallback((el) => {
    if (!el) return;
    // Create AudioContext once
    if (!actxRef.current) {
      actxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = actxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    // Create analyser once
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(ctx.destination);
    }

    // Create source for this element once, then just reconnect
    if (!el._waveSrc) {
      try {
        el._waveSrc = ctx.createMediaElementSource(el);
      } catch(e) {
        console.warn("createMediaElementSource failed:", e);
        return;
      }
    }

    // Disconnect previous source from analyser
    if (el._waveSrc !== window._lastSrc) {
      if (window._lastSrc) {
        try { window._lastSrc.disconnect(analyserRef.current); } catch {}
      }
      try { el._waveSrc.connect(analyserRef.current); } catch {}
      window._lastSrc = el._waveSrc;
    }
  }, []);

  // Load saved folder
  useEffect(() => {
    if (!isElectron) return;
    const saved = localStorage.getItem(FOLDER_KEY);
    if (saved) window.electronAPI.openFolderPath(saved).then(paths => {
      if (paths?.length) { loadedRef.current=-1; setIdx(0); setPlaylist(pathsToTracks(paths)); }
    }).catch(()=>{});
  }, []);

  // Load track
  useEffect(() => {
    if (!track || loadedRef.current===idx) return;
    loadedRef.current = idx;
    const ael = audioRef.current, vel = videoRef.current;
    if (isVideo) {
      if (ael) { ael.pause(); ael.src=""; }
      if (vel) { vel.src=track.url; vel.volume=vol; vel.load(); if (playingRef.current) vel.play().catch(()=>{}); }
    } else {
      if (vel) { vel.pause(); vel.src=""; }
      if (ael) { ael.src=track.url; ael.volume=vol; ael.load(); if (playingRef.current) ael.play().catch(()=>{}); }
    }
    setCt(0); setDur(0);
    setLyrics([]); setLL(true);
    fetchLyrics(track.name).then(lines => { setLyrics(lines||[]); setLL(false); });
  }, [idx, playlist, isVideo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol;
    if (videoRef.current) videoRef.current.volume = vol;
  }, [vol]);

  // Scroll = volume
  useEffect(() => {
    const el = footerRef.current; if (!el) return;
    const fn = e => { e.preventDefault(); setVol(v=>Math.max(0,Math.min(1,v-e.deltaY*0.001))); };
    el.addEventListener("wheel",fn,{passive:false}); return ()=>el.removeEventListener("wheel",fn);
  }, []);

  // Move video element into slot
  useEffect(() => {
    const vel = videoRef.current; if (!vel) return;
    const slot = document.getElementById("video-slot");
    if (slot && isVideo && tab==="video") {
      vel.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1;pointer-events:none;z-index:1;";
      slot.prepend(vel);
    } else {
      vel.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;top:0;left:0;z-index:-1;pointer-events:none;";
      document.body.appendChild(vel);
    }
  }, [isVideo, tab]);

  const pathsToTracks = (paths) => paths.map(p=>({
    name: p.split(/[\\/]/).pop().replace(/\.[^/.]+$/,""),
    url: `file:///${p.replace(/\\/g,"/")}`,
    type: videoExts.includes(p.split(".").pop().toLowerCase()) ? "video" : "audio"
  }));

  const addFromInput = (files) => {
    const tracks = [...files].filter(f=>f.type.startsWith("audio/")||f.type.startsWith("video/"))
      .map(f=>({name:f.name.replace(/\.[^/.]+$/,""),url:URL.createObjectURL(f),type:f.type.startsWith("video/")?"video":"audio"}));
    if (!tracks.length) return;
    setPlaylist(p=>{if(p.length===0){loadedRef.current=-1;setIdx(0);}return[...p,...tracks];});
  };
  const addFromPaths = (paths) => {
    const tracks = pathsToTracks(paths); if(!tracks.length) return;
    setPlaylist(p=>{if(p.length===0){loadedRef.current=-1;setIdx(0);}return[...p,...tracks];});
  };
  const openFiles = async () => {
    if (isElectron) { const p=await window.electronAPI.openFiles(); if(p?.length) addFromPaths(p); }
    else fileIn.current?.click();
  };
  const openFolder = async () => {
    if (isElectron) {
      const r=await window.electronAPI.openFolder();
      if(r?.paths?.length){if(r.folderPath)localStorage.setItem(FOLDER_KEY,r.folderPath);loadedRef.current=-1;setIdx(0);setPlaylist(pathsToTracks(r.paths));}
    } else fileIn.current?.click();
    setWelcome(false);
  };
  const loadLRC = (file) => { const fr=new FileReader(); fr.onload=e=>{setLyrics(parseLRC(e.target.result));setLL(false);}; fr.readAsText(file); };

  const handleEnded = useCallback(() => {
    setIdx(prev=>{if(prev+1<playlist.length){loadedRef.current=-1;setPlaying(true);return prev+1;}setPlaying(false);return prev;});
  },[playlist.length]);

  const go = useCallback((dir) => {
    setIdx(prev=>{const n=prev+dir;if(n>=0&&n<playlist.length){loadedRef.current=-1;setPlaying(true);return n;}return prev;});
  },[playlist.length]);

  const togglePlay = async () => {
    const el = mediaRef.current; if(!el||!track) return;
    if (playing) {
      el.pause(); setPlaying(false);
    } else {
      connectElement(el);
      if (actxRef.current?.state === "suspended") await actxRef.current.resume();
      try { await el.play(); setPlaying(true); } catch(e) { console.warn("play error:", e); }
    }
  };

  const seek = async (e) => {
    const el=mediaRef.current; if(!el||!dur) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const v=Math.max(0,Math.min(((e.clientX-rect.left)/rect.width)*dur,dur));
    const was=playingRef.current;
    el.currentTime=v; setCt(v); // no pause/resume — avoids audio stutter
    if (!was) el.pause();
  };

  const pct   = dur ? (ct/dur)*100 : 0;
  const bgColor = theme.bg[idx%6];
  const auroraC = theme.aurora[idx%6];
  const accent  = theme.accent;

  return (
    <div style={{ height:"100dvh", background:bgColor, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Azeret+Mono:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
        button{cursor:pointer;font-family:'Syne',sans-serif;}
        input[type=range]{-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.1);height:3px;border-radius:99px;outline:none;cursor:pointer;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;cursor:pointer;}
        @keyframes aA{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(60px,-40px) scale(1.1)}66%{transform:translate(-30px,50px) scale(0.95)}}
        @keyframes aB{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-70px,30px) scale(1.05)}66%{transform:translate(50px,-60px) scale(1.1)}}
        @keyframes aC{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,60px) scale(0.95)}66%{transform:translate(-60px,-30px) scale(1.1)}}
        @keyframes pulse{0%,100%{opacity:0.35}50%{opacity:1}}
        .shell{display:flex;flex:1;overflow:hidden;}
        .sidebar{width:248px;min-width:248px;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.07);overflow-y:auto;transition:width 0.3s,min-width 0.3s,opacity 0.25s;}
        .sidebar.closed{width:0!important;min-width:0!important;opacity:0;pointer-events:none;overflow:hidden;}
        .main{flex:1;display:flex;flex-direction:column;min-width:0;}
        .btn-ghost{background:none;border:1px solid rgba(255,255,255,0.13);color:rgba(255,255,255,0.5);border-radius:6px;padding:6px 12px;font-size:0.68rem;font-weight:600;letter-spacing:0.1em;transition:border-color 0.2s,color 0.2s;}
        .btn-ghost:hover{border-color:rgba(255,255,255,0.45);color:#fff;}
        .pl-item{padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-left:2px solid transparent;transition:background 0.15s,border-color 0.3s;}
        .pl-item:hover{background:rgba(255,255,255,0.03);}
        .pl-item.active{background:rgba(255,255,255,0.06);border-left-color:#fff;}
        .tab-btn{background:none;border:none;padding:11px 18px;font-size:0.68rem;font-weight:700;letter-spacing:0.15em;color:rgba(255,255,255,0.25);border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 0.2s,border-color 0.2s;}
        .tab-btn.active{color:#fff;border-bottom-color:#fff;}
        .ctrl-btn{background:none;border:none;color:rgba(255,255,255,0.38);padding:8px;border-radius:8px;transition:color 0.15s,transform 0.1s;display:flex;align-items:center;justify-content:center;}
        .ctrl-btn:hover{color:#fff;}
        .ctrl-btn:active{transform:scale(0.88);}
        .play-btn{width:52px;height:52px;border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform 0.12s,opacity 0.15s;}
        .play-btn:hover{opacity:0.85;}
        .play-btn:active{transform:scale(0.91);}
        .progress-track{height:4px;background:rgba(255,255,255,0.1);border-radius:99px;cursor:pointer;position:relative;transition:height 0.2s;}
        .progress-track:hover{height:7px;}
        .progress-track:hover .pdot{width:12px!important;height:12px!important;}
        .theme-btn{background:none;border:1px solid rgba(255,255,255,0.12);border-radius:8px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:0.85rem;transition:border-color 0.2s,background 0.2s;color:rgba(255,255,255,0.5);}
        .theme-btn:hover{border-color:rgba(255,255,255,0.4);color:#fff;}
        .theme-btn.active{border-color:#fff;color:#fff;background:rgba(255,255,255,0.1);}
        .vbtn{background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.18);color:#fff;border-radius:8px;padding:6px 14px;font-size:0.7rem;font-weight:600;letter-spacing:0.08em;backdrop-filter:blur(8px);transition:background 0.2s,border-color 0.2s;cursor:pointer;font-family:'Syne',sans-serif;}
        .vbtn:hover{background:rgba(255,255,255,0.15);}
        .vbtn.on{border-color:#fff;background:rgba(255,255,255,0.18);}
        @media(max-width:640px){
          .shell{flex-direction:column;}
          .sidebar{width:100%!important;min-width:unset!important;border-right:none;border-bottom:1px solid rgba(255,255,255,0.07);max-height:34dvh;opacity:1!important;pointer-events:all!important;}
          .sidebar.closed{max-height:0!important;opacity:0!important;}
        }
      `}</style>

      {/* Aurora */}
      <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
        {auroraC.map((c,i)=>(
          <div key={i} style={{ position:"absolute", width:"55vw", height:"55vw", borderRadius:"50%", background:c, filter:"blur(90px)", opacity:0.22, top:["10%","50%","30%"][i], left:["10%","60%","35%"][i], animation:[`aA`,`aB`,`aC`][i]+` ${18+i*7}s ease-in-out infinite` }} />
        ))}
      </div>

      {showWelcome && <WelcomeModal onOpenFolder={openFolder} onSkip={()=>setWelcome(false)} accent={accent} />}

      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", height:"100%" }}>

        <audio ref={audioRef} onDurationChange={()=>{if(!isVideo)setDur(audioRef.current?.duration||0);}} onEnded={handleEnded} />
        <video ref={videoRef} onDurationChange={()=>{if(isVideo)setDur(videoRef.current?.duration||0);}} onEnded={handleEnded}
          style={{ position:"fixed", width:1, height:1, opacity:0, top:0, left:0, pointerEvents:"none" }} />

        {!isElectron && <input ref={fileIn} type="file" accept="audio/*,video/*" multiple hidden onChange={e=>addFromInput(e.target.files)} />}
        <input ref={lrcIn} type="file" accept=".lrc" hidden onChange={e=>{if(e.target.files[0])loadLRC(e.target.files[0]);}} />

        {/* Header */}
        <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0, WebkitAppRegion:"drag", backdropFilter:"blur(12px)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, WebkitAppRegion:"no-drag" }}>
            <button onClick={()=>setSidebar(o=>!o)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.38)", fontSize:"1rem", padding:"4px 6px", cursor:"pointer", borderRadius:6, transition:"color 0.2s" }}
              onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.38)"}
            >{sidebarOpen?"◧":"▣"}</button>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:"0.72rem", letterSpacing:"0.22em", color:"rgba(255,255,255,0.35)", textTransform:"uppercase" }}>WAVE</span>
          </div>
          <div style={{ display:"flex", gap:5, WebkitAppRegion:"no-drag" }}>
            {Object.entries(THEMES).map(([k,t])=>(
              <button key={k} className={`theme-btn${themeKey===k?" active":""}`} onClick={()=>setThemeKey(k)} title={t.name}>{t.icon}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6, WebkitAppRegion:"no-drag" }}>
            {isElectron && <button className="btn-ghost" onClick={openFolder}>📁</button>}
            <button className="btn-ghost" onClick={openFiles}>+ Música</button>
            <button className="btn-ghost" onClick={()=>lrcIn.current?.click()}>+ .lrc</button>
          </div>
        </header>

        <div className="shell">
          <aside className={`sidebar${sidebarOpen?"":" closed"}`}>
            <div style={{ padding:"13px 14px 7px", flexShrink:0 }}>
              <span style={{ fontFamily:"'Azeret Mono',monospace", fontSize:"0.6rem", color:"rgba(255,255,255,0.25)", letterSpacing:"0.14em" }}>LISTA — {playlist.length}</span>
            </div>
            {playlist.length===0&&(
              <div onClick={openFiles} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!isElectron)addFromInput(e.dataTransfer.files);}}
                style={{ margin:"8px 10px", borderRadius:10, border:"1.5px dashed rgba(255,255,255,0.09)", padding:"28px 14px", textAlign:"center", cursor:"pointer", transition:"border-color 0.2s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.22)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.09)"}
              >
                <div style={{ fontSize:26, marginBottom:7, opacity:0.3 }}>↑</div>
                <p style={{ fontFamily:"'Syne',sans-serif", fontSize:"0.76rem", color:"rgba(255,255,255,0.26)" }}>{isElectron?"Clic para abrir":"Arrastra o clic"}</p>
              </div>
            )}
            {playlist.map((t,i)=>(
              <div key={i} className={`pl-item${i===idx?" active":""}`} onClick={()=>{loadedRef.current=-1;setIdx(i);setPlaying(true);}}>
                <span style={{ fontFamily:"'Azeret Mono',monospace", fontSize:"0.56rem", color:"rgba(255,255,255,0.2)", minWidth:16 }}>{String(i+1).padStart(2,"0")}</span>
                <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"0.78rem", color:i===idx?"#fff":"rgba(255,255,255,0.4)", fontWeight:i===idx?600:400, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {t.type==="video"?"▷ ":""}{t.name}
                </span>
                {i===idx&&playing&&(
                  <div style={{ marginLeft:"auto", display:"flex", gap:2, alignItems:"flex-end", height:14, flexShrink:0 }}>
                    {[1,1.5,0.8].map((h,j)=>(
                      <div key={j} style={{ width:2, background:accent, borderRadius:1, height:`${h*8}px`, opacity:0.7, animation:`pulse ${0.6+j*0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </aside>

          <div className="main">
            <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
              {[["lyrics","LETRA"],["video","VIDEO"]].map(([k,l])=>(
                <button key={k} className={`tab-btn${tab===k?" active":""}`} onClick={()=>setTab(k)}
                  style={{ color:tab===k?accent:"rgba(255,255,255,0.25)", borderBottomColor:tab===k?accent:"transparent" }}
                >{l}</button>
              ))}
            </div>
            <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
              <div style={{ position:"absolute", inset:0, display:tab==="lyrics"?"block":"none" }}>
                <LyricsOverlay lines={lyrics} mediaRef={mediaRef} loading={lyricsLoading} accent={accent} />
              </div>
              <div id="video-slot" style={{ position:"absolute", inset:0, display:tab==="video"?"block":"none", background:"#000", overflow:"hidden" }}>
                {!isVideo && (
                  <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ textAlign:"center", color:"rgba(255,255,255,0.13)" }}>
                      <div style={{ fontSize:44, marginBottom:12 }}>▷</div>
                      <p style={{ fontFamily:"'Syne',sans-serif", fontSize:"0.8rem" }}>{track?"Solo audio":"Carga un video"}</p>
                    </div>
                  </div>
                )}
                {isVideo&&videoLyrics&&(
                  <div style={{ position:"absolute", inset:0, zIndex:10, background:"linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)", pointerEvents:"none" }}>
                    <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"65%" }}>
                      <LyricsOverlay lines={lyrics} mediaRef={mediaRef} loading={lyricsLoading} accent={accent} />
                    </div>
                  </div>
                )}
                {isVideo&&(
                  <div style={{ position:"absolute", bottom:14, right:14, zIndex:20 }}>
                    <button className={`vbtn${videoLyrics?" on":""}`} onClick={()=>setVL(v=>!v)}>
                      {videoLyrics?"✕ Letra":"♪ Letra"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background:"rgba(0,0,0,0.2)", borderTop:"1px solid rgba(255,255,255,0.05)", flexShrink:0 }}>
          <Viz playing={playing} analyserRef={analyserRef} theme={theme} />
        </div>

        <footer ref={footerRef} style={{ padding:"13px 20px 18px", borderTop:"1px solid rgba(255,255,255,0.06)", flexShrink:0, backdropFilter:"blur(12px)" }}>
          <div style={{ marginBottom:10, display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"clamp(0.9rem,2.5vw,1.1rem)", color:"#fff", flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {track?.name||"Sin canción"}
            </span>
            <span style={{ fontFamily:"'Azeret Mono',monospace", fontSize:"0.66rem", color:"rgba(255,255,255,0.25)", flexShrink:0 }}>
              {fmt(ct)} / {fmt(dur)}
            </span>
          </div>
          <div className="progress-track" onClick={seek} style={{ marginBottom:15 }}>
            <div ref={progressRef} style={{ height:"100%", background:accent, borderRadius:99, width:`${pct}%`, position:"relative" }}>
              <div className="pdot" style={{ position:"absolute", right:-5, top:"50%", transform:"translateY(-50%)", width:0, height:0, borderRadius:"50%", background:accent, transition:"width 0.2s,height 0.2s", boxShadow:`0 0 8px ${accent}99` }} />
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, flex:1 }}>
              <span style={{ fontSize:"0.7rem", opacity:0.35 }}>{vol===0?"🔇":vol<0.5?"🔉":"🔊"}</span>
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={e=>setVol(+e.target.value)} style={{ maxWidth:80, accentColor:accent }} />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button className="ctrl-btn" onClick={()=>go(-1)}><IconPrev /></button>
              <button className="play-btn" onClick={togglePlay} style={{ background:accent }}>
                {playing ? <IconPause color={bgColor||"#111"} /> : <IconPlay color={bgColor||"#111"} />}
              </button>
              <button className="ctrl-btn" onClick={()=>go(1)}><IconNext /></button>
            </div>
            <div style={{ flex:1 }} />
          </div>
        </footer>
      </div>
    </div>
  );
}
