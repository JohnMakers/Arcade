import React, { useEffect, useRef, useState, useContext } from 'react';
import Matter from 'matter-js';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';

const WojakSiege = ({ onExit }) => {
    const sceneRef = useRef(null);
    const { username } = useContext(UserContext);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const { Engine, Render, Runner, World, Bodies, Mouse, MouseConstraint, Composite } = Matter;

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

        // Boundaries
        const ground = Bodies.rectangle(400, 590, 810, 60, { isStatic: true, render: { fillStyle: '#444'} });
        World.add(engine.world, ground);

        // Procedural Fort Generator [cite: 27, 28]
        const generateFort = (offsetX) => {
            const stack = Matter.Composites.stack(offsetX, 300, 3, 4, 0, 0, function(x, y) {
                // Randomize material (Wood, Stone, Ice)
                const colors = ['#8B4513', '#808080', '#ADD8E6'];
                return Bodies.rectangle(x, y, 40, 40, { 
                    render: { fillStyle: colors[Math.floor(Math.random()*3)] }
                });
            });
            
            // Add "Cringe" Target (The Pig) [cite: 65]
            const pig = Bodies.circle(offsetX + 60, 250, 20, {
                label: 'pig',
                render: { fillStyle: 'red' } // Replace with sprite later
            });
            
            World.add(engine.world, [stack, pig]);
        };

        generateFort(500);

        // Slingshot Logic (Simplified)
        let rock = Bodies.circle(150, 450, 20, { density: 0.004 });
        let anchor = { x: 150, y: 450 };
        let elastic = Matter.Constraint.create({ 
            pointA: anchor, 
            bodyB: rock, 
            stiffness: 0.05
        });
        World.add(engine.world, [rock, elastic]);

        // Mouse Control
        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: { stiffness: 0.2, render: { visible: false } }
        });
        World.add(engine.world, mouseConstraint);

        // Collision/Win Check Logic
        Matter.Events.on(engine, 'collisionStart', (event) => {
             event.pairs.forEach((pair) => {
                 if(pair.bodyA.label === 'pig' || pair.bodyB.label === 'pig') {
                     // Check impact velocity to "destroy" pig
                     // If destroyed: score++, remove pig, pan camera, generate new fort [cite: 29]
                     setScore(s => s + 100);
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

    return <div ref={sceneRef} />;
};

export default WojakSiege;