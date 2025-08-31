'use client';

import { useState } from 'react';
import { 
  Upload, Search, Filter, Grid, List, Download, 
  Share2, Trash2, Eye, Edit3, FolderOpen, File,
  Image as ImageIcon, FileText, Music, Video,
  Archive, Star, Clock, User
} from 'lucide-react';

// Simple button component
const Button = ({ children, className = '', size = 'md', ...props }: {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  [key: string]: any;
}) => {
  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function FileSharingPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const files = [
    {
      id: '1',
      name: 'project-architecture.pdf',
      type: 'pdf',
      size: '2.4 MB',
      uploadedBy: 'Sarah Kim',
      uploadedAt: '2 hours ago',
      sharedIn: '#development',
      downloads: 23,
      isStarred: true,
      thumbnail: null
    },
    {
      id: '2',
      name: 'ui-mockups-v2.fig',
      type: 'figma',
      size: '15.8 MB',
      uploadedBy: 'Maya Patel',
      uploadedAt: '5 hours ago',
      sharedIn: '#design',
      downloads: 12,
      isStarred: false,
      thumbnail: null
    },
    {
      id: '3',
      name: 'demo-recording.mp4',
      type: 'video',
      size: '45.2 MB',
      uploadedBy: 'Alex Chen',
      uploadedAt: '1 day ago',
      sharedIn: '#general',
      downloads: 45,
      isStarred: true,
      thumbnail: '/thumbnails/demo-thumb.jpg'
    },
    {
      id: '4',
      name: 'api-documentation.md',
      type: 'markdown',
      size: '156 KB',
      uploadedBy: 'Mike Johnson',
      uploadedAt: '2 days ago',
      sharedIn: '#development',
      downloads: 67,
      isStarred: false,
      thumbnail: null
    },
    {
      id: '5',
      name: 'team-photos.zip',
      type: 'archive',
      size: '23.7 MB',
      uploadedBy: 'Emma Davis',
      uploadedAt: '3 days ago',
      sharedIn: '#general',
      downloads: 8,
      isStarred: false,
      thumbnail: null
    },
    {
      id: '6',
      name: 'brand-guidelines.png',
      type: 'image',
      size: '3.1 MB',
      uploadedBy: 'Maya Patel',
      uploadedAt: '1 week ago',
      sharedIn: '#design',
      downloads: 34,
      isStarred: true,
      thumbnail: '/thumbnails/brand-thumb.jpg'
    }
  ];

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
      case 'markdown':
        return FileText;
      case 'image':
      case 'figma':
        return ImageIcon;
      case 'video':
        return Video;
      case 'audio':
        return Music;
      case 'archive':
        return Archive;
      default:
        return File;
    }
  };

  const getFileColor = (type: string) => {
    switch (type) {
      case 'pdf': return 'text-red-600';
      case 'image': return 'text-green-600';
      case 'video': return 'text-purple-600';
      case 'audio': return 'text-orange-600';
      case 'markdown': return 'text-blue-600';
      case 'figma': return 'text-pink-600';
      case 'archive': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const recentActivity = [
    {
      user: 'Sarah Kim',
      action: 'uploaded',
      file: 'project-architecture.pdf',
      time: '2 hours ago'
    },
    {
      user: 'Alex Chen',
      action: 'downloaded',
      file: 'demo-recording.mp4',
      time: '3 hours ago'
    },
    {
      user: 'Maya Patel',
      action: 'shared',
      file: 'ui-mockups-v2.fig',
      time: '5 hours ago'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">File Sharing</h1>
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowUploadModal(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </div>

          {/* Categories */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Categories
            </h3>
            <div className="space-y-2">
              {[
                { name: 'All Files', count: files.length, icon: FolderOpen },
                { name: 'Images', count: files.filter(f => f.type === 'image').length, icon: ImageIcon },
                { name: 'Documents', count: files.filter(f => ['pdf', 'markdown'].includes(f.type)).length, icon: FileText },
                { name: 'Videos', count: files.filter(f => f.type === 'video').length, icon: Video },
                { name: 'Starred', count: files.filter(f => f.isStarred).length, icon: Star }
              ].map((category) => (
                <div key={category.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  <div className="flex items-center">
                    <category.icon className="h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" />
                    <span className="text-gray-700 dark:text-gray-300">{category.name}</span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded-full">
                    {category.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="flex-1 p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Recent Activity
            </h3>
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs">
                    {activity.user.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">{activity.user}</span> {activity.action} 
                      <span className="font-medium"> {activity.file}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    className="pl-10 pr-4 py-2 w-80 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <Button
                    size="sm"
                    className={`${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow' : 'bg-transparent'} text-gray-700 dark:text-gray-300`}
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    className={`${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow' : 'bg-transparent'} text-gray-700 dark:text-gray-300`}
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <span className="text-blue-700 dark:text-blue-300">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </span>
                <div className="flex space-x-2">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                    <Share2 className="h-4 w-4 mr-1" />
                    Share
                  </Button>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Files Grid/List */}
          <div className="flex-1 overflow-y-auto p-6">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {files.map((file) => {
                  const FileIcon = getFileIcon(file.type);
                  return (
                    <div
                      key={file.id}
                      className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-xl ${
                        selectedFiles.includes(file.id) ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => toggleFileSelection(file.id)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                          className="rounded border-gray-300 dark:border-gray-600"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {file.isStarred && <Star className="h-4 w-4 text-yellow-500 fill-current" />}
                      </div>
                      
                      <div className="text-center mb-4">
                        {file.thumbnail ? (
                          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-600 rounded-lg mx-auto mb-2 flex items-center justify-center">
                            <span className="text-xs text-gray-500">Preview</span>
                          </div>
                        ) : (
                          <FileIcon className={`h-16 w-16 mx-auto mb-2 ${getFileColor(file.type)}`} />
                        )}
                      </div>

                      <div className="text-center">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate mb-1">
                          {file.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{file.size}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          By {file.uploadedBy} • {file.uploadedAt}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {file.downloads} downloads
                        </p>
                      </div>

                      <div className="flex justify-center space-x-2 mt-4">
                        <Button size="sm" className="bg-blue-100 hover:bg-blue-200 text-blue-700">
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700">
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button size="sm" className="bg-green-100 hover:bg-green-200 text-green-700">
                          <Share2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {files.map((file) => {
                    const FileIcon = getFileIcon(file.type);
                    return (
                      <div
                        key={file.id}
                        className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                          selectedFiles.includes(file.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        onClick={() => toggleFileSelection(file.id)}
                      >
                        <div className="flex items-center space-x-4">
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file.id)}
                            onChange={() => toggleFileSelection(file.id)}
                            className="rounded border-gray-300 dark:border-gray-600"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <FileIcon className={`h-8 w-8 ${getFileColor(file.type)}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium text-gray-900 dark:text-white truncate">
                                {file.name}
                              </h3>
                              {file.isStarred && <Star className="h-4 w-4 text-yellow-500 fill-current" />}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {file.size} • Shared in {file.sharedIn} • {file.downloads} downloads
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-900 dark:text-white">{file.uploadedBy}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{file.uploadedAt}</p>
                          </div>
                          <div className="flex space-x-1">
                            <Button size="sm" className="bg-blue-100 hover:bg-blue-200 text-blue-700">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button size="sm" className="bg-green-100 hover:bg-green-200 text-green-700">
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Upload Files</h3>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Supports images, documents, videos up to 100MB
              </p>
              <input type="file" multiple className="hidden" />
              <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                Choose Files
              </Button>
            </div>
            <div className="flex space-x-3 mt-6">
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowUploadModal(false)}
              >
                Upload
              </Button>
              <Button 
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
