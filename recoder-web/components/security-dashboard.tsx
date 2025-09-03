'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, AlertTriangle, Bug, Key, Server, Settings,
  Play, Eye, Download, Copy, RefreshCw, Target, Search,
  CheckCircle, XCircle, AlertCircle, Info, Zap, Lock,
  FileText, Code, Database, Cloud, Layers, Activity,
  TrendingUp, TrendingDown, BarChart3, PieChart
} from 'lucide-react';

// 🔒 ENTERPRISE SECURITY DASHBOARD - REAL VULNERABILITY DETECTION
// Comprehensive security analysis with actual security tools

interface SecurityVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: 'dependency' | 'code' | 'infrastructure' | 'configuration' | 'secrets';
  title: string;
  description: string;
  file?: string;
  line?: number;
  column?: number;
  cwe?: string;
  cve?: string;
  cvss?: {
    score: number;
    vector: string;
    version: string;
  };
  recommendation: string;
  references: string[];
  patchAvailable?: boolean;
  exploitAvailable?: boolean;
  aiAnalysis?: string;
}

interface SecurityScanResult {
  id: string;
  projectPath: string;
  timestamp: string;
  duration: number;
  status: 'completed' | 'failed' | 'running';
  tools: string[];
  summary: {
    totalVulnerabilities: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    securityScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  vulnerabilities: SecurityVulnerability[];
  complianceChecks: {
    owasp: { passed: number; failed: number; score: number };
    pci: { passed: number; failed: number; score: number };
    gdpr: { passed: number; failed: number; score: number };
    soc2: { passed: number; failed: number; score: number };
  };
  secrets: {
    found: number;
    types: string[];
    files: string[];
  };
  dependencies: {
    total: number;
    vulnerable: number;
    outdated: number;
    licenses: Record<string, number>;
  };
  infrastructure: {
    containers: number;
    misconfigurations: number;
    exposedPorts: string[];
    weakPasswords: number;
  };
}

interface ScanType {
  name: string;
  description: string;
  tools: string[];
  languages?: string[];
  supports?: string[];
  patterns?: string[];
  files?: string[];
  checks?: string[];
  coverage?: string;
}

interface ComplianceFramework {
  name: string;
  description: string;
  checks?: string[];
  requirements?: string[];
  principles?: string[];
  criteria?: string[];
}

export default function SecurityDashboard() {
  // State management
  const [activeTab, setActiveTab] = useState('scan');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Security scan state
  const [scanResults, setScanResults] = useState<SecurityScanResult[]>([]);
  const [currentScan, setCurrentScan] = useState<SecurityScanResult | null>(null);
  const [selectedVulnerability, setSelectedVulnerability] = useState<SecurityVulnerability | null>(null);

  // Configuration state
  const [scanTypes, setScanTypes] = useState<Record<string, ScanType>>({});
  const [complianceFrameworks, setComplianceFrameworks] = useState<Record<string, ComplianceFramework>>({});

  // Scan configuration
  const [scanConfig, setScanConfig] = useState({
    projectPath: '/tmp/security-scan-demo',
    scanTypes: ['sast', 'dependencies', 'secrets'],
    includeSecrets: true,
    includeDependencies: true,
    includeInfrastructure: true,
    compliance: ['owasp', 'pci'],
    customRules: []
  });

  // Load initial data
  useEffect(() => {
    loadScanTypes();
    loadComplianceFrameworks();
  }, []);

  // Load available scan types
  const loadScanTypes = async () => {
    try {
      const response = await fetch('/api/security-suite?info=scan-types');
      const data = await response.json();
      
      if (data.success) {
        setScanTypes(data.scanTypes);
      }
    } catch (error) {
      console.error('Failed to load scan types:', error);
    }
  };

  // Load compliance frameworks
  const loadComplianceFrameworks = async () => {
    try {
      const response = await fetch('/api/security-suite?info=compliance');
      const data = await response.json();
      
      if (data.success) {
        setComplianceFrameworks(data.compliance);
      }
    } catch (error) {
      console.error('Failed to load compliance frameworks:', error);
    }
  };

  // 🔒 PERFORM SECURITY SCAN
  const performSecurityScan = async () => {
    if (!scanConfig.projectPath.trim()) {
      setError('Please provide a project path to scan');
      return;
    }

    setScanning(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('🔒 Starting comprehensive security scan...');
      
      const response = await fetch('/api/security-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'security-scan',
          ...scanConfig
        })
      });

