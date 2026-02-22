import React, { useRef, useEffect, useState, useContext } from 'react';
import { ASSETS } from '../assets/AssetConfig';
import { supabase } from '../lib/supabaseClient';
import { UserContext } from '../context/UserContext';
import GameUI from '../components/GameUI';

// --- EXPANDED 50 FUD HEADLINES ---
const FUD_HEADLINES = [
    "Crypto is Dead Again", "Government Bans Frogs", "SEC Investigates Memes", 
    "Dev Sold the Bag", "Rugpull Imminent!", "Binance Delists Everything", 
    "Taxes Raised to 99%", "Internet to be Shutdown", "Bear Market Extended 10 Yrs",
    "Quantum Computers Break BTC", "Tether Unbacked, CEO Missing", "Vitalik Quits Ethereum",
    "Satoshi Dumps All Coins", "Gas Fees Reach $10,000", "Solana Network Halts (Again)",
    "Discord Hacked, Apes Stolen", "Jim Cramer Says Buy Crypto", "Anti-Meme Bill Passed",
    "Exchange Hacked for Billions", "Liquidity Pool Drained", "Smart Contract Exploit Found",
    "Treasury Wallets Blacklisted", "Hardware Wallet Firm Hacked", "Mining Banned Worldwide",
    "Stablecoin Depegs to $0.10", "CEO Arrested at Airport", "CEX Pauses Withdrawals",
    "Mainnet Launch Delayed 5 Yrs", "Airdrop Claim Site is Phishing", "Project Abandons Roadmap",
    "VCs Dump All Bags", "Token Supply Minted to Infinity", "Website Domain Expires",
    "Yield Farm APY Drops to 0%", "NFT Floor Price Hits Zero", "Market Cap Drops 90% Overnight",
    "Influencer Apologizes for Scam", "Wallet App Stealing Seeds", "Central Banks Ban DeFi",
    "Node Operators Strike", "Audit Failed Security Check", "Metaverse Land Worthless",
    "Crypto YouTube Channels Deleted", "Whale Moves 100k BTC to CEX", "Gas Limit Reached, Clogged",
    "Staking Rewards Canceled", "Legal Team Quits Project", "Bridged Assets Frozen",
    "Developer Wallet Compromised", "It Was All a Ponzi"
];

// --- EXPANDED 50 BULL HEADLINES ---
const BULL_HEADLINES = [
    "Pepe to the Moon!", "Stakers Getting Rich", "Elon Tweets Pepe", 
    "New ATH Reached!", "Massive Burn Announced", "Spot ETF Approved", 
    "Institutions Buying the Dip", "Normies Fomo In", "Lambos Sold Out Everywhere",
    "Fed Cuts Rates to Zero", "Bitcoin Legal Tender Worldwide", "Super Bowl Ad Features Doge",
    "China Unbans Crypto", "Saylor Buys the Float", "McDonalds Accepts Meme Coins",
    "Hacker Returns All Funds", "Binance Lists $PEPE on Spot", "Airdrop Makes Thousands Millionaires",
    "Apple Integrates Web3 Wallet", "Amazon Adopts Crypto Payments", "Crypto Market Cap Surpasses Gold",
    "Whales Accumulating Quietly", "Venture Capital Pours Billions In", "Developer Releases V2 Contract",
    "Gas Fees Hit All-Time Low", "Layer 2 Adoption Skyrockets", "Major Bank Issues Bullish Report",
    "Sovereign Wealth Fund Buys Crypto", "Presidential Candidate Pro-Crypto", "Staking APY Boosted to 1000%",
    "Token Supply Capped Definitively", "Partnership with Google Cloud", "DEX Volume Flips CEX Volume",
    "Mainnet Successfully Launched", "Top Tier Audit Passed 100%", "Meme Coin Flippening Complete",
    "Celebrity Changes PFP to Pepe", "GameFi Hub Records 1M Players", "Deflationary Tokenomics Kicking In",
    "Short Squeeze Liquidates Bears", "Golden Cross Confirmed on Weekly", "Tether Fully Backed by Treasuries",
    "Visa Settles in USDC", "Crypto Wallet Downloads Top Charts", "Tax-Free Crypto Zones Established",
    "Decentralized Social Media Booming", "Community Votes to Burn Treasury", "Early Investors Diamond Handing",
    "ZK Proofs Solve Privacy", "We Are All Going to Make It"
];

