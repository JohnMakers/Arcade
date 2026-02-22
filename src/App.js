import React, { useState } from 'react';
import { UserProvider } from './context/UserContext';
import ArcadeShell from './components/ArcadeShell';
import FlappyDoge from './games/FlappyDoge';
import PepeFrogger from './games/PepeFrogger';
import StonksJump from './games/StonksJump';
import ChadRun from './games/ChadRun';
import TendiesMan from './games/TendiesMan'; 
import PepeStack from './games/PepeStack'; 
import NormieInvaders from './games/NormieInvaders';
import FudBreaker from './games/FudBreaker';
import PepeFall from './games/PepeFall';
import PepeRunner from './games/PepeRunner';
import CoinSlicer from './games/CoinSlicer'; 
import BagsGrowth from './games/BagsGrowth';
import NewsCheck from './games/NewsCheck';

function App() {
  const [activeGame, setActiveGame] = useState(null);

  const renderGame = () => {
    switch(activeGame) {
      case 'flappy': return <FlappyDoge onExit={() => setActiveGame(null)} />;
      case 'frogger': return <PepeFrogger onExit={() => setActiveGame(null)} />;
      case 'doodle': return <StonksJump onExit={() => setActiveGame(null)} />;
      case 'chadrun': return <ChadRun onExit={() => setActiveGame(null)} />;
      case 'tendies': return <TendiesMan onExit={() => setActiveGame(null)} />;
      case 'stack': return <PepeStack onExit={() => setActiveGame(null)} />; 
      case 'normies': return <NormieInvaders onExit={() => setActiveGame(null)} />;
      case 'fudbreaker': return <FudBreaker onExit={() => setActiveGame(null)} />;
      case 'pepefall': return <PepeFall onExit={() => setActiveGame(null)} />;
      case 'peperunner': return <PepeRunner onExit={() => setActiveGame(null)} />;
      case 'coinslicer': return <CoinSlicer onExit={() => setActiveGame(null)} />;
      case 'bagsgrowth': return <BagsGrowth onExit={() => setActiveGame(null)} />;
      case 'newscheck': return <NewsCheck onExit={() => setActiveGame(null)} />; 
      default: return <ArcadeShell onSelectGame={setActiveGame} />;
    }
  };

  return (
    <UserProvider>
      <div className="App">
        {renderGame()}
      </div>
    </UserProvider>
  );
}

export default App;