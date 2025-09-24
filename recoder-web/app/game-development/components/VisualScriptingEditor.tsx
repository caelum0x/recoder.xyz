'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Dialog } from '@headlessui/react'
import { XMarkIcon, PlayIcon, PlusIcon, TrashIcon, BookmarkIcon } from '@heroicons/react/24/outline'

interface Node {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    inputs: Array<{ id: string; label: string; type: string; value?: any }>
    outputs: Array<{ id: string; label: string; type: string }>
    config?: any
  }
}

interface Connection {
  id: string
  source: string
  sourceOutput: string
  target: string
  targetInput: string
}

interface VisualScript {
  id: string
  name: string
  description: string
  nodes: Node[]
  connections: Connection[]
  variables: Array<{ id: string; name: string; type: string; defaultValue: any }>
}

interface VisualScriptingEditorProps {
  projectId: string
  onClose: () => void
  onSave: (script: VisualScript) => void
  initialScript?: VisualScript
}

const NODE_TYPES = {
  EVENT: {
    'Start': {
      inputs: [],
      outputs: [{ id: 'exec', label: 'Exec', type: 'execution' }],
      color: 'bg-green-500'
    },
    'Update': {
      inputs: [],
      outputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'deltaTime', label: 'Delta Time', type: 'float' }
      ],
      color: 'bg-green-500'
    },
    'OnCollision': {
      inputs: [],
      outputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'other', label: 'Other', type: 'object' }
      ],
      color: 'bg-green-500'
    },
    'OnKeyPress': {
      inputs: [{ id: 'key', label: 'Key', type: 'string' }],
      outputs: [{ id: 'exec', label: 'Exec', type: 'execution' }],
      color: 'bg-green-500'
    }
  },
  ACTION: {
    'Print': {
      inputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'text', label: 'Text', type: 'string' }
      ],
      outputs: [{ id: 'exec', label: 'Exec', type: 'execution' }],
      color: 'bg-blue-500'
    },
    'Destroy': {
      inputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'target', label: 'Target', type: 'object' }
      ],
      outputs: [{ id: 'exec', label: 'Exec', type: 'execution' }],
      color: 'bg-red-500'
    },
    'SetVariable': {
      inputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'variable', label: 'Variable', type: 'string' },
        { id: 'value', label: 'Value', type: 'any' }
      ],
      outputs: [{ id: 'exec', label: 'Exec', type: 'execution' }],
      color: 'bg-purple-500'
    },
    'PlaySound': {
      inputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'sound', label: 'Sound', type: 'audio' },
        { id: 'volume', label: 'Volume', type: 'float' }
      ],
      outputs: [{ id: 'exec', label: 'Exec', type: 'execution' }],
      color: 'bg-orange-500'
    }
  },
  LOGIC: {
    'Branch': {
      inputs: [
        { id: 'exec', label: 'Exec', type: 'execution' },
        { id: 'condition', label: 'Condition', type: 'boolean' }
      ],
      outputs: [
        { id: 'true', label: 'True', type: 'execution' },
        { id: 'false', label: 'False', type: 'execution' }
      ],
      color: 'bg-yellow-500'
    },
    'Compare': {
      inputs: [
        { id: 'a', label: 'A', type: 'any' },
        { id: 'b', label: 'B', type: 'any' },
        { id: 'operation', label: 'Operation', type: 'string' }
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
      color: 'bg-yellow-500'
    },
    'AND': {
      inputs: [
        { id: 'a', label: 'A', type: 'boolean' },
        { id: 'b', label: 'B', type: 'boolean' }
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
      color: 'bg-yellow-500'
    },
    'OR': {
      inputs: [
        { id: 'a', label: 'A', type: 'boolean' },
        { id: 'b', label: 'B', type: 'boolean' }
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
      color: 'bg-yellow-500'
    }
  },
  MATH: {
    'Add': {
      inputs: [
        { id: 'a', label: 'A', type: 'float' },
        { id: 'b', label: 'B', type: 'float' }
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'float' }],
      color: 'bg-indigo-500'
    },
    'Multiply': {
      inputs: [
        { id: 'a', label: 'A', type: 'float' },
        { id: 'b', label: 'B', type: 'float' }
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'float' }],
      color: 'bg-indigo-500'
    },
    'Random': {
      inputs: [
        { id: 'min', label: 'Min', type: 'float' },
        { id: 'max', label: 'Max', type: 'float' }
      ],
      outputs: [{ id: 'result', label: 'Result', type: 'float' }],
      color: 'bg-indigo-500'
    }
  },
  VARIABLE: {
    'GetVariable': {
      inputs: [{ id: 'name', label: 'Name', type: 'string' }],
      outputs: [{ id: 'value', label: 'Value', type: 'any' }],
      color: 'bg-purple-500'
    }
  }
}

