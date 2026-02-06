import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';

const PepeFrogger = ({ onExit }) => {
    const canvasRef = useRef(null);
    const { username } = useContext(UserContext);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let frameId;
        
        // Config
        const GRID = 40;
        let speedMultiplier = 1.0;
        let gameScore = 0;
        
        const hero = { x: 5 * GRID, y: 13 * GRID, w: GRID, h: GRID };
        
        // Chunk Generation Logic [cite: 14]
        // Rows: 0=Safe, 1-5=Road, 6=Safe, 7-11=Water, 12=Start
        let rows = [];

        const generateLevel = () => {
             rows = [];
             for(let i=0; i<14; i++) {
                 let type = 'safe';
                 if(i > 0 && i < 6) type = 'water'; // Nyan logs
                 if(i > 7 && i < 13) type = 'road'; // Normie cars
                 
                 rows.push({
                     y: i * GRID,
                     type: type,
                     speed: (Math.random() * 2 + 1) * (Math.random() < 0.5 ? 1 : -1) * speedMultiplier,
                     elements: [] // Array of cars/logs
                 });
                 
                 // Populate elements
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

            // Draw & Update Rows
            rows.forEach(row => {
                // Background
                if(row.type === 'safe') ctx.fillStyle = "purple";
                else if(row.type === 'road') ctx.fillStyle = "black";
                else ctx.fillStyle = "blue";
                ctx.fillRect(0, row.y, canvas.width, GRID);

                // Elements (Cars/Logs)
                row.elements.forEach(el => {
                    el.x += row.speed;
                    if(el.x > canvas.width) el.x = -el.w;
                    if(el.x < -el.w) el.x = canvas.width;

                    // Draw
                    if(row.type === 'road') {
                        ctx.fillStyle = "red"; // Car
                        // ctx.drawImage(...) use ASSETS.NORMIE_CAR
                    } else {
                        ctx.fillStyle = "brown"; // Log
                        // ctx.drawImage(...) use ASSETS.NYAN_LOG
                    }
                    ctx.fillRect(el.x, row.y + 5, el.w, GRID - 10); // Placeholder rect

                    // Collision Logic
                    if(hero.y === row.y) {
                         // AABB Collision
                         if(hero.x < el.x + el.w && hero.x + hero.w > el.x) {
                             if(row.type === 'road') endGame("L + RATIO"); // Hit car
                             // Note: On water, collision is GOOD (riding log)
                         }
                    }
                });
                
                // Water Logic: If on water row and NOT colliding with log -> drown
                if(hero.y === row.y && row.type === 'water') {
                    let onLog = false;
                    row.elements.forEach(el => {
                        if(hero.x < el.x + el.w && hero.x + hero.w > el.x) {
                            onLog = true;
                            hero.x += row.speed; // Move with log
                        }
                    });
                    if(!onLog) endGame("SPLASH");
                }
            });

            // Draw Hero
            ctx.fillStyle = "lime";
            ctx.fillRect(hero.x, hero.y, hero.w, hero.h);

            // Win Condition (Reach Top Safe Zone)
            if(hero.y <= 0) {
                gameScore += 100;
                setScore(gameScore);
                speedMultiplier += 0.15; // 15% Faster [cite: 56]
                hero.y = 13 * GRID; // Reset Pos
                generateLevel(); // New Chunk
            }

            frameId = requestAnimationFrame(loop);
        };

        const handleKey = (e) => {
            if(e.key === 'ArrowUp') hero.y -= GRID;
            if(e.key === 'ArrowDown') hero.y += GRID;
            if(e.key === 'ArrowLeft') hero.x -= GRID;
            if(e.key === 'ArrowRight') hero.x += GRID;
        };
        
        const endGame = (reason) => {
             setGameOver(true);
             supabase.from('leaderboards').insert([{ game_id: 'frogger', username, score: gameScore }]);
        };

        window.addEventListener('keydown', handleKey);
        loop();
        return () => {
             window.removeEventListener('keydown', handleKey);
             cancelAnimationFrame(frameId);
        };
    }, []);

    return (
         <div>
            {gameOver && <h1 style={{color:'red'}}>WASTED</h1>}
            <canvas ref={canvasRef} width={400} height={560} className="game-canvas"/>
         </div>
    );
};
export default PepeFrogger;