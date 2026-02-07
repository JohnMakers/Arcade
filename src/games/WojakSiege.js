import React, { useEffect, useRef, useState, useContext } from 'react';
import Matter from 'matter-js';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import { ASSETS } from '../assets/AssetConfig';
import GameUI from '../components/GameUI';

const WojakSiege = ({ onExit }) => {
    const sceneRef = useRef(null);
    const { username } = useContext(UserContext);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Engine Ref for cleanup and control
    const engineRef = useRef(null);
    const renderRef = useRef(null);
    const runnerRef = useRef(null);

    useEffect(() => {
        const { Engine, Render, Runner, World, Bodies, Mouse, MouseConstraint, Events, Composite } = Matter;

        const engine = Engine.create();
        const render = Render.create({
            element: sceneRef.current,
            engine: engine,
            options: { width: 800, height: 600, wireframes: false, background: '#222' }
        });

        // Store refs
        engineRef.current = engine;
        renderRef.current = render;
        const runner = Runner.create();
        runnerRef.current = runner;

        // --- GAME SETUP ---
        const ground = Bodies.rectangle(400, 590, 810, 60, { isStatic: true, render: { fillStyle: '#444'} });
        World.add(engine.world, ground);

        const createFort = (x, y) => {
            const stack = Composite.create();
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const block = Bodies.rectangle(x + j * 45, y - i * 45, 40, 40, {
                        render: { sprite: { texture: ASSETS.RED_CANDLE, xScale: 0.1, yScale: 0.1 } }
                    });
                    Composite.add(stack, block);
                }
            }
            return stack;
        };
        World.add(engine.world, createFort(500, 500));

        const target = Bodies.circle(550, 400, 25, {
            label: 'cringe_target',
            render: { sprite: { texture: ASSETS.CRINGE_TARGET, xScale: 0.2, yScale: 0.2 } }
        });
        World.add(engine.world, target);

        const rock = Bodies.circle(150, 450, 20, { 
            density: 0.004,
            render: { sprite: { texture: ASSETS.WOJAK_HERO, xScale: 0.15, yScale: 0.15 } }
        });
        const anchor = { x: 150, y: 450 };
        const elastic = Matter.Constraint.create({ 
            pointA: anchor, bodyB: rock, stiffness: 0.05, length: 10
        });
        World.add(engine.world, [rock, elastic]);

        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: { stiffness: 0.2, render: { visible: false } }
        });
        World.add(engine.world, mouseConstraint);

        Events.on(engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                if (pair.bodyA.label === 'cringe_target' || pair.bodyB.label === 'cringe_target') {
                    if (pair.collision.depth > 2) {
                        setScore(s => {
                           const newScore = s + 100;
                           // Trigger Game Over after hit (for demo purposes)
                           setTimeout(() => handleGameOver(newScore), 1000); 
                           return newScore;
                        });
                    }
                }
            });
        });

        // Start but keep disabled until countdown finishes
        Render.run(render);
        // We do NOT run the runner yet.

        return () => {
            Render.stop(render);
            Runner.stop(runner);
            World.clear(engine.world);
            Engine.clear(engine);
        };
    }, []);

    // Countdown Start Logic
    useEffect(() => {
        if (isPlaying && runnerRef.current && engineRef.current) {
            Matter.Runner.run(runnerRef.current, engineRef.current);
        }
    }, [isPlaying]);

    // Timer Sync
    useEffect(() => {
        if(!gameOver) {
            const t = setTimeout(() => setIsPlaying(true), 3000);
            return () => clearTimeout(t);
        }
    }, [gameOver]);

    const handleGameOver = (finalScore) => {
        setGameOver(true);
        Matter.Runner.stop(runnerRef.current); // Stop physics
        if(username) supabase.from('leaderboards').insert([{ game_id: 'angry', username, score: finalScore }]).then();
    };

    const handleRestart = () => {
        // Full reload needed for Physics engine reset usually
        // For simplicity in React, we can just remount the component
        onExit(); 
        setTimeout(() => { /* Parent would handle re-entry ideally, but user asked for restart button */ }, 10);
        // Hack: Reload page or force update. 
        // Better: The onExit takes you to menu, user clicks game again. 
        // To strictly restart: 
        window.location.reload(); 
    };

    return (
        <div style={{position: 'relative'}}>
            <GameUI score={score} gameOver={gameOver} onRestart={handleRestart} onExit={onExit} gameId="angry" />
            <div ref={sceneRef} />
        </div>
    );
};

export default WojakSiege;