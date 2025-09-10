// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'   // ★ 追加
import App from './App'
import { PlanProvider } from './contexts/PlanContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>                 {/* ★ Pages でのリロード/直リンクでも白画面にならない */}
      <PlanProvider>
        <App />
      </PlanProvider>
    </HashRouter>
  </React.StrictMode>
)
