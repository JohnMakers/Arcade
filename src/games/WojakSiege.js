import React, { useEffect, useRef, useState, useContext } from 'react';
import Matter from 'matter-js';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import { ASSETS } from '../assets/AssetConfig';

const WojakSiege = ({ onExit }) => {
    const sceneRef = useRef(null);
    const { username } = useContext(UserContext);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const { Engine, Render, Runner, World, Bodies, Mouse, MouseConstraint, Events, Composite } = Matter;

        const engine = Engine.create();
        const render = Render.create({
            element: sceneRef.current,
            engine: engine,
            options: {
                width: 800,
                height: 600,
                wireframes: false,
                background: '#222'
            }
        });

        // Ground
        const ground = Bodies.rectangle(400, 590, 810, 60, { isStatic: true, render: { fillStyle: '#444'} });
        World.add(engine.world, ground);

        // Procedural Stack Generator
        const createFort = (x, y) => {
            const stack = Composite.create();
            // Create a pyramid or stack of 6-10 blocks
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const block = Bodies.rectangle(x + j * 45, y - i * 45, 40, 40, {
                        render: { 
                            sprite: { texture: ASSETS.RED_CANDLE, xScale: 0.1, yScale: 0.1 } // Placeholder Texture
                        }
                    });
                    Composite.add(stack, block);
                }
            }
            return stack;
        };

        const fort = createFort(500, 500);
        World.add(engine.world, fort);

        // The "Cringe" Target
        const target = Bodies.circle(550, 400, 25, {
            label: 'cringe_target',
            render: { sprite: { texture: ASSETS.CRINGE_TARGET, xScale: 0.2, yScale: 0.2 } }
        });
        World.add(engine.world, target);

        // Wojak Slingshot
        const rock = Bodies.circle(150, 450, 20, { 
            density: 0.004,
            render: { sprite: { texture: ASSETS.WOJAK_HERO, xScale: 0.15, yScale: 0.15 } }
        });
        const anchor = { x: 150, y: 450 };
        const elastic = Matter.Constraint.create({ 
            pointA: anchor, 
            bodyB: rock, 
            stiffness: 0.05,
            length: 10
        });
        World.add(engine.world, [rock, elastic]);

        // Mouse
        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: { stiffness: 0.2, render: { visible: false } }
        });
        World.add(engine.world, mouseConstraint);

        // Collision Logic (Win Condition)
        Events.on(engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                if (pair.bodyA.label === 'cringe_target' || pair.bodyB.label === 'cringe_target') {
                    // Check if hit hard enough
                    const impact = pair.collision.depth;
                    if (impact > 2) {
                        setScore(s => s + 100);
                        // In a full version, we'd remove the body here
                    }
                }
            });
        });

        Runner.run(Runner.create(), engine);
        Render.run(render);

        return () => {
            Render.stop(render);
            World.clear(engine.world);
            Engine.clear(engine);
        };
    }, []);

    return (
        <div>
            <div style={{position: 'absolute', top: 10, left: 10, color: 'white'}}>SCORE: {score} (PHYSICS BETA)</div>
            <button className="btn-meme" style={{position: 'absolute', top: 10, right: 10}} onClick={onExit}>EXIT</button>
            <div ref={sceneRef} />
        </div>
    );
};

export default WojakSiege;