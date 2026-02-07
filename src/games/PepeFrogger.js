import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
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
        
        const GRID = 40;
        let speedMultiplier = 1.0;
        let localScore = score;
        let hero = { x: 5 * GRID, y: 13 * GRID, w: GRID, h: GRID };
        
        // Level Gen
        let rows = [];
        const generateLevel = () => {
             rows = [];
             for(let i=0; i<14; i++) {
                 let type = 'safe';
                 if(i > 0 && i < 6) type = 'water';
                 if(i > 7 && i < 13) type = 'road';
                 
                 rows.push({
                     y: i * GRID,
                     type: type,
                     speed: (Math.random() * 2 + 1) * (Math.random() < 0.5 ? 1 : -1) * speedMultiplier,
                     elements: []
                 });
                 
                 if(type !== 'safe') {
                     let count = Math.floor(Math.random() * 3) + 1;
                     for(let j=0; j<count; j++) {
                         rows[i].elements.push({ x: j * 150 + Math.random()*50, w: type === 'water' ? 80 : 40 });
                     }
                 }
             }
        };
        generateLevel();

        const loop = () => {
            if(gameOver) return;
            ctx.fillStyle = "#333";
            ctx.fillRect(0,0, canvas.width, canvas.height);

            rows.forEach(row => {
                if(row.type === 'safe') ctx.fillStyle = "purple";
                else if(row.type === 'road') ctx.fillStyle = "black";
                else ctx.fillStyle = "blue";
                ctx.fillRect(0, row.y, canvas.width, GRID);

                row.elements.forEach(el => {
                    el.x += row.speed;
                    if(el.x > canvas.width) el.x = -el.w;
                    if(el.x < -el.w) el.x = canvas.width;

                    ctx.fillStyle = row.type === 'road' ? "red" : "brown";
                    ctx.fillRect(el.x, row.y + 5, el.w, GRID - 10);

                    if(hero.y === row.y) {
                         if(hero.x < el.x + el.w && hero.x + hero.w > el.x) {
                             if(row.type === 'road') endGame();
                         }
                    }
                });
                
                if(hero.y === row.y && row.type === 'water') {
                    let onLog = false;
                    row.elements.forEach(el => {
                        if(hero.x < el.x + el.w && hero.x + hero.w > el.x) {
                            onLog = true;
                            hero.x += row.speed;
                        }
                    });
                    if(!onLog) endGame();
                }
            });

            ctx.fillStyle = "lime";
            ctx.fillRect(hero.x, hero.y, hero.w, hero.h);

            if(hero.y <= 0) {
                localScore += 100;
                setScore(localScore);
                speedMultiplier += 0.15;
                hero.y = 13 * GRID;
                generateLevel();
            }

            frameId = requestAnimationFrame(loop);
        };

        const handleKey = (e) => {
            if(gameOver || !isPlaying) return;
            if(e.key === 'ArrowUp') hero.y -= GRID;
            if(e.key === 'ArrowDown') hero.y += GRID;
            if(e.key === 'ArrowLeft') hero.x -= GRID;
            if(e.key === 'ArrowRight') hero.x += GRID;
        };
        
        const endGame = () => {
             setGameOver(true);
             if(username) supabase.from('leaderboards').insert([{ game_id: 'frogger', username, score: localScore }]);
             cancelAnimationFrame(frameId);
        };

        window.addEventListener('keydown', handleKey);
        loop();
        return () => {
             window.removeEventListener('keydown', handleKey);
             cancelAnimationFrame(frameId);
        };
    }, [isPlaying, gameOver]); // Dependencies

    // Countdown sync
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
            <GameUI score={score} gameOver={gameOver} onRestart={handleRestart} onExit={onExit} gameId="frogger" />
            <canvas ref={canvasRef} width={400} height={560} className="game-canvas"/>
         </div>
    );
};
export default PepeFrogger;