      if (!response.ok) {
        throw new Error(`Security scan failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Security scan failed');
      }

      console.log('✅ Security scan completed:', data.result);
      setScanResults(prev => [data.result, ...prev]);
      setCurrentScan(data.result);
      setActiveTab('results');
      setSuccess(`Security scan completed! Found ${data.result.vulnerabilities.length} vulnerabilities`);

    } catch (error) {
      console.error('❌ Security scan failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setScanning(false);
    }
  };

  // 🎯 PERFORM PENETRATION TEST
  const performPenetrationTest = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🎯 Starting penetration test...');
      
      const response = await fetch('/api/security-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'penetration-test',
          target: 'localhost:3000',
          testTypes: ['portscan', 'webapp'],
          depth: 'surface'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Penetration test completed successfully!');
      } else {
        setError(data.error || 'Penetration test failed');
      }

    } catch (error) {
      console.error('Penetration test failed:', error);
      setError('Failed to perform penetration test');
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'info':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'medium':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <Info className="w-4 h-4 text-blue-500" />;
      case 'info':
        return <Info className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getVulnerabilityTypeIcon = (type: string) => {
    switch (type) {
      case 'code':
        return <Code className="w-4 h-4" />;
      case 'dependency':
        return <Layers className="w-4 h-4" />;
      case 'secrets':
        return <Key className="w-4 h-4" />;
      case 'infrastructure':
        return <Server className="w-4 h-4" />;
      case 'configuration':
        return <Settings className="w-4 h-4" />;
      default:
        return <Bug className="w-4 h-4" />;
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold flex items-center justify-center gap-3">
          <Shield className="w-12 h-12 text-blue-500" />
          <span className="bg-gradient-to-r from-red-600 via-orange-600 to-blue-600 bg-clip-text text-transparent">
            Enterprise Security Suite
          </span>
        </h1>
        <p className="text-xl text-gray-600">
          🔒 Real Vulnerability Detection & Security Analysis
        </p>
        <div className="flex items-center justify-center gap-4 mt-4">
          <Badge className="bg-red-100 text-red-800">🔍 SAST Analysis</Badge>
          <Badge className="bg-orange-100 text-orange-800">📦 Dependency Scan</Badge>
          <Badge className="bg-yellow-100 text-yellow-800">🔐 Secret Detection</Badge>
          <Badge className="bg-blue-100 text-blue-800">🏗️ Infrastructure Security</Badge>
          <Badge className="bg-purple-100 text-purple-800">🤖 AI Analysis</Badge>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="scan">Security Scan</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="vulnerabilities">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="pentest">Pen Testing</TabsTrigger>
        </TabsList>

        {/* SECURITY SCAN TAB */}
        <TabsContent value="scan" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scan Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Security Scan Configuration
                </CardTitle>
                <CardDescription>
                  Configure comprehensive security analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Project Path */}
                <div className="space-y-2">
                  <Label htmlFor="projectPath">Project Path *</Label>
                  <Input
                    id="projectPath"
                    placeholder="/path/to/your/project"
                    value={scanConfig.projectPath}
                    onChange={(e) => setScanConfig(prev => ({ ...prev, projectPath: e.target.value }))}
                    disabled={scanning}
                  />
                </div>

                {/* Scan Types */}
                <div className="space-y-4">
                  <h4 className="font-medium">Security Scan Types</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(scanTypes).map(([key, scanType]) => (
                      <div
                        key={key}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          scanConfig.scanTypes.includes(key) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => {
                          if (scanConfig.scanTypes.includes(key)) {
                            setScanConfig(prev => ({
                              ...prev,
                              scanTypes: prev.scanTypes.filter(t => t !== key)
                            }));
                          } else {
                            setScanConfig(prev => ({
                              ...prev,
                              scanTypes: [...prev.scanTypes, key]
                            }));
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium">{scanType.name}</h5>
                          <div className="flex items-center gap-1">
                            {scanType.tools.map((tool, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{scanType.description}</p>
                        {scanType.languages && (
                          <div className="text-xs text-gray-500">
                            Languages: {scanType.languages.join(', ')}
                          </div>
                        )}
                        {scanType.supports && (
                          <div className="text-xs text-gray-500">
                            Supports: {scanType.supports.join(', ')}
                          </div>
                        )}
                        {scanType.patterns && (
                          <div className="text-xs text-gray-500">
                            Patterns: {scanType.patterns.slice(0, 3).join(', ')}
                            {scanType.patterns.length > 3 && ` +${scanType.patterns.length - 3} more`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance Frameworks */}
                <div className="space-y-4">
                  <h4 className="font-medium">Compliance Frameworks</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(complianceFrameworks).map(([key, framework]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={key}
                          checked={scanConfig.compliance.includes(key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScanConfig(prev => ({
                                ...prev,
                                compliance: [...prev.compliance, key]
                              }));
                            } else {
                              setScanConfig(prev => ({
                                ...prev,
                                compliance: prev.compliance.filter(c => c !== key)
                              }));
                            }
                          }}
                          disabled={scanning}
                          className="rounded"
                        />
                        <Label htmlFor={key} className="text-sm">
                          {framework.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Advanced Options */}
                <div className="space-y-3">
                  <h4 className="font-medium">Advanced Options</h4>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="includeSecrets"
                      checked={scanConfig.includeSecrets}
                      onChange={(e) => setScanConfig(prev => ({ ...prev, includeSecrets: e.target.checked }))}
                      disabled={scanning}
                      className="rounded"
                    />
                    <Label htmlFor="includeSecrets" className="text-sm">
                      Deep Secret Scanning
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="includeDependencies"
                      checked={scanConfig.includeDependencies}
                      onChange={(e) => setScanConfig(prev => ({ ...prev, includeDependencies: e.target.checked }))}
                      disabled={scanning}
                      className="rounded"
                    />
                    <Label htmlFor="includeDependencies" className="text-sm">
                      Dependency Vulnerability Analysis
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="includeInfrastructure"
                      checked={scanConfig.includeInfrastructure}
                      onChange={(e) => setScanConfig(prev => ({ ...prev, includeInfrastructure: e.target.checked }))}
                      disabled={scanning}
                      className="rounded"
                    />
                    <Label htmlFor="includeInfrastructure" className="text-sm">
                      Infrastructure & Container Security
                    </Label>
                  </div>
                </div>

                {/* Scan Button */}
                <Button 
                  onClick={performSecurityScan}
                  disabled={scanning || !scanConfig.projectPath.trim() || scanConfig.scanTypes.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {scanning ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      Scanning for Vulnerabilities...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 mr-2" />
                      Start Comprehensive Security Scan
                    </>
                  )}
                </Button>

                {/* Status Messages */}
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-red-700">{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-green-700">{success}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scan Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Scan Configuration Preview
                </CardTitle>
                <CardDescription>
                  Review your security scan settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Target Path</Label>
                    <div className="p-2 bg-gray-50 rounded text-sm font-mono">
                      {scanConfig.projectPath || 'No path specified'}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-600">Active Scan Types</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {scanConfig.scanTypes.map((type) => (
                        <Badge key={type} variant="secondary" className="flex items-center gap-1">
                          {getVulnerabilityTypeIcon(type)}
                          {scanTypes[type]?.name || type}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-600">Compliance Checks</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {scanConfig.compliance.map((framework) => (
                        <Badge key={framework} variant="outline" className="text-xs">
                          {complianceFrameworks[framework]?.name || framework.toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-600">Security Options</Label>
                    <div className="space-y-1 mt-1">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Deep Secret Scanning: {scanConfig.includeSecrets ? 'Enabled' : 'Disabled'}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Dependency Analysis: {scanConfig.includeDependencies ? 'Enabled' : 'Disabled'}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Infrastructure Security: {scanConfig.includeInfrastructure ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label className="text-sm font-medium text-gray-600">Expected Scan Coverage</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Static Code Analysis</span>
                      <span className="text-green-600">✓ Included</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Dependency Vulnerabilities</span>
                      <span className="text-green-600">✓ Included</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Secret Detection</span>
                      <span className="text-green-600">✓ Included</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>AI-Enhanced Analysis</span>
                      <span className="text-blue-600">✓ Auto-enabled</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* RESULTS TAB */}
        <TabsContent value="results" className="space-y-6">
          {scanResults.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Security Scans</h3>
                <p className="text-gray-500 mb-4">Run your first security scan to see results here.</p>
                <Button onClick={() => setActiveTab('scan')}>
                  <Play className="w-4 h-4 mr-2" />
                  Start Security Scan
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Latest Scan Summary */}
              {currentScan && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-500" />
                        <div>
                          <div className="text-sm text-gray-500">Security Score</div>
                          <div className={`text-2xl font-bold ${getRiskLevelColor(currentScan.summary.riskLevel)}`}>
                            {currentScan.summary.securityScore}/100
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Bug className="w-5 h-5 text-red-500" />
                        <div>
                          <div className="text-sm text-gray-500">Vulnerabilities</div>
                          <div className="text-2xl font-bold">{currentScan.summary.totalVulnerabilities}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-5 h-5 ${getRiskLevelColor(currentScan.summary.riskLevel)}`} />
                        <div>
                          <div className="text-sm text-gray-500">Risk Level</div>
                          <div className={`text-2xl font-bold capitalize ${getRiskLevelColor(currentScan.summary.riskLevel)}`}>
                            {currentScan.summary.riskLevel}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-green-500" />
                        <div>
                          <div className="text-sm text-gray-500">Scan Duration</div>
                          <div className="text-2xl font-bold">{formatDuration(currentScan.duration)}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Vulnerability Breakdown */}
              {currentScan && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart className="w-5 h-5" />
                      Vulnerability Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{currentScan.summary.critical}</div>
                        <div className="text-sm text-gray-500">Critical</div>
                        <Progress value={(currentScan.summary.critical / currentScan.summary.totalVulnerabilities) * 100} className="mt-2" />
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">{currentScan.summary.high}</div>
                        <div className="text-sm text-gray-500">High</div>
                        <Progress value={(currentScan.summary.high / currentScan.summary.totalVulnerabilities) * 100} className="mt-2" />
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">{currentScan.summary.medium}</div>
                        <div className="text-sm text-gray-500">Medium</div>
                        <Progress value={(currentScan.summary.medium / currentScan.summary.totalVulnerabilities) * 100} className="mt-2" />
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{currentScan.summary.low}</div>
                        <div className="text-sm text-gray-500">Low</div>
                        <Progress value={(currentScan.summary.low / currentScan.summary.totalVulnerabilities) * 100} className="mt-2" />
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-600">{currentScan.summary.info}</div>
                        <div className="text-sm text-gray-500">Info</div>
                        <Progress value={(currentScan.summary.info / currentScan.summary.totalVulnerabilities) * 100} className="mt-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Security Analysis Summary */}
              {currentScan && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5" />
                        Secrets Found
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-red-600 mb-2">{currentScan.secrets.found}</div>
                      <div className="text-sm text-gray-500 mb-3">Hardcoded secrets detected</div>
                      <div className="space-y-1">
                        {currentScan.secrets.types.slice(0, 3).map((type, idx) => (
                          <div key={idx} className="text-xs text-gray-600">• {type}</div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Layers className="w-5 h-5" />
                        Dependencies
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-orange-600 mb-2">{currentScan.dependencies.vulnerable}</div>
                      <div className="text-sm text-gray-500 mb-3">Vulnerable dependencies</div>
                      <div className="text-xs text-gray-600">
                        Out of {currentScan.dependencies.total} total dependencies
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Server className="w-5 h-5" />
                        Infrastructure
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-yellow-600 mb-2">{currentScan.infrastructure.misconfigurations}</div>
                      <div className="text-sm text-gray-500 mb-3">Misconfigurations found</div>
                      <div className="text-xs text-gray-600">
                        {currentScan.infrastructure.containers} containers scanned
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Scan History */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Scan History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {scanResults.map((result) => (
                      <div
                        key={result.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          currentScan?.id === result.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => setCurrentScan(result)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            <span className="font-medium">Security Scan</span>
                            <Badge className={getSeverityColor(result.summary.riskLevel)}>
                              {result.summary.riskLevel}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(result.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Score:</span> {result.summary.securityScore}/100
                          </div>
                          <div>
                            <span className="text-gray-500">Vulnerabilities:</span> {result.summary.totalVulnerabilities}
                          </div>
                          <div>
                            <span className="text-gray-500">Duration:</span> {formatDuration(result.duration)}
                          </div>
                          <div>
                            <span className="text-gray-500">Tools:</span> {result.tools.join(', ')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* VULNERABILITIES TAB */}
        <TabsContent value="vulnerabilities" className="space-y-6">
          {currentScan && currentScan.vulnerabilities.length > 0 ? (
            <div className="space-y-6">
              {/* Vulnerability Filters */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Vulnerability Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {['critical', 'high', 'medium', 'low', 'info'].map((severity) => (
                      <Button
                        key={severity}
                        variant="outline"
                        size="sm"
                        className={`justify-start ${getSeverityColor(severity)}`}
                      >
                        {getSeverityIcon(severity)}
                        <span className="ml-2 capitalize">{severity}</span>
                        <Badge variant="secondary" className="ml-auto">
                          {currentScan.vulnerabilities.filter(v => v.severity === severity).length}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Vulnerability List */}
              <div className="space-y-4">
                {currentScan.vulnerabilities
                  .sort((a, b) => {
                    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                    return (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5);
                  })
                  .map((vulnerability) => (
                    <Card key={vulnerability.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="flex items-center gap-2">
                              {getSeverityIcon(vulnerability.severity)}
                              {getVulnerabilityTypeIcon(vulnerability.type)}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-lg mb-1">{vulnerability.title}</h4>
                              <p className="text-gray-600 mb-2">{vulnerability.description}</p>
                              
                              {vulnerability.file && (
                                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                                  <FileText className="w-4 h-4" />
                                  <span className="font-mono">{vulnerability.file}</span>
                                  {vulnerability.line && (
                                    <>
                                      <span>:</span>
                                      <span>{vulnerability.line}</span>
                                    </>
                                  )}
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2 mb-3">
                                <Badge className={getSeverityColor(vulnerability.severity)}>
                                  {vulnerability.severity.toUpperCase()}
                                </Badge>
                                <Badge variant="outline">{vulnerability.type}</Badge>
                                {vulnerability.cwe && (
                                  <Badge variant="outline">CWE-{vulnerability.cwe}</Badge>
                                )}
                                {vulnerability.cve && (
                                  <Badge variant="outline">{vulnerability.cve}</Badge>
                                )}
                                {vulnerability.patchAvailable && (
                                  <Badge className="bg-green-100 text-green-800">Patch Available</Badge>
                                )}
                                {vulnerability.exploitAvailable && (
                                  <Badge className="bg-red-100 text-red-800">Exploit Available</Badge>
                                )}
                              </div>

                              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                                <h5 className="font-medium text-blue-800 mb-1">Recommendation</h5>
                                <p className="text-blue-700 text-sm">{vulnerability.recommendation}</p>
                              </div>

                              {vulnerability.cvss && (
                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                  <span>CVSS Score: <strong>{vulnerability.cvss.score}</strong></span>
                                  <span>Vector: {vulnerability.cvss.vector}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedVulnerability(vulnerability)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Details
                            </Button>
                            {vulnerability.references.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(vulnerability.references[0])}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Vulnerabilities Found</h3>
                <p className="text-gray-500">Your project appears to be secure based on the current scan.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* COMPLIANCE TAB */}
        <TabsContent value="compliance" className="space-y-6">
          {currentScan ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(currentScan.complianceChecks).map(([framework, results]) => (
                <Card key={framework}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      {complianceFrameworks[framework]?.name || framework.toUpperCase()}
                    </CardTitle>
                    <CardDescription>
                      {complianceFrameworks[framework]?.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Compliance Score</span>
                        <Badge className={results.score >= 80 ? 'bg-green-100 text-green-800' : results.score >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                          {results.score}%
                        </Badge>
                      </div>
                      
                      <Progress value={results.score} className="w-full" />
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>{results.passed} Passed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span>{results.failed} Failed</span>
                        </div>
                      </div>

                      {complianceFrameworks[framework]?.checks && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Key Requirements</Label>
                          {complianceFrameworks[framework].checks?.slice(0, 5).map((check, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span>{check}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Compliance Data</h3>
                <p className="text-gray-500">Run a security scan to see compliance analysis.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PENETRATION TESTING TAB */}
        <TabsContent value="pentest" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Automated Penetration Testing
              </CardTitle>
              <CardDescription>
                Perform automated security testing on your applications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={performPenetrationTest}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    Running Penetration Test...
                  </>
                ) : (
                  <>
                    <Target className="w-5 h-5 mr-2" />
                    Start Penetration Test
                  </>
                )}
              </Button>
              
              <div className="text-sm text-gray-500 text-center">
                This will perform automated security testing including port scanning, web application testing, and vulnerability assessment.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Vulnerability Detail Modal */}
      {selectedVulnerability && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {getSeverityIcon(selectedVulnerability.severity)}
                  {selectedVulnerability.title}
                </CardTitle>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setSelectedVulnerability(null)}
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={getSeverityColor(selectedVulnerability.severity)}>
                  {selectedVulnerability.severity.toUpperCase()}
                </Badge>
                <Badge variant="outline">{selectedVulnerability.type}</Badge>
                {selectedVulnerability.cwe && (
                  <Badge variant="outline">CWE-{selectedVulnerability.cwe}</Badge>
                )}
                {selectedVulnerability.cve && (
                  <Badge variant="outline">{selectedVulnerability.cve}</Badge>
                )}
              </div>

              <div>
                <Label className="font-medium">Description</Label>
                <p className="text-sm text-gray-600 mt-1">{selectedVulnerability.description}</p>
              </div>

              {selectedVulnerability.file && (
                <div>
                  <Label className="font-medium">Location</Label>
                  <div className="flex items-center gap-2 text-sm font-mono bg-gray-50 p-2 rounded mt-1">
                    <FileText className="w-4 h-4" />
                    {selectedVulnerability.file}
                    {selectedVulnerability.line && (
                      <span>:{selectedVulnerability.line}</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label className="font-medium">Recommendation</Label>
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-1">
                  <p className="text-sm text-blue-700">{selectedVulnerability.recommendation}</p>
                </div>
              </div>

              {selectedVulnerability.cvss && (
                <div>
                  <Label className="font-medium">CVSS Information</Label>
                  <div className="grid grid-cols-3 gap-4 mt-1 text-sm">
                    <div>
                      <span className="text-gray-500">Score:</span> {selectedVulnerability.cvss.score}
                    </div>
                    <div>
                      <span className="text-gray-500">Version:</span> {selectedVulnerability.cvss.version}
                    </div>
                    <div>
                      <span className="text-gray-500">Vector:</span> {selectedVulnerability.cvss.vector}
                    </div>
                  </div>
                </div>
              )}

              {selectedVulnerability.references.length > 0 && (
                <div>
                  <Label className="font-medium">References</Label>
                  <div className="space-y-1 mt-1">
                    {selectedVulnerability.references.map((ref, idx) => (
                      <a
                        key={idx}
                        href={ref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-blue-600 hover:underline"
                      >
                        {ref}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selectedVulnerability.aiAnalysis && (
                <div>
                  <Label className="font-medium">AI Analysis</Label>
                  <div className="bg-purple-50 border border-purple-200 rounded p-3 mt-1">
                    <div className="text-sm text-purple-700">
                      AI-enhanced security analysis available
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}