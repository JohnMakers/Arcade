import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const ChadRun = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { username, address } = useContext(UserContext);

  // --- REACT STATE ---
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);

  // --- ENGINE STATE ---
  const engine = useRef({
    running: false,
    frames: 0,
    speed: 6,
    score: 0,
    nextSpawnFrame: 0,
    hero: { x: 50, y: 0, w: 40, h: 60, vy: 0, isGrounded: true, isDucking: false, isJumping: false },
    groundY: 500,
    obstacles: [], 
    clouds: [],
    sprites: {}
  });

  const GRAVITY = 0.6;
  const JUMP_FORCE = -13; 
  const JUMP_CUTOFF = -5; 
  const FAST_DROP = 2.5; 
  const BASE_SPEED = 6.5;
  const MAX_SPEED = 22;
  const STAND_H = 60;
  const DUCK_H = 30;

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

    // --- SMART TOUCH HANDLER ---
    const wrapper = containerRef.current;
    
    const onTouch = (e) => {
        // FIX: Check if we touched a button or the UI menu. If so, DO NOT prevent default.
        // This allows clicks to pass through to the Restart/Exit buttons.
        if (e.target.closest('button') || e.target.closest('.btn-meme')) {
            return; 
        }

        // Otherwise, prevent default to stop scrolling/zooming/double-tap logic
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
        engine.current.hero = { x: 50, y: 500-60, w: 40, h: 60, vy: 0, isGrounded: true, isDucking: false };
        engine.current.speed = BASE_SPEED;
        engine.current.score = 0;
        engine.current.obstacles = [];
        engine.current.clouds = [];
        engine.current.frames = 0;
        engine.current.nextSpawnFrame = 30;
        setShowTutorial(true);
        spawnCloud(100); spawnCloud(300); spawnCloud(600);
    };
    
    const spawnObstacle = () => {
        const state = engine.current;
        const safeGap = state.speed * 30; 
        const lastOb = state.obstacles[state.obstacles.length - 1];
        if (lastOb && (850 - (lastOb.x + lastOb.w) < safeGap)) return;

        const type = (state.score > 3 && Math.random() < 0.4) ? 'bird' : 'soyjak';
        let w = 40, h = 40, y = state.groundY - 40;
        
        if (type === 'soyjak') {
            const doubleChance = Math.min(0.6, state.score * 0.05);
            w = (Math.random() < doubleChance) ? 75 : 35; 
            h = 50; y = state.groundY - h;
        } else {
            w = 40; h = 30;
            const highBirdY = state.groundY - 65; 
            const lowBirdY = state.groundY - 25; 
            const isLow = state.score > 8 && Math.random() < 0.3;
            y = isLow ? lowBirdY : highBirdY;
        }
        state.obstacles.push({ x: 850, y, w, h, type, passed: false });
        const freq = Math.max(25, 50 - state.speed);
        state.nextSpawnFrame = state.frames + freq + (Math.random() * 20);
    };

    const spawnCloud = (forceX = null) => {
        engine.current.clouds.push({
            x: forceX !== null ? forceX : 850, 
            y: Math.random() * 300, 
            w: 60 + Math.random() * 40, 
            speed: 0.5 + Math.random() * 0.5
        });
    };

    resetGame();
    
    const loop = () => {
        const state = engine.current;
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff"; 
        ctx.fillRect(0, state.groundY, w, 2);

        if (state.running && !gameOver) {
            state.frames++;
            let gravity = GRAVITY;
            if (state.hero.isDucking && !state.hero.isGrounded) gravity += FAST_DROP;
            state.hero.vy += gravity;
            state.hero.y += state.hero.vy;

            const currentH = state.hero.isDucking ? DUCK_H : STAND_H;
            if (state.hero.y + currentH >= state.groundY) {
                state.hero.y = state.groundY - currentH;
                state.hero.vy = 0;
                state.hero.isGrounded = true;
            }

            const targetSpeed = BASE_SPEED + (state.score * 0.3);
            state.speed = Math.min(MAX_SPEED, targetSpeed);

            state.obstacles.forEach(ob => {
                ob.x -= state.speed;
                const heroHitbox = { x: state.hero.x + 12, y: state.hero.y + 5, w: 16, h: currentH - 10 };
                const obHitbox = { x: ob.x + 5, y: ob.y + 5, w: ob.w - 10, h: ob.h - 10 };
                
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
            state.obstacles = state.obstacles.filter(ob => ob.x > -100);
            if (state.frames >= state.nextSpawnFrame) spawnObstacle();
            state.clouds.forEach(c => c.x -= c.speed * 0.5);
            state.clouds = state.clouds.filter(c => c.x > -100);
            if (state.frames % 120 === 0) spawnCloud();
        }

        ctx.fillStyle = '#444';
        state.clouds.forEach(c => ctx.fillRect(c.x, c.y, c.w, 20));

        state.obstacles.forEach(ob => {
            const img = state.sprites[ob.type];
            if (img) ctx.drawImage(img, ob.x, ob.y, ob.w, ob.h);
            else { ctx.fillStyle = ob.type === 'bird' ? 'red' : 'green'; ctx.fillRect(ob.x, ob.y, ob.w, ob.h); }
        });

        const currentH = state.hero.isDucking ? DUCK_H : STAND_H;
        const imgChad = state.sprites['chad'];
        if (imgChad) ctx.drawImage(imgChad, state.hero.x, state.hero.y, 40, currentH);
        else { ctx.fillStyle = 'cyan'; ctx.fillRect(state.hero.x, state.hero.y, 40, currentH); }

        animationId = requestAnimationFrame(loop);
    };

    const die = async () => {
        engine.current.running = false;
        setGameOver(true);
        if(username) await supabase.from('leaderboards').insert([{ game_id: 'chadrun', username, score: engine.current.score, address }]);
    };

    loop();
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  useEffect(() => {
    if(!gameOver) setTimeout(() => { setIsPlaying(true); engine.current.running = true; }, 1500);
  }, [resetKey, gameOver]);

  return (
    <div ref={containerRef} className="game-wrapper" tabIndex="0" onClick={() => containerRef.current.focus()}>
        <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={() => { setGameOver(false); setIsPlaying(false); setScore(0); setResetKey(k=>k+1); }} onExit={onExit} gameId="chadrun" />
        
        {showTutorial && isPlaying && !gameOver && (
            <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                display: 'flex', gap: 100, pointerEvents: 'none', opacity: 0.6
            }}>
                <div className="meme-text" style={{fontSize: '1rem', color: 'cyan'}}>&#8592; DUCK</div>
                <div className="meme-text" style={{fontSize: '1rem', color: 'orange'}}>JUMP &#8594;</div>
            </div>
        )}
        
        <canvas ref={canvasRef} width={800} height={600} />
    </div>
  );
};

export default ChadRun;