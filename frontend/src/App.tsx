import { Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { CommandCenter } from './pages/CommandCenter'
import { DemoLab } from './pages/DemoLab'
import { IncidentInvestigation } from './pages/IncidentInvestigation'
import { Incidents } from './pages/Incidents'
import { KnowledgeBase } from './pages/KnowledgeBase'
import { SystemMap } from './pages/SystemMap'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CommandCenter />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="incidents/:id" element={<IncidentInvestigation />} />
        <Route path="map" element={<SystemMap />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="lab" element={<DemoLab />} />
      </Route>
    </Routes>
  )
}
