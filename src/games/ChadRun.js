import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const ChadRun = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // --- SENIOR DEV TUNING (SCALE & PHYSICS) ---
  
  // 1. SCALING: We doubled the sizes (approx 2x)
  const SCALE = 1.8; // Global scale multiplier
  const STAND_H = 60 * SCALE; // ~108px
  const DUCK_H = 30 * SCALE;  // ~54px
  const CHAR_W = 40 * SCALE;  // ~72px
  
  // 2. PHYSICS: Heavier gravity for bigger mass feel
  const GRAVITY = 1.2;       
  const JUMP_FORCE = -21;    // Stronger jump
  const JUMP_CUTOFF = -8; 
  const FAST_DROP = 4.0;     // Faster drop when ducking in air
  
  // 3. SPEED: Faster base speed to match the larger world
  const BASE_SPEED = 9.0;
  const MAX_SPEED = 28;

  const engine = useRef({
    running: false,
    frames: 0,
    speed: BASE_SPEED,
    score: 0,
    nextSpawnFrame: 0,
    // Hero starts at new dimensions
    hero: { x: 50, y: 0, w: CHAR_W, h: STAND_H, vy: 0, isGrounded: true, isDucking: false, isJumping: false },
    groundY: 520, // Lower ground to give more headroom
    obstacles: [], 
    bgOffset: 0,  // For Parallax
    sprites: {},
    lastTime: 0 
  });

  useEffect(() => {
    // Mobile check listener
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const load = (k, src) => {
        const img = new Image();
        img.src = src;
        img.crossOrigin = "Anonymous";
        img.onload = () => engine.current.sprites[k] = img;
    };
    load('chad', ASSETS.CHAD_HERO);
    load('soyjak', ASSETS.OBSTACLE_SOYJAK);
    load('bird', ASSETS.OBSTACLE_BIRD);
    load('bg', ASSETS.CHAD_BG); 
  }, []);

  // --- INPUT HANDLER ---
  useEffect(() => {
    if(containerRef.current) containerRef.current.focus();

    const handleAction = (action, isDown) => {
        const state = engine.current;
        if (!state.running && !gameOver && isDown) {
            state.running = true;
            setIsPlaying(true);
            setShowTutorial(false);
            state.lastTime = performance.now(); 
        }
        if (!state.running) return;

        if (action === 'JUMP') {
            if (isDown) {
                if (state.hero.isGrounded) {
                    state.hero.vy = JUMP_FORCE;
                    state.hero.isGrounded = false;
                    state.hero.isJumping = true;
                    state.hero.isDucking = false; 
                }
            } else {
                if (state.hero.vy < JUMP_CUTOFF) state.hero.vy = JUMP_CUTOFF;
                state.hero.isJumping = false;
            }
        }

        if (action === 'DUCK') {
            const wasDucking = state.hero.isDucking;
            state.hero.isDucking = isDown;
            if (isDown && !wasDucking && state.hero.isGrounded) {
                // Instantly snap down to ground if ducking while running
                state.hero.y += (STAND_H - DUCK_H);
            }
        }
    };

    const onKey = (e) => {
        if (e.repeat) return;
        const isDown = e.type === 'keydown';
        if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') handleAction('JUMP', isDown);
        if (e.key === 'ArrowDown' || e.key === 's') handleAction('DUCK', isDown);
    };

    const wrapper = containerRef.current;
    const onTouch = (e) => {
        if (e.target.closest('button') || e.target.closest('.interactive')) return;
        if(e.cancelable) e.preventDefault(); 
        const isDown = e.type === 'touchstart';
        
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            const halfWidth = window.innerWidth / 2;
            const action = t.clientX < halfWidth ? 'DUCK' : 'JUMP';
            handleAction(action, isDown);
        }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    if (wrapper) {
        wrapper.addEventListener('touchstart', onTouch, { passive: false });
        wrapper.addEventListener('touchend', onTouch, { passive: false });
    }

    return () => {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        if (wrapper) {
            wrapper.removeEventListener('touchstart', onTouch);
            wrapper.removeEventListener('touchend', onTouch);
        }
    };
  }, [gameOver]);

  // --- GAME LOOP ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const resetGame = () => {
        engine.current.running = false;
        // Reset to scaled dimensions
        engine.current.hero = { x: 50, y: 520 - STAND_H, w: CHAR_W, h: STAND_H, vy: 0, isGrounded: true, isDucking: false };
        engine.current.speed = BASE_SPEED;
        engine.current.score = 0;
        engine.current.obstacles = [];
        engine.current.frames = 0;
        engine.current.bgOffset = 0;
        engine.current.nextSpawnFrame = 30;
        engine.current.lastTime = performance.now();
        setShowTutorial(true);
    };
    
    const spawnObstacle = () => {
        const state = engine.current;
        // Increased safety gap for higher speeds
        const safeGap = state.speed * 25; 
        const lastOb = state.obstacles[state.obstacles.length - 1];
        if (lastOb && (850 - (lastOb.x + lastOb.w) < safeGap)) return;

        const type = (state.score > 3 && Math.random() < 0.4) ? 'bird' : 'soyjak';
        
        // SCALED OBSTACLES
        let w, h, y;
        
        if (type === 'soyjak') {
            const doubleChance = Math.min(0.6, state.score * 0.05);
            // Soyjak: 70px or 130px wide
            w = (Math.random() < doubleChance) ? 75 * SCALE : 35 * SCALE; 
            h = 50 * SCALE; 
            y = state.groundY - h;
        } else {
            // Bird: 70x50 approx
            w = 40 * SCALE; 
            h = 30 * SCALE;
            
            // Scaled flight heights
            const highBirdY = state.groundY - (65 * SCALE); 
            const lowBirdY = state.groundY - (25 * SCALE); 
            const isLow = state.score > 8 && Math.random() < 0.3;
            y = isLow ? lowBirdY : highBirdY;
        }
        state.obstacles.push({ x: 900, y, w, h, type, passed: false });
        
        // Spawn frequency tuned for speed
        const freq = Math.max(30, 60 - state.speed);
        state.nextSpawnFrame = state.frames + freq + (Math.random() * 30);
    };

    resetGame();
    
    const loop = (time) => {
        const state = engine.current;
        const dt = Math.min((time - state.lastTime) / 16.667, 2.0); 
        state.lastTime = time;
        
        const w = canvas.width;
        const h = canvas.height;

        // --- DRAW BACKGROUND (Parallax) ---
        if (state.sprites.bg && state.sprites.bg.complete) {
            const bgImg = state.sprites.bg;
            // Scroll background slower than foreground (0.2x speed)
            if (state.running) {
                state.bgOffset += (state.speed * 0.2) * dt;
                if (state.bgOffset >= w) state.bgOffset = 0;
            }
            const bgX = -state.bgOffset;
            ctx.drawImage(bgImg, bgX, 0, w, h);
            ctx.drawImage(bgImg, bgX + w, 0, w, h);
        } else {
            ctx.fillStyle = "#222";
            ctx.fillRect(0, 0, w, h);
        }

        // Draw Ground Line
        ctx.fillStyle = "#fff"; 
        ctx.fillRect(0, state.groundY, w, 4); // Thicker ground line

        if (state.running && !gameOver) {
            state.frames++;
            
            let gravity = GRAVITY;
            if (state.hero.isDucking && !state.hero.isGrounded) gravity += FAST_DROP;
            
            state.hero.vy += gravity * dt; 
            state.hero.y += state.hero.vy * dt; 

            const currentH = state.hero.isDucking ? DUCK_H : STAND_H;
            
            // Ground Collision
            if (state.hero.y + currentH >= state.groundY) {
                state.hero.y = state.groundY - currentH;
                state.hero.vy = 0;
                state.hero.isGrounded = true;
            }

            const targetSpeed = BASE_SPEED + (state.score * 0.2);
            state.speed = Math.min(MAX_SPEED, targetSpeed);

            // OBSTACLES 
            state.obstacles.forEach(ob => {
                ob.x -= state.speed * dt;
                
                // Tuned Hitboxes (tighter for fairness)
                const paddingX = 15;
                const paddingY = 10;
                
                const heroHitbox = { 
                    x: state.hero.x + paddingX, 
                    y: state.hero.y + paddingY, 
                    w: state.hero.w - (paddingX*2), 
                    h: currentH - (paddingY*2) 
                };
                
                const obHitbox = { 
                    x: ob.x + 5, 
                    y: ob.y + 5, 
                    w: ob.w - 10, 
                    h: ob.h - 10 
                };
                
                if (heroHitbox.x < obHitbox.x + obHitbox.w && heroHitbox.x + heroHitbox.w > obHitbox.x &&
                    heroHitbox.y < obHitbox.y + obHitbox.h && heroHitbox.y + heroHitbox.h > obHitbox.y) {
                    die();
                }
                
                if (!ob.passed && ob.x + ob.w < state.hero.x) {
                    ob.passed = true;
                    state.score++;
                    setScore(state.score);
                }
            });
            state.obstacles = state.obstacles.filter(ob => ob.x > -200);
            
            if (state.frames >= state.nextSpawnFrame) spawnObstacle();
        }

        // Draw Obstacles
        state.obstacles.forEach(ob => {
            const img = state.sprites[ob.type];
            if (img) ctx.drawImage(img, ob.x, ob.y, ob.w, ob.h);
            else { 
                ctx.fillStyle = ob.type === 'bird' ? 'red' : 'green'; 
                ctx.fillRect(ob.x, ob.y, ob.w, ob.h); 
            }
        });

        // Draw Hero
        const currentH = state.hero.isDucking ? DUCK_H : STAND_H;
        const imgChad = state.sprites['chad'];
        if (imgChad) {
             // We draw the image slightly larger than the logical size to make it look cool
             // but we keep the x/y logic strict
             ctx.drawImage(imgChad, state.hero.x - 5, state.hero.y, CHAR_W + 10, currentH);
        } else { 
            ctx.fillStyle = 'cyan'; 
            ctx.fillRect(state.hero.x, state.hero.y, CHAR_W, currentH); 
        }

        animationId = requestAnimationFrame(loop);
    };

    const die = async () => {
        engine.current.running = false;
        setGameOver(true);
        if(username) await supabase.from('leaderboards').insert([{ game_id: 'chadrun', username, score: engine.current.score, address }]);
    };

    loop(performance.now());
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => {
    if(!gameOver) setTimeout(() => { setIsPlaying(true); engine.current.running = true; engine.current.lastTime = performance.now(); }, 1500);
  }, [resetKey, gameOver]);

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" onClick={() => containerRef.current.focus()}>
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setResetKey(k=>k+1); }} onExit={onExit} gameId="chadrun" />
        
        {/* MOBILE TUTORIAL OVERLAY - Only shows on Mobile */}
        {showTutorial && isPlaying && !gameOver && isMobile && (
            <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                display: 'flex', gap: 100, pointerEvents: 'none', opacity: 0.6, width: '100%', justifyContent: 'space-between', padding: '0 40px'
            }}>
                <div className="meme-text" style={{fontSize: '1rem', color: 'cyan', textShadow: '2px 2px 0 #000'}}>&#8592; DUCK</div>
                <div className="meme-text" style={{fontSize: '1rem', color: 'orange', textShadow: '2px 2px 0 #000'}}>JUMP &#8594;</div>
            </div>
        )}
        
        <canvas ref={canvasRef} width={800} height={600} />
    </div>
  );
};

export default ChadRun;