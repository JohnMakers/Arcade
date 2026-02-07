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
  
  useEffect(() => {
    if (!isPlaying || gameOver) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let frameId;
    
    let hero = { x: 200, y: 300, vx: 0, vy: 0 };
    const GRAVITY = 0.4;
    const JUMP_FORCE = -10;
    let cameraY = 0;
    let localScore = 0;
    let platforms = [{ x: 150, y: 400, type: 'green' }];

    const loop = () => {
        ctx.fillStyle = "#111";
        ctx.fillRect(0,0, canvas.width, canvas.height);
        
        hero.vy += GRAVITY;
        hero.y += hero.vy;
        hero.x += hero.vx;
        
        if(hero.x > canvas.width) hero.x = 0;
        if(hero.x < 0) hero.x = canvas.width;
        
        if(hero.y < cameraY + 300) {
            cameraY = hero.y - 300;
            localScore = Math.floor(Math.abs(cameraY));
            setScore(localScore);
        }

        const lowest = platforms[platforms.length - 1];
        if (lowest && lowest.y > cameraY + 600) platforms.shift();
        
        if(platforms.length < 10) {
            let lastY = platforms[platforms.length-1].y;
            platforms.push({
                x: Math.random() * 340, 
                y: lastY - (Math.random() * 80 + 40),
                type: Math.random() > 0.1 ? 'green' : 'red'
            });
        }

        ctx.save();
        ctx.translate(0, -cameraY);

        platforms.forEach(p => {
            ctx.fillStyle = p.type === 'green' ? '#00ff00' : 'red';
            ctx.fillRect(p.x, p.y, 60, 15);
            
            if(hero.vy > 0 && 
               hero.x + 20 > p.x && hero.x < p.x + 60 &&
               hero.y + 30 > p.y && hero.y + 30 < p.y + 20) {
                   hero.vy = p.type === 'green' ? JUMP_FORCE : 0;
            }
        });

        ctx.fillStyle = "white";
        ctx.fillRect(hero.x, hero.y, 30, 30);
        ctx.restore();

        if(hero.y > cameraY + 600) {
            setGameOver(true);
            if(username) supabase.from('leaderboards').insert([{ game_id: 'doodle', username, score: localScore }]).then();
            cancelAnimationFrame(frameId);
        } else {
            frameId = requestAnimationFrame(loop);
        }
    };

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
        cancelAnimationFrame(frameId);
    };

  }, [isPlaying, gameOver]);

  // Sync Countdown
  useEffect(() => {
    if(!gameOver) {
        const t = setTimeout(() => setIsPlaying(true), 3000);
        return () => clearTimeout(t);
    }
  }, [gameOver]);

  const handleRestart = () => {
    setScore(0);
    setGameOver(false);
    setIsPlaying(false);
  };

  return (
    <div style={{position: 'relative'}}>
        <GameUI score={score} gameOver={gameOver} onRestart={handleRestart} onExit={onExit} gameId="doodle" />
        <canvas ref={canvasRef} width={400} height={600} className="game-canvas"/>
    </div>
  );
};

export default StonksJump;