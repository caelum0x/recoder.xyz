/**
 * Push to GitHub Button Component
 */

import { useState } from 'react';
import type { ApiResponse } from "~/types/api-responses";
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/simple-dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Checkbox } from '~/components/ui/checkbox';
import { Textarea } from '~/components/ui/textarea';

interface PushToGitHubButtonProps {
  projectId: string;
  projectName?: string;
  className?: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function PushToGitHubButton({ 
  projectId,
  projectName = 'recoder-project',
  className = '',
  variant = 'outline',
  size = 'sm',
  showText = true
}: PushToGitHubButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [repoName, setRepoName] = useState(projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  const [description, setDescription] = useState(`${projectName} - Built with recoder.xyz`);
  const [isPrivate, setIsPrivate] = useState(true);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  const handlePushToGitHub = async () => {
    if (!repoName.trim() || isPushing) return;

    setIsPushing(true);
    
    try {
      // Get GitHub token (you might need to implement OAuth flow)
      const githubToken = localStorage.getItem('github_token') || prompt('Enter your GitHub Personal Access Token:');
      
      if (!githubToken) {
        alert('GitHub token required. Please get one from https://github.com/settings/tokens');
        return;
      }

      // Call push API
      const response = await fetch(`/api/project/${projectId}/push-github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${githubToken}`
        },
        body: JSON.stringify({
          repoName: repoName.trim(),
          description: description.trim(),
          isPrivate
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Push to GitHub failed');
      }

      // Success!
      setRepoUrl(result.repoUrl);
      localStorage.setItem('github_token', githubToken); // Save for next time
      
      console.log('✅ Successfully pushed to GitHub:', result.repoUrl);
      
    } catch (error) {
      console.error('❌ GitHub push failed:', error);
      alert(`GitHub push failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleCloseModal = () => {
    setIsOpen(false);
    setRepoUrl(null);
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant={variant}
        size={size}
        className={className}
        title="Push project to GitHub repository"
      >
        <span className="i-ph:github-logo" style={{ width: iconSize, height: iconSize }} />
        {showText && <span className="ml-1.5">Push to GitHub</span>}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="i-ph:github-logo" style={{ width: 20, height: 20 }} />
              Push to GitHub
            </DialogTitle>
          </DialogHeader>

          {!repoUrl ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="repo-name">Repository Name</Label>
                <Input
                  id="repo-name"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-awesome-project"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does your project do?"
                  className="mt-1 min-h-[60px]"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="private"
                  checked={isPrivate}
                  onCheckedChange={(checked) => setIsPrivate(checked as boolean)}
                />
                <Label htmlFor="private">Make repository private</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleCloseModal} 
                  variant="outline" 
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handlePushToGitHub}
                  disabled={isPushing || !repoName.trim()}
                  className="flex-1"
                >
                  {isPushing ? (
                    <>
                      <span className="i-ph:spinner w-4 h-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <span className="i-ph:github-logo w-4 h-4 mr-2" />
                      Create & Push
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="text-green-800 dark:text-green-200 font-semibold mb-2">
                  🎉 Successfully pushed to GitHub!
                </div>
                <a 
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 underline inline-flex items-center gap-1"
                >
                  View Repository
                  <span className="i-ph:arrow-square-out w-3.5 h-3.5" />
                </a>
              </div>
              
              <Button onClick={handleCloseModal} className="w-full">
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Alternative compact version for toolbars
export function PushToGitHubIconButton({ 
  projectId, 
  projectName,
  className = '' 
}: { 
  projectId: string;
  projectName?: string;
  className?: string;
}) {
  return (
    <PushToGitHubButton 
      projectId={projectId}
      projectName={projectName}
      variant="ghost"
      size="sm"
      showText={false}
      className={className}
    />
  );
}
