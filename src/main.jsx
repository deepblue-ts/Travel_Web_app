import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  createHashRouter,
  RouterProvider,
} from 'react-router-dom'
import App from './App'
import { PlanProvider } from './contexts/PlanContext'
import './index.css'

// App 側で <Routes> を使っている前提で、/* にぶら下げます
const router = createHashRouter([
  { path: '/*', element: <App /> },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlanProvider>
      <RouterProvider
        router={router}
        // React Router v7 の互換フラグ（警告を解消）
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      />
    </PlanProvider>
  </React.StrictMode>
)
