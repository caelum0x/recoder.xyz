'use client';

import { 
  BarChart3, TrendingUp, Users, Code, Clock, Zap, 
  CheckCircle, AlertCircle, Activity, Target, ArrowUp, ArrowDown
} from 'lucide-react';

export default function AnalyticsPage() {
  const stats = [
    {
      label: "Total Users",
      value: "127,543",
      change: "+12.5%",
      trend: "up",
      icon: Users,
      color: "from-blue-500 to-blue-600"
    },
    {
      label: "Code Generated",
      value: "2.4M",
      change: "+8.2%",
      trend: "up",
      icon: Code,
      color: "from-green-500 to-green-600"
    },
    {
      label: "Projects Created",
      value: "45,218",
      change: "+15.7%",
      trend: "up",
      icon: Target,
      color: "from-purple-500 to-purple-600"
    },
    {
      label: "Avg Response Time",
      value: "1.2s",
      change: "-5.3%",
      trend: "down",
      icon: Clock,
      color: "from-orange-500 to-orange-600"
    }
  ];

  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    users: [45000, 52000, 48000, 61000, 55000, 67000],
    projects: [12000, 14500, 13800, 16200, 15700, 18500],
    codeGeneration: [180000, 220000, 195000, 245000, 230000, 275000]
  };

  const topLanguages = [
    { name: "JavaScript", percentage: 32, requests: "890K", color: "bg-yellow-500" },
    { name: "Python", percentage: 28, requests: "780K", color: "bg-blue-500" },
    { name: "TypeScript", percentage: 18, requests: "502K", color: "bg-blue-600" },
    { name: "React", percentage: 12, requests: "335K", color: "bg-cyan-500" },
    { name: "Vue.js", percentage: 6, requests: "167K", color: "bg-green-500" },
    { name: "Other", percentage: 4, requests: "112K", color: "bg-gray-500" }
  ];

  const recentProjects = [
    {
      id: 1,
      name: "E-commerce Dashboard",
      user: "sarah.dev@example.com",
      type: "React + Node.js",
      status: "completed",
      time: "2 min ago",
      linesOfCode: 1240
    },
    {
      id: 2,
      name: "Task Management API",
      user: "alex.coder@example.com",
      type: "Python + FastAPI",
      status: "in-progress",
      time: "5 min ago",
      linesOfCode: 856
    },
    {
      id: 3,
      name: "Portfolio Website",
      user: "emma.design@example.com",
      type: "Next.js + Tailwind",
      status: "completed",
      time: "8 min ago",
      linesOfCode: 2100
    },
    {
      id: 4,
      name: "Chat Application",
      user: "mike.fullstack@example.com",
      type: "Vue.js + Socket.io",
      status: "error",
      time: "12 min ago",
      linesOfCode: 1680
    },
    {
      id: 5,
      name: "Analytics Dashboard",
      user: "lisa.data@example.com",
      type: "Python + Streamlit",
      status: "completed",
      time: "15 min ago",
      linesOfCode: 920
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'in-progress':
        return <Activity className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                Analytics Dashboard
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                Real-time insights into platform usage, performance, and user engagement
              </p>
            </div>
            
            <div className="mt-6 lg:mt-0 flex flex-col sm:flex-row gap-3">
              <select className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>Last 30 days</option>
                <option>Last 7 days</option>
                <option>Last 24 hours</option>
                <option>All time</option>
              </select>
              <button className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200">
                Export Data
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="px-4 sm:px-6 lg:px-8 mb-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    stat.trend === 'up' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                  }`}>
                    {stat.trend === 'up' ? (
                      <ArrowUp className="w-3 h-3 mr-1" />
                    ) : (
                      <ArrowDown className="w-3 h-3 mr-1" />
                    )}
                    {stat.change}
                  </div>
                </div>
                
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-12">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8">
          {/* Usage Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Platform Usage</h3>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Users</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-purple-500 rounded-full mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Projects</span>
                </div>
              </div>
            </div>
            
            <div className="h-64 flex items-end justify-between space-x-2">
              {chartData.labels.map((label, index) => (
                <div key={label} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex flex-col space-y-1 mb-2">
                    <div 
                      className="bg-blue-500 rounded-t"
                      style={{ height: `${(chartData.users[index] / 70000) * 200}px` }}
                    />
                    <div 
                      className="bg-purple-500 rounded-b"
                      style={{ height: `${(chartData.projects[index] / 20000) * 80}px` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Language Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Most Requested Languages
            </h3>
            
            <div className="space-y-4">
              {topLanguages.map((language, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-16 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {language.name}
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className={`${language.color} rounded-full h-2 transition-all duration-500`}
                        style={{ width: `${language.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {language.percentage}%
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-12">
                      {language.requests}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="px-4 sm:px-6 lg:px-8 mb-12">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Recent Projects
                </h3>
                <button className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                  View All
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Lines
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {recentProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {project.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        {project.user}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        {project.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                          {getStatusIcon(project.status)}
                          <span className="ml-1 capitalize">{project.status.replace('-', ' ')}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                        {project.linesOfCode.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {project.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Metrics */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-8">
          {/* System Health */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">System Health</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">API Uptime</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                  <span className="text-green-600 dark:text-green-400 font-medium">99.9%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Response Time</span>
                <span className="text-gray-900 dark:text-white font-medium">1.2s avg</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Success Rate</span>
                <span className="text-green-600 dark:text-green-400 font-medium">98.7%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Error Rate</span>
                <span className="text-orange-600 dark:text-orange-400 font-medium">1.3%</span>
              </div>
            </div>
          </div>

          {/* Resource Usage */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Resource Usage</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-300">CPU Usage</span>
                  <span className="text-gray-900 dark:text-white">67%</span>
                </div>
                <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div className="bg-blue-500 rounded-full h-2" style={{ width: '67%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-300">Memory</span>
                  <span className="text-gray-900 dark:text-white">54%</span>
                </div>
                <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div className="bg-green-500 rounded-full h-2" style={{ width: '54%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-300">Storage</span>
                  <span className="text-gray-900 dark:text-white">32%</span>
                </div>
                <div className="bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div className="bg-purple-500 rounded-full h-2" style={{ width: '32%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Top AI Models */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Top AI Models</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">GPT-4</span>
                <span className="text-gray-900 dark:text-white font-medium">45%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Claude 3</span>
                <span className="text-gray-900 dark:text-white font-medium">28%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Gemini Pro</span>
                <span className="text-gray-900 dark:text-white font-medium">18%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">GPT-3.5</span>
                <span className="text-gray-900 dark:text-white font-medium">9%</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
