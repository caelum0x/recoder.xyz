"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import MonacoCodeEditor from "./MonacoCodeEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Smartphone, 
  Tablet, 
  Code, 
  Settings, 
  Keyboard, 
  Hand,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  MoreHorizontal,
  Play,
  Save,
  Undo,
  Redo,
  Copy,
  ClipboardPaste,
  Search,
  Menu
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

interface MobileCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  className?: string;
  readOnly?: boolean;
  projectId?: string;
  user?: { id: string; name: string };
  filePath?: string;
  onSave?: () => void;
  onPreview?: () => void;
}

export default function MobileCodeEditor({
  value,
  onChange,
  language,
  className = "",
  readOnly = false,
  projectId,
  user,
  filePath,
  onSave,
  onPreview
}: MobileCodeEditorProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [touchDevice, setTouchDevice] = useState(false);
  const [activeTab, setActiveTab] = useState('code');
  const [fontSize, setFontSize] = useState(14);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showMinimap, setShowMinimap] = useState(false);
  const [zoom, setZoom] = useState(100);
  
  const editorRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
      setOrientation(height > width ? 'portrait' : 'landscape');
      setTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
      
      // Auto-adjust settings for mobile
      if (width < 768) {
        setFontSize(16); // Larger font for mobile
        setShowMinimap(false);
        setShowLineNumbers(orientation === 'landscape');
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, [orientation]);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Mobile-specific editor configuration
    if (isMobile || isTablet) {
      editor.updateOptions({
        fontSize: fontSize,
        lineNumbers: showLineNumbers ? 'on' : 'off',
        minimap: { enabled: showMinimap },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        wordWrap: 'on',
        wrappingIndent: 'indent',
        folding: true,
        lineDecorationsWidth: isMobile ? 5 : 10,
        lineNumbersMinChars: isMobile ? 2 : 3,
        glyphMargin: !isMobile,
        // Touch-friendly settings
        mouseWheelZoom: true,
        contextmenu: false, // Disable context menu for better touch experience
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false
        },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'on',
        tabCompletion: 'on',
      });

      // Add mobile-specific key bindings
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        // Trigger save action
        console.log('Save triggered via keyboard');
      });
    }
  }, [fontSize, showLineNumbers, showMinimap, isMobile, isTablet]);

  const quickActions = [
    { icon: Save, label: 'Save', action: () => console.log('Save') },
    { icon: Play, label: 'Run', action: () => console.log('Run') },
    { icon: Undo, label: 'Undo', action: () => editorRef.current?.trigger('keyboard', 'undo', null) },
    { icon: Redo, label: 'Redo', action: () => editorRef.current?.trigger('keyboard', 'redo', null) },
    { icon: Copy, label: 'Copy', action: () => editorRef.current?.trigger('keyboard', 'editor.action.clipboardCopyAction', null) },
    { icon: Search, label: 'Find', action: () => editorRef.current?.trigger('keyboard', 'actions.find', null) },
  ];

  // Mobile virtual keyboard component
  const VirtualKeyboard = () => {
    const specialKeys = [
      '(', ')', '{', '}', '[', ']', '<', '>',
      ';', ':', '"', "'", '`', ',', '.',
      '/', '\\', '|', '&', '*', '+', '-', '=',
      '$', '#', '@', '%', '^', '!', '?'
    ];

    const insertText = (text: string) => {
      if (editorRef.current && editorRef.current.getPosition) {
        const position = editorRef.current.getPosition();
        const model = editorRef.current.getModel();
        if (model && position) {
          editorRef.current.executeEdits('virtual-keyboard', [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              },
              text: text,
              forceMoveMarkers: true,
            },
          ]);
          editorRef.current.focus();
        }
      }
    };

    return (
      <Card className="mt-2">
        <CardContent className="p-3">
          <div className="grid grid-cols-8 gap-1">
            {specialKeys.map((key) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 text-xs"
                onClick={() => insertText(key)}
              >
                {key}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Touch-friendly toolbar
  const MobileToolbar = () => (
    <div className="flex items-center justify-between p-2 bg-muted/50 border-b">
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className="flex items-center space-x-1">
          {isMobile ? <Smartphone className="h-3 w-3" /> : <Tablet className="h-3 w-3" />}
          <span className="text-xs">{orientation}</span>
        </Badge>
        <Badge variant="outline">
          <span className="text-xs">{language}</span>
        </Badge>
      </div>
      
      <div className="flex items-center space-x-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFontSize(Math.max(12, fontSize - 2))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs px-2">{fontSize}px</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFontSize(Math.min(24, fontSize + 2))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowLineNumbers(!showLineNumbers)}>
              {showLineNumbers ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              Line Numbers
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowMinimap(!showMinimap)}>
              {showMinimap ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              Minimap
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowKeyboard(!showKeyboard)}>
              <Keyboard className="h-4 w-4 mr-2" />
              Virtual Keyboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  // Quick action buttons
  const QuickActions = () => (
    <div className="flex items-center justify-between p-2 bg-muted/30 border-t">
      <div className="flex items-center space-x-1 overflow-x-auto">
        {quickActions.map((action, index) => (
          <Button
            key={index}
            variant="ghost"
            size="sm"
            className="flex-shrink-0 h-8 px-2"
            onClick={action.action}
          >
            <action.icon className="h-4 w-4 mr-1" />
            <span className="text-xs">{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );

  if (!isMobile && !isTablet && !touchDevice) {
    // Return regular Monaco editor for desktop
    return (
      <div className={className}>
        <MonacoCodeEditor
          value={value}
          onChange={onChange}
          language={language}
          theme="vs-dark"
          enableAISuggestions={true}
          enableCollaboration={!!projectId}
          projectId={projectId}
          user={user}
          readOnly={readOnly}
        />
      </div>
    );
  }

  return (
    <div className={`mobile-code-editor ${className}`}>
      <MobileToolbar />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="code" className="flex items-center space-x-2">
            <Code className="h-4 w-4" />
            <span>Code</span>
          </TabsTrigger>
          <TabsTrigger value="simple" className="flex items-center space-x-2">
            <Hand className="h-4 w-4" />
            <span>Simple</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="code" className="mt-0">
          <div style={{ height: isMobile ? '60vh' : '70vh' }}>
            <MonacoCodeEditor
              value={value}
              onChange={onChange}
              language={language}
              theme="vs-dark"
              enableAISuggestions={true}
              enableCollaboration={!!projectId}
              projectId={projectId}
              user={user}
              readOnly={readOnly}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="simple" className="mt-0">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[60vh] font-mono text-sm"
            placeholder="Enter your code here..."
            style={{ fontSize: fontSize }}
            readOnly={readOnly}
          />
        </TabsContent>
      </Tabs>
      
      {showKeyboard && <VirtualKeyboard />}
      <QuickActions />
    </div>
  );
}
