"use client";

import { useState, useEffect } from "react";
import { Download, FileText, Archive, Clock, AlertCircle, CheckCircle, Info } from "lucide-react";

interface ExportOptions {
  format: 'zip' | 'json';
  includeFiles: boolean;
}

interface ExportInfo {
  availableFormats: string[];
  dataTypes: Array<{
    type: string;
    description: string;
    size: string;
  }>;
  options: {
    includeFiles: {
      description: string;
      impact: string;
      formats: string[];
    };
  };
  estimatedSize: {
    withoutFiles: string;
    withFiles: string;
  };
  processingTime: {
    withoutFiles: string;
    withFiles: string;
  };
}

export function GDPRDataExport() {
  const [exportInfo, setExportInfo] = useState<ExportInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [options, setOptions] = useState<ExportOptions>({
    format: 'zip',
    includeFiles: false
  });

  // Load export information on component mount
  useEffect(() => {
    loadExportInfo();
  }, []);

  const loadExportInfo = async () => {
    try {
      const response = await fetch('/api/user/export');
      if (response.ok) {
        const info = await response.json();
        setExportInfo(info);
      }
    } catch (error) {
      console.error('Failed to load export info:', error);
    }
  };

  const startExport = async () => {
    setIsLoading(true);
    setExportStatus('processing');
    setMessage('');

    try {
      const response = await fetch('/api/user/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Get filename from response headers or create default
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileName = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `recoder-export-${new Date().toISOString().split('T')[0]}.${options.format}`;
      
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportStatus('completed');
      setMessage('Your data has been exported successfully!');
    } catch (error) {
      setExportStatus('error');
      setMessage('Failed to export data. Please try again.');
      console.error('Export error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Download className="w-5 h-5" />
          GDPR Data Export
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Export all your personal data in a machine-readable format
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* GDPR Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-blue-900">Your Right to Data Portability</h3>
              <p className="text-sm text-blue-700 mt-1">
                Under GDPR, you have the right to receive a copy of your personal data in a structured, 
                commonly used format. This export includes all data associated with your account.
              </p>
            </div>
          </div>
        </div>

        {/* Export Status */}
        {exportStatus !== 'idle' && (
          <div className={`border rounded-lg p-4 ${
            exportStatus === 'processing' ? 'bg-yellow-50 border-yellow-200' :
            exportStatus === 'completed' ? 'bg-green-50 border-green-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {exportStatus === 'processing' && <Clock className="w-5 h-5 text-yellow-600 animate-spin" />}
              {exportStatus === 'completed' && <CheckCircle className="w-5 h-5 text-green-600" />}
              {exportStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
              <p className={`text-sm font-medium ${
                exportStatus === 'processing' ? 'text-yellow-900' :
                exportStatus === 'completed' ? 'text-green-900' :
                'text-red-900'
              }`}>
                {message || (
                  exportStatus === 'processing' ? 'Preparing your data export...' :
                  exportStatus === 'completed' ? 'Export completed successfully!' :
                  'Export failed'
                )}
              </p>
            </div>
          </div>
        )}

        {/* Export Options */}
        <div className="space-y-4">
          <h3 className="text-base font-medium text-gray-900">Export Options</h3>
          
          {/* Format Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Export Format
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="format"
                  value="zip"
                  checked={options.format === 'zip'}
                  onChange={(e) => setOptions(prev => ({ ...prev, format: e.target.value as 'zip' }))}
                  className="text-blue-600"
                />
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-900">ZIP Archive</span>
                </div>
                <span className="text-xs text-gray-500">(Recommended - organized files)</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={options.format === 'json'}
                  onChange={(e) => setOptions(prev => ({ ...prev, format: e.target.value as 'json' }))}
                  className="text-blue-600"
                />
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-900">JSON File</span>
                </div>
                <span className="text-xs text-gray-500">(Single file - machine readable)</span>
              </label>
            </div>
          </div>

          {/* Include Files Option */}
          {options.format === 'zip' && (
            <div>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={options.includeFiles}
                  onChange={(e) => setOptions(prev => ({ ...prev, includeFiles: e.target.checked }))}
                  className="text-blue-600 mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 block">Include Project Files</span>
                  <span className="text-xs text-gray-500">
                    Include actual source code files (significantly increases export size and processing time)
                  </span>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Data Types */}
        {exportInfo && (
          <div>
            <h3 className="text-base font-medium text-gray-900 mb-3">Data Included</h3>
            <div className="space-y-2">
              {exportInfo.dataTypes.map((dataType, index) => (
                <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {dataType.type.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <p className="text-xs text-gray-600">{dataType.description}</p>
                  </div>
                  <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                    {dataType.size}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estimates */}
        {exportInfo && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900">Estimated Size</h4>
              <p className="text-sm text-gray-600 mt-1">
                {options.includeFiles ? exportInfo.estimatedSize.withFiles : exportInfo.estimatedSize.withoutFiles}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900">Processing Time</h4>
              <p className="text-sm text-gray-600 mt-1">
                {options.includeFiles ? exportInfo.processingTime.withFiles : exportInfo.processingTime.withoutFiles}
              </p>
            </div>
          </div>
        )}

        {/* Export Button */}
        <div className="pt-4">
          <button
            onClick={startExport}
            disabled={isLoading || exportStatus === 'processing'}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                Preparing Export...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export My Data
              </>
            )}
          </button>
        </div>

        {/* Legal Notice */}
        <div className="text-xs text-gray-500 border-t pt-4">
          <p>
            <strong>Privacy Notice:</strong> Your export will contain all personal data associated with your account. 
            Keep this data secure and delete it when no longer needed. API keys and passwords are excluded for security.
          </p>
        </div>
      </div>
    </div>
  );
}
