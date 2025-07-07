import { useEffect } from 'react';
import Chat from './components/Chat';
import './App.css';

function App() {
  useEffect(() => {
    // Ensure the socket connects only when the App mounts
    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <div className="App">
      <Chat />
    </div>
  );
}

export default App;