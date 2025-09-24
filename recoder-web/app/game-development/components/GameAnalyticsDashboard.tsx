'use client'

import { useState, useEffect } from 'react'
import { Tab } from '@headlessui/react'
import {
  ChartBarIcon,
  ClockIcon,
  UsersIcon,
  CursorArrowRaysIcon,
  DocumentChartBarIcon,
  CogIcon,
  ExclamationTriangleIcon,
  TrophyIcon,
  BoltIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

interface AnalyticsData {
  activeSessions: number
  dailyEvents: number
  weeklyRetention: number
  topEvents: Array<{ name: string; count: number }>
  lastUpdated: string
}

interface PlayerMetrics {
  totalSessions: number
  totalPlaytime: number
  avgSessionDuration: number
  retentionRate: number
  churnRisk: number
  lastActive: string
  favoriteGameModes: string[]
  skillProgression: Record<string, number>
}

interface AnalyticsReport {
  id: string
  reportType: string
  generatedAt: string
  data: any
  summary: string
  insights: string[]
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default function GameAnalyticsDashboard() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [playerMetrics, setPlayerMetrics] = useState<PlayerMetrics | null>(null)
  const [reports, setReports] = useState<AnalyticsReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('project_1')
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  useEffect(() => {
    fetchAnalyticsData()
    const interval = setInterval(fetchAnalyticsData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [selectedProject])

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      
      const response = await fetch(`/api/game-analytics/dashboard/${selectedProject}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const result = await response.json()
        setAnalyticsData(result.data)
      } else {
        throw new Error('Failed to fetch analytics data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const generateReport = async (reportType: string) => {
    try {
      setIsGeneratingReport(true)
      const token = localStorage.getItem('auth_token')
      
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - 30) // Last 30 days

      const response = await fetch('/api/game-analytics/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: selectedProject,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          reportType
        })
      })

      if (response.ok) {
        const result = await response.json()
        setReports([result.report, ...reports])
      } else {
        throw new Error('Failed to generate report')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const generateSampleData = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      
      const response = await fetch('/api/game-analytics/test/generate-sample-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: selectedProject,
          eventCount: 1000
        })
      })

      if (response.ok) {
        await fetchAnalyticsData()
      } else {
        throw new Error('Failed to generate sample data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate sample data')
    }
  }

  // Mock data for charts
  const sessionTrendData = [
    { date: '2024-01-01', sessions: 120 },
    { date: '2024-01-02', sessions: 150 },
    { date: '2024-01-03', sessions: 135 },
    { date: '2024-01-04', sessions: 180 },
    { date: '2024-01-05', sessions: 200 },
    { date: '2024-01-06', sessions: 175 },
    { date: '2024-01-07', sessions: 220 }
  ]

  const performanceData = [
    { metric: 'Avg FPS', value: 58, target: 60, status: 'warning' },
    { metric: 'Load Time', value: 2.1, target: 2.0, status: 'warning' },
    { metric: 'Crash Rate', value: 0.5, target: 1.0, status: 'good' },
    { metric: 'Memory Usage', value: 512, target: 1024, status: 'good' }
  ]

  const revenueData = [
    { category: 'In-App Purchases', value: 15420, color: '#10B981' },
    { category: 'Premium Upgrades', value: 8750, color: '#3B82F6' },
    { category: 'Cosmetics', value: 12300, color: '#F59E0B' },
    { category: 'Battle Pass', value: 6890, color: '#EF4444' }
  ]

  const tabs = [
    {
      name: 'Overview',
      icon: ChartBarIcon,
      content: (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UsersIcon className="h-8 w-8 text-blue-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Sessions</dt>
                    <dd className="text-lg font-medium text-gray-900">{analyticsData?.activeSessions || 0}</dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CursorArrowRaysIcon className="h-8 w-8 text-green-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Daily Events</dt>
                    <dd className="text-lg font-medium text-gray-900">{analyticsData?.dailyEvents || 0}</dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrophyIcon className="h-8 w-8 text-purple-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Retention Rate</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {analyticsData?.weeklyRetention ? `${(analyticsData.weeklyRetention * 100).toFixed(1)}%` : '0%'}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-8 w-8 text-orange-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Last Updated</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {analyticsData?.lastUpdated ? new Date(analyticsData.lastUpdated).toLocaleTimeString() : 'Never'}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Session Trend Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Session Trend (Last 7 Days)</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="sessions" stroke="#3B82F6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Events */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Events (Last 24 Hours)</h3>
            <div className="space-y-3">
              {analyticsData?.topEvents?.slice(0, 5).map((event, index) => (
                <div key={event.name} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-3 ${
                      index === 0 ? 'bg-green-500' : index === 1 ? 'bg-blue-500' : 'bg-gray-400'
                    }`}></div>
                    <span className="text-sm text-gray-900">{event.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">{event.count?.toLocaleString() || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Performance',
      icon: BoltIcon,
      content: (
        <div className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {performanceData.map((metric) => (
              <div key={metric.metric} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{metric.metric}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {metric.metric.includes('Rate') ? `${metric.value}%` : 
                       metric.metric.includes('Time') ? `${metric.value}s` :
                       metric.metric.includes('Memory') ? `${metric.value}MB` : metric.value}
                    </p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${
                    metric.status === 'good' ? 'bg-green-500' : 
                    metric.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></div>
                </div>
                <div className="mt-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <span>Target: {metric.target}{metric.metric.includes('Rate') ? '%' : 
                                     metric.metric.includes('Time') ? 's' :
                                     metric.metric.includes('Memory') ? 'MB' : ''}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Performance Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="metric" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Revenue',
      icon: CurrencyDollarIcon,
      content: (
        <div className="space-y-6">
          {/* Revenue Overview */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CurrencyDollarIcon className="h-8 w-8 text-green-500" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${revenueData.reduce((sum, item) => sum + item.value, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UsersIcon className="h-8 w-8 text-blue-500" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">ARPU</p>
                  <p className="text-2xl font-bold text-gray-900">$12.45</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrophyIcon className="h-8 w-8 text-purple-500" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Conversion Rate</p>
                  <p className="text-2xl font-bold text-gray-900">3.2%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue Breakdown</h3>
            <div className="flex flex-col lg:flex-row">
              <div className="lg:w-1/2">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={revenueData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ category, value }: any) => `${category}: $${value?.toLocaleString() || '0'}`}
                    >
                      {revenueData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="lg:w-1/2 lg:pl-6">
                <div className="space-y-4">
                  {revenueData.map((item, index) => (
                    <div key={item.category} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded-full mr-3" 
                          style={{ backgroundColor: item.color }}
                        ></div>
                        <span className="text-sm text-gray-900">{item.category}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">${item.value.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          {((item.value / revenueData.reduce((sum, i) => sum + i.value, 0)) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Reports',
      icon: DocumentChartBarIcon,
      content: (
        <div className="space-y-6">
          {/* Report Generation */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Generate Report</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {['overview', 'retention', 'performance', 'monetization'].map((reportType) => (
                <button
                  key={reportType}
                  onClick={() => generateReport(reportType)}
                  disabled={isGeneratingReport}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed capitalize"
                >
                  {reportType}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Reports */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Reports</h3>
            {reports.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No reports generated yet. Click the buttons above to generate your first report.</p>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 capitalize">{report.reportType} Report</h4>
                        <p className="text-sm text-gray-500">{new Date(report.generatedAt).toLocaleString()}</p>
                      </div>
                      <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                        View Report
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">{report.summary}</p>
                    {report.insights && report.insights.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-900">Key Insights:</p>
                        <ul className="text-xs text-gray-600 list-disc list-inside">
                          {report.insights.slice(0, 2).map((insight, index) => (
                            <li key={index}>{insight}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      name: 'Settings',
      icon: CogIcon,
      content: (
        <div className="space-y-6">
          {/* Project Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Analytics Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                >
                  <option value="project_1">Project 1</option>
                  <option value="project_2">Project 2</option>
                  <option value="project_3">Project 3</option>
                </select>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Development Tools</h4>
                <button
                  onClick={generateSampleData}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Generate Sample Data
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  Generate 1000 sample analytics events for testing (development only)
                </p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Analytics Service</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm text-green-600">Healthy</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Real-time Processing</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm text-green-600">Active</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Data Retention</span>
                <span className="text-sm text-gray-600">90 days</span>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Analytics Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <div className="-mx-2 -my-1.5 flex">
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    fetchAnalyticsData()
                  }}
                  className="bg-red-50 px-2 py-1.5 rounded-md text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Game Analytics</h2>
            <p className="text-gray-600">Real-time insights into player behavior and game performance</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Last updated: {analyticsData?.lastUpdated ? new Date(analyticsData.lastUpdated).toLocaleTimeString() : 'Never'}
            </div>
            <button
              onClick={fetchAnalyticsData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
                {tab.content}
              </Tab.Panel>
            ))}
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  )
}