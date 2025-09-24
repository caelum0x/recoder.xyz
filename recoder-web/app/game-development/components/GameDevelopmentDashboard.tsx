'use client'

import { useState, useEffect } from 'react'
import { Tab } from '@headlessui/react'
import { 
  CubeIcon, 
  PlayIcon, 
  CogIcon, 
  DocumentTextIcon,
  FolderIcon,
  CloudArrowUpIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import UnityProjectManager from './UnityProjectManager'
import UnrealProjectManager from './UnrealProjectManager'
import GameAssetManager from './GameAssetManager'
import GameBuildManager from './GameBuildManager'
import VisualScriptManager from './VisualScriptManager'
import GameAnalyticsDashboard from './GameAnalyticsDashboard'
import MatchmakingDashboard from './MatchmakingDashboard'

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default function GameDevelopmentDashboard() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeBuilds: 0,
    totalAssets: 0,
    totalScripts: 0
  })

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('/api/game-development/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    }
  }

  const tabs = [
    {
      name: 'Unity Projects',
      icon: CubeIcon,
      component: <UnityProjectManager onStatsChange={fetchDashboardStats} />
    },
    {
      name: 'Unreal Projects',
      icon: PlayIcon,
      component: <UnrealProjectManager onStatsChange={fetchDashboardStats} />
    },
    {
      name: 'Assets',
      icon: FolderIcon,
      component: <GameAssetManager onStatsChange={fetchDashboardStats} />
    },
    {
      name: 'Builds',
      icon: CloudArrowUpIcon,
      component: <GameBuildManager onStatsChange={fetchDashboardStats} />
    },
    {
      name: 'Visual Scripts',
      icon: WrenchScrewdriverIcon,
      component: <VisualScriptManager onStatsChange={fetchDashboardStats} />
    },
    {
      name: 'Multiplayer',
      icon: UserGroupIcon,
      component: <MatchmakingDashboard onStatsChange={fetchDashboardStats} />
    },
    {
      name: 'Analytics',
      icon: DocumentTextIcon,
      component: <GameAnalyticsDashboard />
    }
  ]

  const statCards = [
    {
      name: 'Total Projects',
      value: stats.totalProjects,
      icon: CubeIcon,
      color: 'bg-blue-500'
    },
    {
      name: 'Active Builds',
      value: stats.activeBuilds,
      icon: CloudArrowUpIcon,
      color: 'bg-green-500'
    },
    {
      name: 'Total Assets',
      value: stats.totalAssets,
      icon: FolderIcon,
      color: 'bg-purple-500'
    },
    {
      name: 'Scripts Generated',
      value: stats.totalScripts,
      icon: DocumentTextIcon,
      color: 'bg-orange-500'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`inline-flex items-center justify-center rounded-md ${stat.color} p-3`}>
                  <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="truncate text-sm font-medium text-gray-500">{stat.name}</dt>
                  <dd className="text-lg font-medium text-gray-900">{stat.value}</dd>
                </dl>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Tabs */}
      <div className="bg-white shadow rounded-lg">
        <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex}>
          <Tab.List className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab, index) => (
                <Tab
                  key={tab.name}
                  className={({ selected }) =>
                    classNames(
                      selected
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                      'group inline-flex items-center border-b-2 px-1 py-4 text-sm font-medium focus:outline-none'
                    )
                  }
                >
                  <tab.icon
                    className={classNames(
                      selectedIndex === index
                        ? 'text-blue-500'
                        : 'text-gray-400 group-hover:text-gray-500',
                      '-ml-0.5 mr-2 h-5 w-5'
                    )}
                    aria-hidden="true"
                  />
                  {tab.name}
                </Tab>
              ))}
            </nav>
          </Tab.List>
          <Tab.Panels>
            {tabs.map((tab, index) => (
              <Tab.Panel key={index} className="p-6">
                {tab.component}
              </Tab.Panel>
            ))}
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  )
}