import React, { useContext, useState } from 'react';
import { UserContext } from '../context/UserContext';

const ArcadeShell = ({ onSelectGame }) => {
  const { username, saveUser, clearUser } = useContext(UserContext);
  const [inputName, setInputName] = useState('');
  const [inputAddr, setInputAddr] = useState('');

  if (!username) {
    return (
      <div className="arcade-container">
        <h1 className="meme-text pulse">WHO ARE YOU?</h1>
        
        <div style={{
            display:'flex', 
            flexDirection:'column', 
            gap: 20, 
            marginBottom: 30, 
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {/* NAME INPUT */}
            <div className="input-group">
                <label className="meme-label" style={{color: '#00ff00'}}>
                    NAME <span style={{color: 'red'}}>*</span>
                </label>
                <input 
                  className="meme-input"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="CHAD_69"
                  maxLength={15}
                />
            </div>

            {/* ADDRESS INPUT */}
            <div className="input-group">
                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, justifyContent: 'center'}}>
                    <label className="meme-label" style={{color: 'yellow', marginBottom: 0}}>
                        WALLET (OPTIONAL)
                    </label>
                    <div className="tooltip-container">
                        <span className="info-icon">?</span>
                        <div className="tooltip-text">
                            Playing games in the arcade makes you eligible to earn rewards. 
                            In case you win a reward, it will be sent to the entered address.
                        </div>
                    </div>
                </div>

                <input 
                  className="meme-input"
                  value={inputAddr}
                  onChange={(e) => setInputAddr(e.target.value)}
                  placeholder="0x..."
                />
            </div>
        </div>

        <button 
            className="btn-meme" 
            onClick={() => {
                if(inputName.trim().length > 0) saveUser(inputName, inputAddr);
            }}
        >
          LET ME IN
        </button>
      </div>
    );
  }

  return (
    <div className="arcade-container">
      <h1 className="meme-text">McPEPE ARCADE</h1>
      
      <div style={{marginBottom: 30, textAlign:'center'}}>
          <h3 style={{color:'yellow', textShadow:'2px 2px black', fontFamily: '"Press Start 2P"'}}>
            WELCOME, {username}
          </h3>
          <button 
            className="btn-meme" 
            style={{fontSize: '0.8rem', padding: '10px', background: '#333', marginTop: 10}}
            onClick={clearUser}
          >
            CHANGE IDENTITY
          </button>
      </div>

      <div className="game-grid">
        <button className="btn-meme" onClick={() => onSelectGame('flappy')}>TO THE MOON</button>
        <button className="btn-meme" onClick={() => onSelectGame('frogger')}>PEPE CROSSING</button>
        <button className="btn-meme" onClick={() => onSelectGame('doodle')}>STONKS JUMP</button>
        <button className="btn-meme" onClick={() => onSelectGame('chadrun')}>CHAD RUN</button>
        <button className="btn-meme" onClick={() => onSelectGame('tendies')}>TENDIES MAN</button>
        <button className="btn-meme" onClick={() => onSelectGame('stack')}>PEPE STACK</button>
        <button className="btn-meme" onClick={() => onSelectGame('normies')}>NORMIE INVADERS</button>
        <button className="btn-meme" onClick={() => onSelectGame('fudbreaker')}>FUD BREAKER</button>
        <button className="btn-meme" onClick={() => onSelectGame('pepefall')}>PEPE FALL</button>

      </div>
      </div>
  );
};

export default ArcadeShell;