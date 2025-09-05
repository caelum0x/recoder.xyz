'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  Filter, 
  MoreHorizontal,
  Settings,
  Archive,
  Star,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle,
  User,
  Code,
  Shield,
  Zap,
  Mail,
  Globe
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error' | 'security' | 'feature' | 'collaboration' | 'system'
  title: string
  message: string
  timestamp: string
  read: boolean
  starred: boolean
  archived: boolean
  actionUrl?: string
  actionText?: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  metadata?: {
    userId?: string
    projectId?: string
    deploymentId?: string
    integrationId?: string
  }
}

interface NotificationFilter {
  type?: string
  category?: string
  read?: boolean
  starred?: boolean
  priority?: string
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filter, setFilter] = useState<NotificationFilter>({})
  const [isLoading, setIsLoading] = useState(true)
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([])
  const { toast } = useToast()

  useEffect(() => {
    fetchNotifications()
  }, [filter])

  const fetchNotifications = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filter).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString())
        }
      })

      const response = await fetch(`/api/user/notifications?${params}`)
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      toast({
        title: 'Error',
        description: 'Failed to load notifications.',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const markAsRead = async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/user/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds })
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.map(notification =>
            notificationIds.includes(notification.id)
              ? { ...notification, read: true }
              : notification
          )
        )
        setSelectedNotifications([])
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to mark notifications as read.',
        variant: 'destructive'
      })
    }
  }

  const markAsUnread = async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/user/notifications/mark-unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds })
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.map(notification =>
            notificationIds.includes(notification.id)
              ? { ...notification, read: false }
              : notification
          )
        )
        setSelectedNotifications([])
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to mark notifications as unread.',
        variant: 'destructive'
      })
    }
  }

  const toggleStar = async (notificationId: string) => {
    try {
      const notification = notifications.find(n => n.id === notificationId)
      const response = await fetch(`/api/user/notifications/${notificationId}/star`, {
        method: notification?.starred ? 'DELETE' : 'POST'
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId
              ? { ...n, starred: !n.starred }
              : n
          )
        )
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update notification.',
        variant: 'destructive'
      })
    }
  }

  const archiveNotifications = async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/user/notifications/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds })
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.filter(notification => !notificationIds.includes(notification.id))
        )
        setSelectedNotifications([])
        toast({
          title: 'Archived',
          description: `${notificationIds.length} notification(s) archived.`
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to archive notifications.',
        variant: 'destructive'
      })
    }
  }

  const deleteNotifications = async (notificationIds: string[]) => {
    try {
      const response = await fetch('/api/user/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds })
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.filter(notification => !notificationIds.includes(notification.id))
        )
        setSelectedNotifications([])
        toast({
          title: 'Deleted',
          description: `${notificationIds.length} notification(s) deleted.`
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete notifications.',
        variant: 'destructive'
      })
    }
  }

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-600" />
      case 'security':
        return <Shield className="h-5 w-5 text-red-600" />
      case 'feature':
        return <Zap className="h-5 w-5 text-blue-600" />
      case 'collaboration':
        return <User className="h-5 w-5 text-purple-600" />
      case 'system':
        return <Globe className="h-5 w-5 text-gray-600" />
      default:
        return <Info className="h-5 w-5 text-blue-600" />
    }
  }

  const getPriorityColor = (priority: Notification['priority']) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const filteredNotifications = notifications.filter(notification => {
    if (filter.type && notification.type !== filter.type) return false
    if (filter.category && notification.category !== filter.category) return false
    if (filter.read !== undefined && notification.read !== filter.read) return false
    if (filter.starred !== undefined && notification.starred !== filter.starred) return false
    if (filter.priority && notification.priority !== filter.priority) return false
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Stay updated with your account activity and system updates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="px-2 py-1">
              {unreadCount} unread
            </Badge>
          )}
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={!filter.type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(prev => ({ ...prev, type: undefined }))}
            >
              All
            </Button>
            {['info', 'success', 'warning', 'error', 'security', 'feature'].map(type => (
              <Button
                key={type}
                variant={filter.type === type ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(prev => ({ ...prev, type }))}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant={filter.read === false ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(prev => ({ 
                ...prev, 
                read: prev.read === false ? undefined : false 
              }))}
            >
              Unread Only
            </Button>
            <Button
              variant={filter.starred === true ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(prev => ({ 
                ...prev, 
                starred: prev.starred === true ? undefined : true 
              }))}
            >
              <Star className="h-4 w-4 mr-1" />
              Starred
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedNotifications.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedNotifications.length} notification(s) selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => markAsRead(selectedNotifications)}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark Read
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archiveNotifications(selectedNotifications)}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteNotifications(selectedNotifications)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications List */}
      <div className="space-y-2">
        {filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                No notifications
              </h3>
              <p className="text-sm text-muted-foreground">
                You're all caught up! Check back later for new updates.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredNotifications.map((notification) => (
            <Card
              key={notification.id}
              className={`transition-colors ${
                !notification.read ? 'bg-blue-50/50 border-blue-200' : ''
              } ${
                selectedNotifications.includes(notification.id) ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedNotifications.includes(notification.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedNotifications(prev => [...prev, notification.id])
                      } else {
                        setSelectedNotifications(prev => prev.filter(id => id !== notification.id))
                      }
                    }}
                    className="mt-1"
                  />
                  
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-medium ${!notification.read ? 'font-semibold' : ''}`}>
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="h-2 w-2 bg-blue-600 rounded-full" />
                          )}
                          {notification.starred && (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDistanceToNow(new Date(notification.timestamp))} ago</span>
                          <Badge variant="outline" className={getPriorityColor(notification.priority)}>
                            {notification.priority}
                          </Badge>
                          <Badge variant="outline">
                            {notification.category}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStar(notification.id)}
                        >
                          <Star className={`h-4 w-4 ${notification.starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => notification.read ? markAsUnread([notification.id]) : markAsRead([notification.id])}
                        >
                          {notification.read ? (
                            <Mail className="h-4 w-4" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {notification.actionUrl && notification.actionText && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={notification.actionUrl}>
                          {notification.actionText}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Load More */}
      {filteredNotifications.length > 0 && (
        <div className="text-center">
          <Button variant="outline" onClick={fetchNotifications}>
            Load More
          </Button>
        </div>
      )}
    </div>
  )
}
