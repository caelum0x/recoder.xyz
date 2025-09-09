// Offline Page - Professional PWA offline experience
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  WifiOff, 
  RefreshCw, 
  Code, 
  MessageSquare, 
  FileText, 
  Zap,
  Clock,
  Shield,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Main Offline Card */}
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
              <WifiOff className="h-8 w-8 text-orange-600" />
            </div>
            <CardTitle className="text-2xl text-orange-900">
              You're offline
            </CardTitle>
            <CardDescription className="text-orange-700">
              No internet connection, but you can still be productive with cached features
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Offline Features */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Code className="h-5 w-5 text-green-600" />
                    <h3 className="font-medium text-green-900">Code Playground</h3>
                  </div>
                  <p className="text-sm text-green-700 mb-3">
                    Write and test code locally with cached languages
                  </p>
                  <Link href="/code-playground">
                    <Button size="sm" className="w-full">
                      Open Playground
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <h3 className="font-medium text-blue-900">Cached Projects</h3>
                  </div>
                  <p className="text-sm text-blue-700 mb-3">
                    Access your recently viewed projects and files
                  </p>
                  <Link href="/projects">
                    <Button size="sm" variant="outline" className="w-full">
                      View Projects
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <MessageSquare className="h-5 w-5 text-purple-600" />
                    <h3 className="font-medium text-purple-900">Offline Chat</h3>
                  </div>
                  <p className="text-sm text-purple-700 mb-3">
                    Review your conversation history and prepare messages
                  </p>
                  <Link href="/chats">
                    <Button size="sm" variant="outline" className="w-full">
                      View Chats
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="h-5 w-5 text-slate-600" />
                    <h3 className="font-medium text-slate-900">Recent Work</h3>
                  </div>
                  <p className="text-sm text-slate-700 mb-3">
                    Continue where you left off with cached content
                  </p>
                  <Link href="/dashboard">
                    <Button size="sm" variant="outline" className="w-full">
                      Open Dashboard
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            {/* Offline Stats */}
            <div className="bg-white rounded-lg p-4 border">
              <h3 className="font-medium mb-3">Offline Capabilities</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">8</div>
                  <div className="text-xs text-muted-foreground">Features available</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">15MB</div>
                  <div className="text-xs text-muted-foreground">Data cached</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">3</div>
                  <div className="text-xs text-muted-foreground">Languages ready</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">24h</div>
                  <div className="text-xs text-muted-foreground">Cache valid</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                onClick={() => window.location.reload()} 
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">
                  Go Home
                </Link>
              </Button>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">💡 Offline Tips</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Your work is automatically saved locally</li>
                <li>• Code execution uses cached JavaScript engine</li>
                <li>• Changes will sync when you're back online</li>
                <li>• All data is stored securely on your device</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* PWA Benefits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Why install the Recoder.xyz app?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Zap className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <div className="font-medium">90% Faster</div>
                  <div className="text-sm text-muted-foreground">Instant loading</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <Shield className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="font-medium">Always Available</div>
                  <div className="text-sm text-muted-foreground">Works offline</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <div className="font-medium">Native Feel</div>
                  <div className="text-sm text-muted-foreground">App-like experience</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Metadata for the offline page
export const metadata = {
  title: 'Offline - Recoder.xyz',
  description: 'You are currently offline, but many features are still available',
  robots: 'noindex'
};