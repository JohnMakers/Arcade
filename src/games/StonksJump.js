import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const StonksJump = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState(""); // For "To The Moon!" popup

  // --- PHYSICS CONSTANTS ---
  const GRAVITY = 0.4;
  const JUMP_FORCE = -11; 
  const MOVE_SPEED = 6;
  const MAX_JUMP_HEIGHT = (Math.abs(JUMP_FORCE) * Math.abs(JUMP_FORCE)) / (2 * GRAVITY); // ~151px
  const SAFE_GAP_MAX = 120; // 30px buffer for safety
  const MIN_GAP = 40;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationId;

    // --- GAME STATE ---
    let hero = { x: 200, y: 400, vx: 0, vy: 0, w: 40, h: 40, facing: 1 };
    let cameraY = 0;
    let localScore = 0;
    let active = true;
    let platforms = [];
    let particles = []; // Visual effects

    // --- ASSETS PRELOAD ---
    const imgHero = new Image(); imgHero.src = ASSETS.STONKS_MAN;
    const imgGreen = new Image(); imgGreen.src = ASSETS.PLATFORM_GREEN;
    const imgRed = new Image(); imgRed.src = ASSETS.PLATFORM_RED;
    const imgBlue = new Image(); imgBlue.src = ASSETS.PLATFORM_BLUE;
    const imgRocket = new Image(); imgRocket.src = ASSETS.ROCKET;

    // --- INITIALIZE PLATFORMS ---
    // Start with a solid base
    platforms.push({ x: 150, y: 500, type: 'green', w: 80, h: 15, moving: false });
    platforms.push({ x: 150, y: 350, type: 'green', w: 80, h: 15, moving: false });

    // --- GENERATION ALGORITHM (The Fix) ---
    const generatePlatforms = () => {
      // 1. Identify the "Highest" valid platform (lowest Y value)
      // We sort to ensure we find the absolute top
      platforms.sort((a, b) => a.y - b.y); 
      let highestY = platforms[0].y;

      // 2. Fill the buffer (Generate ahead of camera)
      // Keep generating until we are 800px ABOVE the camera
      while (highestY > cameraY - 800) {
        
        // A. Calculate Position
        const gap = Math.floor(Math.random() * (SAFE_GAP_MAX - MIN_GAP) + MIN_GAP);
        const newY = highestY - gap;
        const newX = Math.random() * (canvas.width - 80);

        // B. Determine Type (Weighted RNG)
        let type = 'green';
        let moving = false;
        let hasRocket = false;

        const rand = Math.random();
        
        // 10% Chance Moving (Blue) - Higher score = more likely
        if (rand > 0.8 && localScore > 500) {
            type = 'blue';
            moving = true;
        }
        // 5% Chance Rocket (Moon)
        else if (rand > 0.95) {
            hasRocket = true;
        }
        // 10% Chance Breakable (Red) - BUT NOT if gap is maxed out
        // We only allow red if we generate a "Safety" platform nearby, 
        // OR we just assume this is a "trap" and the main path continues next loop.
        // Simplified: The "Main Chain" is always solid. We add traps *extra*.
        
        // C. Create the "Main Path" Platform (Always Solid/Jumpable)
        platforms.push({
            x: newX,
            y: newY,
            type: type,
            w: 80,
            h: 15,
            moving: moving,
            vx: moving ? 2 : 0,
            hasRocket: hasRocket
        });

        // D. Optional: Add a "Trap" or "Fake" platform horizontally nearby
        if (Math.random() > 0.7) {
             platforms.push({
                 x: (newX + 200) % canvas.width, // Offset X
                 y: newY + Math.random() * 50 - 25, // Offset Y slightly
                 type: 'red', // PAPER HANDS
                 w: 80,
                 h: 15,
                 moving: false,
                 broken: false
             });
        }

        highestY = newY; // Advance the generator
      }

      // 3. Cleanup old platforms (Below camera)
      platforms = platforms.filter(p => p.y < cameraY + canvas.height + 100);
    };

    // --- PARTICLE SYSTEM ---
    const createParticles = (x, y, color) => {
        for(let i=0; i<10; i++) {
            particles.push({
                x, y, 
                vx: (Math.random() - 0.5) * 10, 
                vy: (Math.random() - 0.5) * 10, 
                life: 30, 
                color
            });
        }
    };

    // --- GAME LOOP ---
    const loop = () => {
        // Clear
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // --- UPDATES ---
        if (isPlaying && active) {
            // Hero Physics
            hero.vy += GRAVITY;
            hero.y += hero.vy;
            hero.x += hero.vx;

            // Screen Wrapping
            if (hero.x > canvas.width) hero.x = -hero.w;
            if (hero.x < -hero.w) hero.x = canvas.width;

            // Camera Follow
            if (hero.y < cameraY + 300) {
                const diff = (cameraY + 300) - hero.y;
                cameraY -= diff;
                localScore += Math.floor(diff);
                setScore(localScore);
            }

            // Platform Logic
            platforms.forEach(p => {
                // Moving Platforms
                if (p.moving) {
                    p.x += p.vx;
                    if (p.x > canvas.width - p.w || p.x < 0) p.vx *= -1;
                }

                // Collision (Only falling)
                if (
                    !p.broken &&
                    hero.vy > 0 && 
                    hero.x + hero.w * 0.8 > p.x && 
                    hero.x + hero.w * 0.2 < p.x + p.w &&
                    hero.y + hero.h > p.y && 
                    hero.y + hero.h < p.y + p.h + 20 // Tolerance
                ) {
                    if (p.type === 'red') {
                        p.broken = true;
                        createParticles(p.x + 40, p.y, 'red');
                        hero.vy = 0; // Loss of momentum
                    } else {
                        hero.vy = JUMP_FORCE;
                        if (p.hasRocket) {
                            hero.vy = -35; // SUPER JUMP
                            createParticles(hero.x, hero.y, 'gold');
                            setMessage("TO THE MOON! 🚀");
                            setTimeout(() => setMessage(""), 2000);
                        }
                    }
                }
            });

            // Generator
            generatePlatforms();

            // Death Check
            if (hero.y > cameraY + canvas.height) {
                active = false;
                setGameOver(true);
                if (username) supabase.from('leaderboards').insert([{ game_id: 'doodle', username, score: localScore }]);
            }

            // Particle Updates
            particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
            particles = particles.filter(p => p.life > 0);
        }

        // --- DRAWING ---
        ctx.save();
        ctx.translate(0, -cameraY);

        // Draw Platforms
        platforms.forEach(p => {
            if (p.broken) return;

            let img = imgGreen;
            if (p.type === 'red') img = imgRed;
            if (p.type === 'blue') img = imgBlue;

            ctx.drawImage(img, p.x, p.y, p.w, p.h);
            
            if (p.hasRocket) {
                ctx.drawImage(imgRocket, p.x + 20, p.y - 30, 30, 30);
            }
        });

        // Draw Particles
        particles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 4, 4);
        });

        // Draw Hero
        ctx.save();
        if (hero.vx < 0) { // Flip if moving left
             ctx.translate(hero.x + hero.w, hero.y);
             ctx.scale(-1, 1);
             ctx.drawImage(imgHero, 0, 0, hero.w, hero.h);
        } else {
             ctx.drawImage(imgHero, hero.x, hero.y, hero.w, hero.h);
        }
        ctx.restore();

        ctx.restore();

        // Message Overlay (Moon)
        if (message) {
            ctx.fillStyle = "yellow";
            ctx.font = "30px Impact";
            ctx.fillText(message, 50, 200);
        }

        animationId = requestAnimationFrame(loop);
    };

    // --- INPUTS ---
    const handleKeyDown = (e) => {
        if (e.key === 'ArrowLeft') hero.vx = -MOVE_SPEED;
        if (e.key === 'ArrowRight') hero.vx = MOVE_SPEED;
    };
    const handleKeyUp = () => hero.vx = 0;
    
    // Mobile
    const handleTouchStart = (e) => {
        const x = e.touches[0].clientX;
        if (x < window.innerWidth / 2) hero.vx = -MOVE_SPEED;
        else hero.vx = MOVE_SPEED;
    };
    const handleTouchEnd = () => hero.vx = 0;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    
    loop();

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
        cancelAnimationFrame(animationId);
    };
  }, [resetKey, isPlaying]); // Reset triggers full rebuild

  // --- UI HANDLERS ---
  useEffect(() => {
    if (!gameOver) {
      const t = setTimeout(() => setIsPlaying(true), 3000);
      return () => clearTimeout(t);
    }
  }, [resetKey, gameOver]);

  const handleRestart = () => {
    setGameOver(false);
    setIsPlaying(false);
    setScore(0);
    setMessage("");
    setResetKey(prev => prev + 1);
  };

  return (
    <div className="game-wrapper">
        <GameUI 
            score={score} 
            gameOver={gameOver} 
            isPlaying={isPlaying}
            onRestart={handleRestart} 
            onExit={onExit} 
            gameId="doodle" 
        />
        <canvas ref={canvasRef} width={400} height={600} />
    </div>
  );
};

export default StonksJump;