import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import DossierDetail from './pages/DossierDetail';
import Terminal from './pages/Terminal';
import Nouveau from './pages/Nouveau';
import Ameliorations from './pages/Ameliorations';
import Memory from './pages/Memory';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/dossier/:id" element={<DossierDetail />} />
          <Route path="/terminal" element={<Terminal />} />
          <Route path="/nouveau" element={<Nouveau />} />
          <Route path="/ameliorations" element={<Ameliorations />} />
          <Route path="/memory" element={<Memory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
