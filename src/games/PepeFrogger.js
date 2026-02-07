import React, { useRef, useEffect, useState, useContext } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

const PepeFrogger = ({ onExit }) => {
    const canvasRef = useRef(null);
    const { username } = useContext(UserContext);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let frameId;
        
        const GRID = 40;
        let hero = { x: 5 * GRID, y: 13 * GRID, w: GRID, h: GRID };
        let active = true;
        let localScore = 0;
        
        // Generate Level
        let rows = [];
        for(let i=0; i<14; i++) {
             let type = (i>0 && i<6) ? 'water' : (i>7 && i<13) ? 'road' : 'safe';
             rows.push({
                 y: i*GRID, type, 
                 speed: (Math.random()*2+1)*(Math.random()<0.5?1:-1),
                 elements: []
             });
             // Add initial cars
             if(type!=='safe') {
                 let c = Math.floor(Math.random()*3)+1;
                 for(let j=0; j<c; j++) rows[i].elements.push({x: j*150, w: type==='water'?80:40});
             }
        }

        const loop = () => {
            ctx.fillStyle = "#333";
            ctx.fillRect(0,0, canvas.width, canvas.height);

            // Logic only if playing
            if (isPlaying && active) {
                rows.forEach(row => {
                    row.elements.forEach(el => {
                        el.x += row.speed;
                        if(el.x > canvas.width) el.x = -el.w;
                        if(el.x < -el.w) el.x = canvas.width;
                        
                        // Collision
                        if(hero.y === row.y && hero.x < el.x + el.w && hero.x + hero.w > el.x) {
                            if(row.type === 'road') die();
                        }
                    });
                    
                    if(hero.y === row.y && row.type === 'water') {
                        let onLog = row.elements.some(el => hero.x < el.x + el.w && hero.x + hero.w > el.x);
                        if(onLog) hero.x += row.speed;
                        else die();
                    }
                });
                
                // Win Row
                if(hero.y <= 0) {
                    localScore += 100;
                    setScore(localScore);
                    hero.y = 13*GRID;
                }
            }

            // Draw
            rows.forEach(row => {
                ctx.fillStyle = row.type==='safe'?'purple':row.type==='road'?'black':'blue';
                ctx.fillRect(0, row.y, canvas.width, GRID);
                row.elements.forEach(el => {
                    ctx.fillStyle = row.type==='road'?'red':'brown';
                    ctx.fillRect(el.x, row.y+5, el.w, GRID-10);
                });
            });
            
            ctx.fillStyle = "lime";
            ctx.fillRect(hero.x, hero.y, hero.w, hero.h);

            frameId = requestAnimationFrame(loop);
        };

        const die = () => {
            active = false;
            setGameOver(true);
            if(username) supabase.from('leaderboards').insert([{game_id:'frogger', username, score:localScore}]);
        };

        const handleKey = (e) => {
            if(!isPlaying || !active) return;
            if(e.key === 'ArrowUp') hero.y -= GRID;
            if(e.key === 'ArrowDown') hero.y += GRID;
            if(e.key === 'ArrowLeft') hero.x -= GRID;
            if(e.key === 'ArrowRight') hero.x += GRID;
        };

        // Touch
        const handleTouch = (e) => {
            if(!isPlaying || !active) return;
            const y = e.touches[0].clientY;
            if(y < window.innerHeight/2) hero.y -= GRID;
            else hero.y += GRID;
        }

        window.addEventListener('keydown', handleKey);
        window.addEventListener('touchstart', handleTouch);
        loop();

        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('touchstart', handleTouch);
            cancelAnimationFrame(frameId);
        };
    }, [resetKey, isPlaying]);

    useEffect(() => {
        if(!gameOver) setTimeout(() => setIsPlaying(true), 3000);
    }, [resetKey, gameOver]);

    const handleRestart = () => {
        setGameOver(false);
        setIsPlaying(false);
        setScore(0);
        setResetKey(k=>k+1);
    };

    return (
        <div className="game-wrapper">
           <GameUI score={score} gameOver={gameOver} isPlaying={isPlaying} onRestart={handleRestart} onExit={onExit} gameId="frogger" />
           <canvas ref={canvasRef} width={400} height={560} />
        </div>
    );
};
export default PepeFrogger;