export default function VisualScriptingEditor({ 
  projectId, 
  onClose, 
  onSave, 
  initialScript 
}: VisualScriptingEditorProps) {
  const [script, setScript] = useState<VisualScript>(
    initialScript || {
      id: '',
      name: '',
      description: '',
      nodes: [],
      connections: [],
      variables: []
    }
  )
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [draggedNode, setDraggedNode] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState<{
    nodeId: string
    outputId: string
    type: string
  } | null>(null)
  const [showNodePalette, setShowNodePalette] = useState(false)
  const [palettePosition, setPalettePosition] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  const generateId = () => Math.random().toString(36).substr(2, 9)

  const addNode = useCallback((type: string, category: string, position: { x: number; y: number }) => {
    const nodeType = (NODE_TYPES[category as keyof typeof NODE_TYPES] as Record<string, any>)[type]
    if (!nodeType) return

    const newNode: Node = {
      id: generateId(),
      type: `${category}.${type}`,
      position,
      data: {
        label: type,
        inputs: nodeType.inputs.map((input: any) => ({ 
          ...input, 
          id: generateId() 
        })),
        outputs: nodeType.outputs.map((output: any) => ({ 
          ...output, 
          id: generateId() 
        })),
        config: {}
      }
    }

    setScript(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }))
    setShowNodePalette(false)
  }, [])

  const deleteNode = useCallback((nodeId: string) => {
    setScript(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      connections: prev.connections.filter(c => c.source !== nodeId && c.target !== nodeId)
    }))
    setSelectedNode(null)
  }, [])

  const updateNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setScript(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === nodeId ? { ...node, position } : node
      )
    }))
  }, [])

  const createConnection = useCallback((
    sourceId: string, 
    sourceOutputId: string, 
    targetId: string, 
    targetInputId: string
  ) => {
    const connection: Connection = {
      id: generateId(),
      source: sourceId,
      sourceOutput: sourceOutputId,
      target: targetId,
      targetInput: targetInputId
    }

    setScript(prev => ({
      ...prev,
      connections: [...prev.connections, connection]
    }))
  }, [])

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0) return
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const node = script.nodes.find(n => n.id === nodeId)
    if (!node) return

    setDraggedNode(nodeId)
    setDragOffset({
      x: e.clientX - rect.left - node.position.x,
      y: e.clientY - rect.top - node.position.y
    })
    setSelectedNode(nodeId)
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNode || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const newPosition = {
      x: e.clientX - rect.left - dragOffset.x,
      y: e.clientY - rect.top - dragOffset.y
    }

    updateNodePosition(draggedNode, newPosition)
  }

  const handleMouseUp = () => {
    setDraggedNode(null)
  }

  const handleCanvasRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    setPalettePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setShowNodePalette(true)
  }

  const handleOutputClick = (nodeId: string, outputId: string, outputType: string) => {
    if (isConnecting) {
      // Complete connection
      const targetNode = script.nodes.find(n => n.id === nodeId)
      const compatibleInput = targetNode?.data.inputs.find(input => 
        input.type === outputType || input.type === 'any' || outputType === 'any'
      )
      
      if (compatibleInput && nodeId !== isConnecting.nodeId) {
        createConnection(
          isConnecting.nodeId,
          isConnecting.outputId,
          nodeId,
          compatibleInput.id
        )
      }
      setIsConnecting(null)
    } else {
      // Start connection
      setIsConnecting({
        nodeId,
        outputId,
        type: outputType
      })
    }
  }

  const handleSave = async () => {
    if (!script.name.trim()) {
      alert('Please enter a script name')
      return
    }

    try {
      const response = await fetch('/api/game-development/visual-scripts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          projectId,
          script
        })
      })

      if (response.ok) {
        const data = await response.json()
        onSave(data.data.script)
        onClose()
      } else {
        throw new Error('Failed to save visual script')
      }
    } catch (error) {
      console.error('Failed to save visual script:', error)
      alert('Failed to save visual script')
    }
  }

  const getNodeTypeInfo = (nodeType: string) => {
    const [category, type] = nodeType.split('.')
    return (NODE_TYPES[category as keyof typeof NODE_TYPES] as Record<string, any>)?.[type] || null
  }

  const renderNode = (node: Node) => {
    const typeInfo = getNodeTypeInfo(node.type)
    if (!typeInfo) return null

    return (
      <div
        key={node.id}
        className={`absolute border-2 rounded-lg shadow-lg min-w-32 ${
          selectedNode === node.id 
            ? 'border-blue-400 shadow-blue-200' 
            : 'border-gray-300 hover:border-gray-400'
        } bg-white cursor-move`}
        style={{
          left: node.position.x,
          top: node.position.y,
          zIndex: selectedNode === node.id ? 10 : 1
        }}
        onMouseDown={(e) => handleMouseDown(e, node.id)}
      >
        {/* Node Header */}
        <div className={`px-3 py-2 rounded-t-lg text-white text-sm font-medium ${typeInfo.color}`}>
          <div className="flex justify-between items-center">
            <span>{node.data.label}</span>
            {selectedNode === node.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteNode(node.id)
                }}
                className="ml-2 text-white hover:text-red-200"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Node Body */}
        <div className="p-2">
          {/* Inputs */}
          {node.data.inputs.map((input, index) => (
            <div key={input.id} className="flex items-center mb-1">
              <div 
                className="w-3 h-3 border-2 border-gray-400 bg-white rounded-full cursor-pointer hover:bg-gray-100"
                onClick={() => handleOutputClick(node.id, input.id, input.type)}
              />
              <span className="ml-2 text-xs text-gray-600">{input.label}</span>
            </div>
          ))}

          {/* Outputs */}
          {node.data.outputs.map((output, index) => (
            <div key={output.id} className="flex items-center justify-end mb-1">
              <span className="mr-2 text-xs text-gray-600">{output.label}</span>
              <div 
                className="w-3 h-3 border-2 border-gray-400 bg-white rounded-full cursor-pointer hover:bg-gray-100"
                onClick={() => handleOutputClick(node.id, output.id, output.type)}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderConnections = () => {
    return script.connections.map(connection => {
      const sourceNode = script.nodes.find(n => n.id === connection.source)
      const targetNode = script.nodes.find(n => n.id === connection.target)
      
      if (!sourceNode || !targetNode) return null

      // Calculate connection line positions (simplified)
      const startX = sourceNode.position.x + 120
      const startY = sourceNode.position.y + 30
      const endX = targetNode.position.x
      const endY = targetNode.position.y + 30

      return (
        <svg
          key={connection.id}
          className="absolute pointer-events-none"
          style={{ 
            left: 0, 
            top: 0, 
            width: '100%', 
            height: '100%',
            zIndex: 0
          }}
        >
          <path
            d={`M ${startX} ${startY} C ${startX + 50} ${startY} ${endX - 50} ${endY} ${endX} ${endY}`}
            stroke="#666"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      )
    })
  }

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto w-full h-full max-w-7xl bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-4">
              <Dialog.Title className="text-lg font-medium text-gray-900">
                Visual Script Editor
              </Dialog.Title>
              <input
                type="text"
                value={script.name}
                onChange={(e) => setScript(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Script Name"
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSave}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <BookmarkIcon className="h-4 w-4 mr-2" />
                Save
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Editor Canvas */}
          <div 
            ref={canvasRef}
            className="relative flex-1 bg-gray-100 overflow-hidden"
            style={{ height: 'calc(100vh - 8rem)' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleCanvasRightClick}
          >
            {/* Grid Background */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(to right, #666 1px, transparent 1px),
                  linear-gradient(to bottom, #666 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px'
              }}
            />

            {/* Connections */}
            {renderConnections()}

            {/* Nodes */}
            {script.nodes.map(renderNode)}

            {/* Node Palette */}
            {showNodePalette && (
              <div 
                className="absolute bg-white border border-gray-300 rounded-lg shadow-lg p-2 z-20"
                style={{
                  left: palettePosition.x,
                  top: palettePosition.y
                }}
              >
                <div className="text-sm font-medium text-gray-900 mb-2">Add Node</div>
                {Object.entries(NODE_TYPES).map(([category, nodes]) => (
                  <div key={category} className="mb-2">
                    <div className="text-xs font-medium text-gray-600 mb-1">{category}</div>
                    {Object.keys(nodes).map(nodeType => (
                      <button
                        key={nodeType}
                        onClick={() => addNode(nodeType, category, palettePosition)}
                        className="block w-full text-left px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
                      >
                        {nodeType}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            Nodes: {script.nodes.length} | Connections: {script.connections.length} | 
            Right-click to add nodes | Click outputs to connect
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}