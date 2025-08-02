"use client";

import { useState, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  Edit3,
  Download,
  Upload,
  Search,
  Code,
  FileText,
  Image,
  Settings,
  Database,
  Palette,
  Globe,
  Package,
} from "lucide-react";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  content?: string;
  language?: string;
  children?: FileNode[];
  isExpanded?: boolean;
  parent?: string;
}

interface FileTreeProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onFileCreate: (parentId: string | null, type: "file" | "folder", name: string) => void;
  onFileDelete: (fileId: string) => void;
  onFileRename: (fileId: string, newName: string) => void;
  onFileMove: (fileId: string, newParentId: string | null) => void;
  selectedFileId?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export default function FileTree({
  files,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  onFileMove,
  selectedFileId,
  searchQuery = "",
  onSearchChange,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
  } | null>(null);

  const getFileIcon = (file: FileNode) => {
    if (file.type === "folder") {
      return expandedFolders.has(file.id) ? (
        <FolderOpen className="w-4 h-4 text-blue-500" />
      ) : (
        <Folder className="w-4 h-4 text-blue-500" />
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "ts":
      case "tsx":
        return <Code className="w-4 h-4 text-blue-600" />;
      case "js":
      case "jsx":
        return <Code className="w-4 h-4 text-yellow-600" />;
      case "html":
        return <Globe className="w-4 h-4 text-orange-600" />;
      case "css":
      case "scss":
      case "sass":
        return <Palette className="w-4 h-4 text-purple-600" />;
      case "json":
        return <Settings className="w-4 h-4 text-green-600" />;
      case "md":
      case "mdx":
        return <FileText className="w-4 h-4 text-gray-600" />;
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
        return <Image className="w-4 h-4 text-pink-600" />;
      case "sql":
        return <Database className="w-4 h-4 text-indigo-600" />;
      case "package.json":
        return <Package className="w-4 h-4 text-red-600" />;
      default:
        return <File className="w-4 h-4 text-gray-500" />;
    }
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFileClick = (file: FileNode) => {
    if (file.type === "folder") {
      toggleFolder(file.id);
    } else {
      onFileSelect(file);
    }
  };

  const startEditing = (file: FileNode) => {
    setEditingFileId(file.id);
    setEditingName(file.name);
    setContextMenu(null);
  };

  const finishEditing = () => {
    if (editingFileId && editingName.trim()) {
      onFileRename(editingFileId, editingName.trim());
    }
    setEditingFileId(null);
    setEditingName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      finishEditing();
    } else if (e.key === "Escape") {
      setEditingFileId(null);
      setEditingName("");
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      fileId,
    });
  };

  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    setDraggedFileId(fileId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedFileId && draggedFileId !== targetId) {
      onFileMove(draggedFileId, targetId);
    }
    setDraggedFileId(null);
    setDropTargetId(null);
  };

  const filterFiles = (files: FileNode[], query: string): FileNode[] => {
    if (!query.trim()) return files;

    return files.filter((file) => {
      if (file.name.toLowerCase().includes(query.toLowerCase())) {
        return true;
      }
      if (file.type === "folder" && file.children) {
        const filteredChildren = filterFiles(file.children, query);
        return filteredChildren.length > 0;
      }
      return false;
    }).map((file) => {
      if (file.type === "folder" && file.children) {
        return {
          ...file,
          children: filterFiles(file.children, query),
          isExpanded: true, // Expand folders with matches
        };
      }
      return file;
    });
  };

  const renderFileNode = (file: FileNode, depth: number = 0) => {
    const isSelected = file.id === selectedFileId;
    const isEditing = file.id === editingFileId;
    const isDragTarget = file.id === dropTargetId;
    const isExpanded = file.type === "folder" && (expandedFolders.has(file.id) || searchQuery.trim() !== "");

    return (
      <div key={file.id} className="select-none">
        <div
          className={`flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-gray-100 ${
            isSelected ? "bg-blue-100 text-blue-900" : "text-gray-700"
          } ${isDragTarget ? "bg-green-100" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileClick(file)}
          onContextMenu={(e) => handleContextMenu(e, file.id)}
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, file.id)}
          onDragOver={(e) => handleDragOver(e, file.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, file.id)}
        >
          {file.type === "folder" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(file.id);
              }}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          )}
          
          {getFileIcon(file)}
          
          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={handleKeyDown}
              className="flex-1 px-1 py-0 text-sm border border-blue-300 rounded bg-white"
              autoFocus
            />
          ) : (
            <span className="flex-1 truncate">{file.name}</span>
          )}
        </div>

        {file.type === "folder" && isExpanded && file.children && (
          <div>
            {file.children.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredFiles = filterFiles(files, searchQuery);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h3 className="font-medium text-gray-900">Files</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onFileCreate(null, "file", "untitled.tsx")}
            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
            title="New File"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => onFileCreate(null, "folder", "new-folder")}
            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
            title="New Folder"
          >
            <Folder className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      {onSearchChange && (
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-auto">
        {filteredFiles.length > 0 ? (
          filteredFiles.map((file) => renderFileNode(file))
        ) : (
          <div className="p-4 text-center text-gray-500">
            {searchQuery.trim() ? "No matching files" : "No files"}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            onClick={() => {
              const file = files.find(f => f.id === contextMenu.fileId);
              if (file) startEditing(file);
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4" />
            Rename
          </button>
          <button
            onClick={() => {
              onFileDelete(contextMenu.fileId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="border-t border-gray-200 my-1" />
          <button
            onClick={() => {
              // TODO: Implement download functionality
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      )}
    </div>
  );
}