const NewsCheck = ({ onExit }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const playTimeoutRef = useRef(null);
  const { username, address } = useContext(UserContext);

  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Constants
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 800;
  const WARMUP_SCORE = 10; 
  const SWIPE_THRESHOLD = 120; 
  const PAPER_WIDTH = 300;
  const PAPER_HEIGHT = 350;

  // We use this ref to keep track of real-time status without closure issues in the loop
  const gameState = useRef({
    status: 'IDLE', // IDLE, PLAYING, GAMEOVER
    score: 0,
    sprites: {},
    currentPaper: null,
    particles: [],
    timer: 100, 
    timerDrainRate: 0.15, 
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    offsetX: 0,
    offsetY: 0,
    lastTapTime: 0,
    lastTime: 0
  });

  // Load Assets
  useEffect(() => {
    const loadSprite = (key, src) => {
      const img = new Image();
      img.src = src;
      img.crossOrigin = "Anonymous";
      img.onload = () => { gameState.current.sprites[key] = img; };
    };

    loadSprite('bg', ASSETS.NC_BG);
    loadSprite('paper', ASSETS.NC_PAPER);
    loadSprite('paper_gold', ASSETS.NC_PAPER_GOLD);
    loadSprite('trash', ASSETS.NC_TRASH);
    loadSprite('print', ASSETS.NC_PRINT);
    loadSprite('pepe', ASSETS.NC_PEPE_BOSS);

    return () => {
        if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    };
  }, []);

  const spawnPaper = () => {
    const state = gameState.current;
    const isBull = Math.random() > 0.5;
    const list = isBull ? BULL_HEADLINES : FUD_HEADLINES;
    const text = list[Math.floor(Math.random() * list.length)];
    
    const isGolden = state.score >= 5 && Math.random() < 0.15;

    state.currentPaper = {
        text,
        type: isBull ? 'BULL' : 'FUD',
        isGolden,
        isVerified: false,
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        vx: 0, // Used for game over physics
        vy: 0, // Used for game over physics
        rotation: (Math.random() - 0.5) * 0.2
    };

    state.timer = 100;
    state.timerDrainRate = Math.min(0.15 + (state.score * 0.015), 0.8);
    state.offsetX = 0;
    state.offsetY = 0;
  };

  const processSwipe = (offsetX) => {
    const state = gameState.current;
    if (state.status !== 'PLAYING') return;

    const p = state.currentPaper;
    if (!p) return;

    if (Math.abs(offsetX) > SWIPE_THRESHOLD) {
        const swipedRight = offsetX > 0;
        const guessType = swipedRight ? 'BULL' : 'FUD';

        if (p.isGolden && !p.isVerified) {
            triggerGameOver(); 
            return;
        }

        if (p.type === guessType) {
            state.score += 1;
            setScore(state.score);
            createParticles(
                swipedRight ? CANVAS_WIDTH : 0, 
                CANVAS_HEIGHT/2, 
                swipedRight ? '#00ff00' : '#ff0000'
            );
            spawnPaper();
        } else {
            triggerGameOver();
        }
    } else {
        state.offsetX = 0;
    }
  };

  const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let lineArray = [];

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            lineArray.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lineArray.push(line);

    const startY = y - ((lineArray.length - 1) * lineHeight) / 2;
    lineArray.forEach((l, i) => {
        ctx.fillText(l.trim(), x, startY + (i * lineHeight));
    });
  };

  // Input Handling
  useEffect(() => {
    const handlePointerDown = (e) => {
      const state = gameState.current;
      if (state.status !== 'PLAYING') return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const touchX = (clientX - rect.left) * scaleX;
      
      const now = Date.now();
      if (now - state.lastTapTime < 300) {
          if (state.currentPaper && state.currentPaper.isGolden && !state.currentPaper.isVerified) {
              state.currentPaper.isVerified = true;
              createParticles(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'yellow');
          }
      }
      state.lastTapTime = now;

      state.isDragging = true;
      state.dragStartX = touchX;
    };

    const handlePointerMove = (e) => {
      const state = gameState.current;
      if (state.status !== 'PLAYING' || !state.isDragging) return;
      if (e.cancelable) e.preventDefault();
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const touchX = (clientX - rect.left) * scaleX;
      
      gameState.current.offsetX = touchX - gameState.current.dragStartX;
    };

    const handlePointerUp = () => {
      const state = gameState.current;
      if (!state.isDragging || !state.currentPaper) return;
      state.isDragging = false;
      processSwipe(state.offsetX);
    };

    const wrapper = containerRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousedown', handlePointerDown);
      wrapper.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      wrapper.addEventListener('touchstart', handlePointerDown, { passive: false });
      wrapper.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('touchend', handlePointerUp);
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousedown', handlePointerDown);
        wrapper.removeEventListener('mousemove', handlePointerMove);
        wrapper.removeEventListener('touchstart', handlePointerDown);
        wrapper.removeEventListener('touchmove', handlePointerMove);
      }
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, []); // Empty dependency array, state reads via refs

  // Keyboard Handling
  useEffect(() => {
    const handleKeyDown = (e) => {
        const state = gameState.current;
        if (state.status !== 'PLAYING') return;
        
        const p = state.currentPaper;
        if (!p) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            processSwipe(-SWIPE_THRESHOLD - 10);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            processSwipe(SWIPE_THRESHOLD + 10);
        } else if (e.key === 'ArrowUp' || e.key === ' ') {
            e.preventDefault(); 
            if (p.isGolden && !p.isVerified) {
                p.isVerified = true;
                createParticles(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'yellow');
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  // Core Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    gameState.current.score = 0;
    gameState.current.particles = [];
    spawnPaper();
    gameState.current.lastTime = performance.now();

    let animationId;

    const loop = (time) => {
      const state = gameState.current;
      const dt = Math.min((time - state.lastTime) / 16.667, 2.0);
      state.lastTime = time;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 1. Draw Background
      if (state.sprites['bg']) {
          ctx.drawImage(state.sprites['bg'], 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
          ctx.fillStyle = '#222';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.fillStyle = '#111';
          ctx.fillRect(CANVAS_WIDTH/2 - 160, 0, 320, CANVAS_HEIGHT);
      }

      // 2. Draw Pepe Boss (with slight hover animation)
      if (state.sprites['pepe']) {
          const hoverY = Math.sin(time / 300) * 5; // Creates a breathing effect
          ctx.drawImage(state.sprites['pepe'], CANVAS_WIDTH/2 - 75, 40 + hoverY, 150, 150);
      }

      // 3. Draw Indicators (Now significantly larger: 140x140)
      ctx.globalAlpha = 0.5;
      if (state.sprites['trash']) ctx.drawImage(state.sprites['trash'], 10, CANVAS_HEIGHT/2 - 70, 140, 140);
      else { ctx.fillStyle = 'red'; ctx.fillText("🗑️", 60, CANVAS_HEIGHT/2); }
      
      if (state.sprites['print']) ctx.drawImage(state.sprites['print'], CANVAS_WIDTH - 150, CANVAS_HEIGHT/2 - 70, 140, 140);
      else { ctx.fillStyle = 'green'; ctx.fillText("🖨️", CANVAS_WIDTH - 60, CANVAS_HEIGHT/2); }
      ctx.globalAlpha = 1.0;

      const p = state.currentPaper;
      
      if (p) {
          // Timer logic
          if (state.status === 'PLAYING') {
              if (!state.isDragging) {
                 state.timer -= state.timerDrainRate * dt;
                 if (state.timer <= 0) triggerGameOver();
              }
          } 
          // Game Over Physics Logic
          else if (state.status === 'GAMEOVER') {
              p.vy += 0.8 * dt; // Gravity
              p.y += p.vy * dt;
              p.x += p.vx * dt;
              p.rotation += (p.vx > 0 ? 0.05 : -0.05) * dt;
          }

          ctx.save();
          ctx.translate(p.x + state.offsetX, p.y + state.offsetY);
          ctx.rotate(p.rotation + (state.offsetX * 0.002));

          const paperKey = p.isGolden ? 'paper_gold' : 'paper';
          if (state.sprites[paperKey]) {
              ctx.drawImage(state.sprites[paperKey], -PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
          } else {
              ctx.fillStyle = p.isGolden ? '#ffd700' : '#f4f4f4';
              ctx.fillRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
              ctx.strokeStyle = '#000';
              ctx.strokeRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
          }

          if (p.isGolden && p.isVerified) {
              ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
              ctx.fillRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
          }

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '24px "Press Start 2P", cursive';
          
          if (state.score < WARMUP_SCORE) {
              ctx.fillStyle = p.type === 'FUD' ? '#cc0000' : '#009900';
          } else {
              ctx.fillStyle = '#111'; 
          }

          wrapText(ctx, p.text, 0, 0, PAPER_WIDTH - 40, 35);

          if (p.isGolden && !p.isVerified) {
              ctx.fillStyle = 'blue';
              ctx.font = '14px "Press Start 2P"';
              ctx.fillText("DOUBLE TAP!", 0, -PAPER_HEIGHT/2 + 30);
          } else if (p.isGolden && p.isVerified) {
              ctx.fillStyle = 'green';
              ctx.font = '16px "Press Start 2P"';
              ctx.fillText("VERIFIED", 0, -PAPER_HEIGHT/2 + 30);
          }

          if (Math.abs(state.offsetX) > 20) {
             ctx.globalAlpha = Math.min(Math.abs(state.offsetX) / SWIPE_THRESHOLD, 0.5);
             ctx.fillStyle = state.offsetX > 0 ? '#00ff00' : '#ff0000';
             ctx.fillRect(-PAPER_WIDTH/2, -PAPER_HEIGHT/2, PAPER_WIDTH, PAPER_HEIGHT);
             ctx.globalAlpha = 1.0;
          }

          ctx.restore();
      }

      ctx.fillStyle = '#333';
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);
      ctx.fillStyle = state.timer > 30 ? '#00ff00' : '#ff0000';
      ctx.fillRect(0, CANVAS_HEIGHT - 20, (state.timer / 100) * CANVAS_WIDTH, 20);

      state.particles.forEach((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          ctx.globalAlpha = p.life / 30;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [resetKey]);

  const createParticles = (x, y, color) => {
      for(let i=0; i<15; i++) {
          gameState.current.particles.push({
              x, y, 
              vx: (Math.random() - 0.5) * 15,
              vy: (Math.random() - 0.5) * 15,
              life: 30,
              size: Math.random() * 6 + 2,
              color: color
          });
      }
  };

  const triggerGameOver = async () => {
      const state = gameState.current;
      if (state.status === 'GAMEOVER') return;
      
      state.status = 'GAMEOVER';
      
      // Dynamic fall animation setup
      if (state.currentPaper) {
         state.currentPaper.vy = -12; // Initial pop upwards
         state.currentPaper.vx = (Math.random() - 0.5) * 15; // Random sideways spin
      }

      if (username) {
        await supabase.from('leaderboards').insert([{
            game_id: 'newscheck', 
            username, 
            score: state.score, 
            address: address
        }]);
      }

      setGameOver(true);
      setIsPlaying(false);
  };

  const startGame = () => {
      setHasStarted(true); 
      gameState.current.status = 'IDLE'; // Paused for countdown
      playTimeoutRef.current = setTimeout(() => {
          gameState.current.status = 'PLAYING';
          setIsPlaying(true);
      }, 3000); 
  };

  return (
    <div ref={containerRef} className="game-wrapper" style={{ touchAction: 'none' }}>
        
        {hasStarted && (
            <GameUI 
                score={score} 
                gameOver={gameOver} 
                isPlaying={isPlaying} 
                onRestart={() => { 
                    setGameOver(false); 
                    setIsPlaying(false); 
                    setScore(0); 
                    setResetKey(prev => prev + 1); 
                    
                    gameState.current.status = 'IDLE';
                    if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
                    
                    playTimeoutRef.current = setTimeout(() => {
                        gameState.current.status = 'PLAYING';
                        setIsPlaying(true);
                    }, 3000);
                }} 
                onExit={onExit} 
                gameId="newscheck" 
            />
        )}
        
        <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT} 
            style={{ width: '100%', maxWidth: '500px', height: 'auto', display: 'block', cursor: 'grab' }} 
        />
        
        {!hasStarted && (
            <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                background: 'rgba(0,0,0,0.95)', zIndex: 50, pointerEvents: 'auto',
                boxSizing: 'border-box', padding: '20px'
            }}>
                <h2 className="meme-text" style={{color: 'yellow', marginBottom: '30px', fontSize: '1.5rem', textAlign: 'center'}}>
                    $NEWS CHECK FRENZY
                </h2>
                
                <div style={{
                    color: '#fff', fontSize: '0.9rem', lineHeight: '2.5', textAlign: 'center', 
                    fontFamily: '"Press Start 2P"', marginBottom: '40px'
                }}>
                    <div style={{color: '#ff4444'}}>SWIPE LEFT (OR ⬅️) = FUD 🗑️</div>
                    <div style={{color: '#00ff00'}}>SWIPE RIGHT (OR ➡️) = PRINT 🖨️</div>
                    <div style={{color: '#ffd700', marginTop: '15px'}}>GOLDEN PAPER = DOUBLE TAP! (OR ⬆️)</div>
                    
                    <div style={{color: '#aaa', fontSize: '0.7rem', marginTop: '30px', lineHeight: '1.8'}}>
                        * Speed increases over time.<br/>
                        * Text turns black after 10 points. Read fast!
                    </div>
                </div>

                <button className="btn-meme" onClick={startGame}>
                    START SHIFT
                </button>
            </div>
        )}
    </div>
  );
};

export default NewsCheck;