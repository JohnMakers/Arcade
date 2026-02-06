import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';

const StonksJump = ({ onExit }) => {
  const canvasRef = useRef(null);
  const { username } = useContext(UserContext);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Physics
    let hero = { x: 200, y: 300, vx: 0, vy: 0 };
    const GRAVITY = 0.4;
    const JUMP_FORCE = -10;
    
    // Camera
    let cameraY = 0;
    let score = 0;

    // Platforms
    let platforms = [{ x: 150, y: 400, type: 'green' }]; // Start platform
    
    const loop = () => {
        // Clear
        ctx.fillStyle = "#111";
        ctx.fillRect(0,0, canvas.width, canvas.height);
        
        // Logic
        hero.vy += GRAVITY;
        hero.y += hero.vy;
        hero.x += hero.vx;
        
        // Wrap Horizontal
        if(hero.x > canvas.width) hero.x = 0;
        if(hero.x < 0) hero.x = canvas.width;
        
        // Move Camera if hero goes high
        if(hero.y < cameraY + 300) {
            cameraY = hero.y - 300;
            score = Math.floor(Math.abs(cameraY));
        }

        // Generate Platforms (Infinite Logic)
        const lowestPlatform = platforms[platforms.length - 1];
        if (lowestPlatform.y > cameraY + 600) {
            // Remove old
            platforms.shift();
        }
        const highestPlatform = platforms[0]; // Assuming sorted descending roughly
        // If we need new platforms
        // (Simplified generation for brevity)
        if(platforms.length < 10) {
            let newY = platforms[platforms.length-1].y - (Math.random() * 100 + 50);
            platforms.push({
                x: Math.random() * 300, 
                y: newY,
                type: Math.random() > 0.1 ? 'green' : 'red' // 10% chance of Red Candle [cite: 62]
            });
        }

        ctx.save();
        ctx.translate(0, -cameraY); // Camera Transform

        // Draw Platforms
        platforms.forEach(p => {
            ctx.fillStyle = p.type === 'green' ? '#00ff00' : 'red';
            ctx.fillRect(p.x, p.y, 60, 15);
            
            // Collision (Only when falling)
            if(hero.vy > 0 && 
               hero.x + 20 > p.x && hero.x < p.x + 60 &&
               hero.y + 30 > p.y && hero.y + 30 < p.y + 20) {
                   
                   if(p.type === 'green') {
                       hero.vy = JUMP_FORCE;
                   } else {
                       // Red Candle kills momentum [cite: 62]
                       hero.vy = 0; 
                   }
            }
        });

        // Draw Hero
        ctx.fillStyle = "white";
        ctx.fillRect(hero.x, hero.y, 30, 30); // Placeholder for Stonks Man

        ctx.restore();

        // Fall check
        if(hero.y > cameraY + 600) {
            // Game Over
            supabase.from('leaderboards').insert([{ game_id: 'doodle', username, score: score }]);
            onExit();
        }

        requestAnimationFrame(loop);
    };

    // Controls
    const handleKey = (e) => {
        if(e.key === 'ArrowLeft') hero.vx = -4;
        if(e.key === 'ArrowRight') hero.vx = 4;
    };
    const stopKey = () => hero.vx = 0;

    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', stopKey);
    loop();
    
    return () => {
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('keyup', stopKey);
    };

  }, []);

  return <canvas ref={canvasRef} width={400} height={600} className="game-canvas"/>;
};

export default StonksJump;