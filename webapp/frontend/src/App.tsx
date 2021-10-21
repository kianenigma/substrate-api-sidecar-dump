import React from 'react';
import { Main } from './components/main'


function App() {
  function now() {
    new Date();
  }
  return (
    <div className="App">
      <Main></Main>
    </div >
  );
}

export default App;
