import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const StonksJump = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  
  // Game States
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Controls Physics only
  const [resetKey, setResetKey] = useState(0); // Forces full reset

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // --- CONFIGURATION ---
    const GRAVITY = 0.4;
    const JUMP_FORCE = -11; 
    // Max Jump Height = (11*11) / (2*0.4) = ~151px. 
    // We set generation gap max to 130px to be safe.
    
    // --- VARIABLES ---
    let hero = { x: 200, y: 400, vx: 0, vy: 0, width: 30, height: 30 };
    let cameraY = 0;
    let localScore = 0;
    let gameActive = true;
    let animationId;
    
    // Initial Platforms
    let platforms = [
        { x: 150, y: 550, type: 'green', w: 80, h: 15 },
        { x: 150, y: 400, type: 'green', w: 80, h: 15 } // Starting platform
    ];

    // --- GENERATION LOGIC ---
    const generatePlatforms = () => {
        // Find the highest platform (lowest Y value)
        // Since we push new ones to the end, the last element is the "lowest" visual platform? 
        // No, we need to sort to be sure or track the "topmost" generated one.
        // Let's assume sorted by Y ascending (screen coords) means [0] is highest?
        // Actually, Y decreases as you go up. So the lowest number Y is the highest platform.
        
        let highestY = platforms.reduce((min, p) => p.y < min ? p.y : min, Infinity);
        
        // While the highest platform is within 1000px of the camera (screen buffer)
        // generate more above it.
        while (highestY > cameraY - 800) {
            const gap = Math.floor(Math.random() * 80) + 50; // Gap between 50px and 130px
            const newY = highestY - gap;
            
            // Random X but keep inside canvas
            const newX = Math.random() * (canvas.width - 80);
            
            // Type Logic
            const rand = Math.random();
            let type = 'green'; // Standard Buy
            if (rand > 0.8) type = 'paper'; // Paper hands (breaks)
            if (rand > 0.95) type = 'rocket'; // Super jump
            
            platforms.push({
                x: newX,
                y: newY,
                type: type,
                w: 80, 
                h: 15,
                broken: false
            });
            highestY = newY;
        }
        
        // Cleanup old platforms below camera
        platforms = platforms.filter(p => p.y < cameraY + canvas.height + 100);
    };

    // --- GAME LOOP ---
    const loop = () => {
        // 1. UPDATE (Physics) - Only if Playing
        if (isPlaying && gameActive) {
            hero.vy += GRAVITY;
            hero.y += hero.vy;
            hero.x += hero.vx;

            // Wall Wrap
            if (hero.x > canvas.width) hero.x = -hero.width;
            if (hero.x < -hero.width) hero.x = canvas.width;

            // Camera Follow (Only moves up)
            if (hero.y < cameraY + 300) {
                const diff = (cameraY + 300) - hero.y;
                cameraY -= diff; // Move camera up
                localScore += Math.floor(diff);
                setScore(localScore);
            }

            // Generate/Cleanup
            generatePlatforms();

            // Collision (Only falling)
            if (hero.vy > 0) {
                platforms.forEach(p => {
                    if (
                        !p.broken &&
                        hero.x + hero.width > p.x && 
                        hero.x < p.x + p.w &&
                        hero.y + hero.height > p.y &&
                        hero.y + hero.height < p.y + p.h + 20 // Tolerance
                    ) {
                        if (p.type === 'paper') {
                            p.broken = true; // Break it
                            hero.vy = -3; // Small hop
                        } else if (p.type === 'rocket') {
                            hero.vy = -20; // TO THE MOON
                        } else {
                            hero.vy = JUMP_FORCE; // Standard
                        }
                    }
                });
            }

            // Death
            if (hero.y > cameraY + canvas.height) {
                gameActive = false;
                setGameOver(true);
                if(username) supabase.from('leaderboards').insert([{ game_id: 'doodle', username, score: localScore }]).then();
            }
        }

        // 2. DRAW (Always runs, even during countdown)
        // Background
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(0, -cameraY); // Apply Camera

        // Platforms
        platforms.forEach(p => {
            if (p.broken) return; 
            
            if (p.type === 'green') ctx.fillStyle = '#00ff00';
            else if (p.type === 'paper') ctx.fillStyle = '#ff4444'; // Red
            else ctx.fillStyle = '#00ffff'; // Rocket Blue
            
            ctx.fillRect(p.x, p.y, p.w, p.h);
            
            // Text Details
            if (p.type === 'paper') {
                ctx.fillStyle = 'white';
                ctx.font = '10px Arial';
                ctx.fillText('PAPER', p.x + 10, p.y + 11);
            }
        });

        // Hero
        ctx.fillStyle = "white";
        // Simple Stonks Face (Placeholder)
        ctx.beginPath();
        ctx.arc(hero.x + 15, hero.y + 15, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Arrow/Hat
        ctx.fillStyle = "#00ff00";
        ctx.beginPath();
        ctx.moveTo(hero.x + 30, hero.y);
        ctx.lineTo(hero.x + 40, hero.y - 10);
        ctx.lineTo(hero.x + 30, hero.y - 10);
        ctx.fill();

        ctx.restore();

        animationId = requestAnimationFrame(loop);
    };

    // --- CONTROLS ---
    const handleKeyDown = (e) => {
        if (e.key === 'ArrowLeft') hero.vx = -5;
        if (e.key === 'ArrowRight') hero.vx = 5;
    };
    const handleKeyUp = () => hero.vx = 0;
    
    // Mobile Touch
    const handleTouchStart = (e) => {
        const touchX = e.touches[0].clientX;
        const middle = window.innerWidth / 2;
        if (touchX < middle) hero.vx = -5;
        else hero.vx = 5;
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
  }, [resetKey]); // Re-runs effect only on Reset

  // Countdown Logic (3 seconds -> Playing)
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
    setResetKey(prev => prev + 1); // Triggers the main useEffect to completely rebuild game state
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