"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Smartphone, Key, Copy, Check, X, AlertTriangle, 
  QrCode, RefreshCw, Download, Shield, Camera,
  ArrowLeft, ArrowRight, Loader2, ExternalLink,
  Eye, EyeOff
} from "lucide-react";
import QRCode from "qrcode";
import Image from "next/image";

interface TwoFactorSetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
  isEnabled?: boolean;
}

interface BackupCode {
  code: string;
  used: boolean;
}

export function TwoFactorSetup({ onComplete, onCancel, isEnabled = false }: TwoFactorSetupProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(isEnabled ? "manage" : "setup");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<BackupCode[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [setupData, setSetupData] = useState<{
    qrCode: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);

  // Current 2FA status
  const [twoFactorStatus, setTwoFactorStatus] = useState({
    enabled: isEnabled,
    methodType: "totp", // Time-based One-Time Password
    backupCodesRemaining: 8,
    lastUsed: null as string | null,
  });

  useEffect(() => {
    if (isEnabled) {
      loadTwoFactorStatus();
    }
  }, [isEnabled]);

  const loadTwoFactorStatus = async () => {
    try {
      const response = await fetch("/api/user/security/2fa/status", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setTwoFactorStatus(data.status);
        setBackupCodes(data.backupCodes || []);
      }
    } catch (error) {
      console.error("Failed to load 2FA status:", error);
    }
  };

  const initializeTwoFactor = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/2fa/setup", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setSetupData(data);
        setSecretKey(data.secret);
        
        // Generate QR Code
        const qrDataUrl = await QRCode.toDataURL(data.qrCodeUrl);
        setQrCodeUrl(qrDataUrl);
        
        setCurrentStep("verify");
      } else {
        setMessage("Failed to initialize two-factor authentication");
      }
    } catch (error) {
      console.error("2FA setup error:", error);
      setMessage("Failed to initialize two-factor authentication");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const verifyAndEnable = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setMessage("Please enter a valid 6-digit code");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: verificationCode,
          secret: secretKey,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBackupCodes(data.backupCodes.map((code: string) => ({ code, used: false })));
        setTwoFactorStatus({ ...twoFactorStatus, enabled: true });
        setCurrentStep("backup-codes");
        setMessage("Two-factor authentication enabled successfully!");
      } else {
        const errorData = await response.json();
        setMessage(errorData.error || "Invalid verification code");
      }
    } catch (error) {
      setMessage("Failed to verify code");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const disableTwoFactor = async () => {
    if (!confirm("Are you sure you want to disable two-factor authentication? This will make your account less secure.")) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/2fa/disable", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setTwoFactorStatus({ ...twoFactorStatus, enabled: false });
        setBackupCodes([]);
        setMessage("Two-factor authentication disabled");
        if (onComplete) onComplete();
      } else {
        setMessage("Failed to disable two-factor authentication");
      }
    } catch (error) {
      setMessage("Failed to disable two-factor authentication");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const regenerateBackupCodes = async () => {
    if (!confirm("This will invalidate all existing backup codes. Continue?")) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/user/security/2fa/backup-codes", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setBackupCodes(data.backupCodes.map((code: string) => ({ code, used: false })));
        setMessage("New backup codes generated");
      } else {
        setMessage("Failed to generate backup codes");
      }
    } catch (error) {
      setMessage("Failed to generate backup codes");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setMessage("Secret key copied to clipboard");
    setTimeout(() => setMessage(""), 2000);
  };

  const copyBackupCodes = () => {
    const codes = backupCodes.map(bc => bc.code).join("\n");
    navigator.clipboard.writeText(codes);
    setMessage("Backup codes copied to clipboard");
    setTimeout(() => setMessage(""), 2000);
  };

  const downloadBackupCodes = () => {
    const codes = backupCodes.map(bc => bc.code).join("\n");
    const blob = new Blob([`Recoder.xyz Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${codes}\n\nIMPORTANT:\n- Each code can only be used once\n- Store these codes in a secure location\n- Generate new codes if you lose these`], {
      type: "text/plain",
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recoder-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderSetupStep = () => {
    return (
      <div className="text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-indigo-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Enable Two-Factor Authentication
          </h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Add an extra layer of security to your account by requiring a second form of authentication.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-blue-900">Why enable 2FA?</p>
              <ul className="text-sm text-blue-800 mt-1 space-y-1">
                <li>• Protects against password theft</li>
                <li>• Prevents unauthorized access</li>
                <li>• Required for sensitive operations</li>
                <li>• Industry security best practice</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={initializeTwoFactor}
            disabled={isLoading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
            {isLoading ? "Setting up..." : "Set Up Two-Factor Authentication"}
          </button>
          
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderVerifyStep = () => {
    return (
      <div>
        <div className="text-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Scan QR Code
          </h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Use your authenticator app to scan the QR code below, then enter the verification code.
          </p>
        </div>

        <div className="space-y-6">
          {/* QR Code */}
          <div className="bg-white border-2 border-gray-200 rounded-lg p-6 text-center">
            {qrCodeUrl ? (
              <div className="inline-block p-4 bg-white rounded-lg shadow-sm">
                <Image
                  src={qrCodeUrl}
                  alt="2FA QR Code"
                  width={200}
                  height={200}
                  className="mx-auto"
                />
              </div>
            ) : (
              <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center mx-auto">
                <QrCode className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>

          {/* Manual Entry */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-900 mb-2">Can't scan? Enter this key manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded font-mono text-sm">
                {showSecret ? secretKey : secretKey.replace(/./g, "•")}
              </code>
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={copySecret}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Verification Code Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-center text-lg"
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {/* Recommended Apps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900 mb-2">Recommended Authenticator Apps:</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">Google Authenticator</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">Authy</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">1Password</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">Microsoft Authenticator</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setCurrentStep("setup")}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={verifyAndEnable}
              disabled={isLoading || verificationCode.length !== 6}
              className="flex-1 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {isLoading ? "Verifying..." : "Verify & Enable"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBackupCodesStep = () => {
    return (
      <div className="text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Two-Factor Authentication Enabled!
          </h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Save these backup codes in a secure location. You can use them to access your account if you lose your device.
          </p>
        </div>

        {/* Backup Codes */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((backupCode, index) => (
              <div key={index} className="p-2 bg-white border rounded text-center">
                {backupCode.code}
              </div>
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-yellow-900">Important Reminders:</p>
              <ul className="text-sm text-yellow-800 mt-1 space-y-1">
                <li>• Each backup code can only be used once</li>
                <li>• Store these codes in a secure, accessible location</li>
                <li>• Don't share these codes with anyone</li>
                <li>• Generate new codes if you lose these</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={copyBackupCodes}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Copy Codes
            </button>
            <button
              onClick={downloadBackupCodes}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
          
          <button
            onClick={() => {
              setCurrentStep("manage");
              if (onComplete) onComplete();
            }}
            className="w-full px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Continue
          </button>
        </div>
      </div>
    );
  };

  const renderManageStep = () => {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Two-Factor Authentication
          </h3>
          <p className="text-gray-600">
            Manage your two-factor authentication settings
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                twoFactorStatus.enabled ? "bg-green-100" : "bg-gray-100"
              }`}>
                {twoFactorStatus.enabled ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <X className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-900">
                  Two-Factor Authentication
                </h4>
                <p className={`text-sm ${
                  twoFactorStatus.enabled ? "text-green-600" : "text-gray-500"
                }`}>
                  {twoFactorStatus.enabled ? "Enabled and Active" : "Disabled"}
                </p>
              </div>
            </div>
            
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              twoFactorStatus.enabled 
                ? "bg-green-100 text-green-800" 
                : "bg-gray-100 text-gray-800"
            }`}>
              {twoFactorStatus.enabled ? "Protected" : "Unprotected"}
            </div>
          </div>

          {twoFactorStatus.enabled && (
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Method:</span>
                <span className="font-medium">Time-based (TOTP)</span>
              </div>
              <div className="flex justify-between">
                <span>Backup codes remaining:</span>
                <span className="font-medium">{backupCodes.filter(bc => !bc.used).length}/8</span>
              </div>
              {twoFactorStatus.lastUsed && (
                <div className="flex justify-between">
                  <span>Last used:</span>
                  <span className="font-medium">{new Date(twoFactorStatus.lastUsed).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Cards */}
        <div className="space-y-3">
          {!twoFactorStatus.enabled ? (
            <button
              onClick={() => setCurrentStep("setup")}
              className="w-full p-4 border border-indigo-200 rounded-lg hover:bg-indigo-50 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="font-medium text-gray-900">Enable Two-Factor Authentication</p>
                    <p className="text-sm text-gray-600">Add an extra layer of security</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          ) : (
            <>
              <button
                onClick={regenerateBackupCodes}
                disabled={isLoading}
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-900">Generate New Backup Codes</p>
                      <p className="text-sm text-gray-600">Replace existing backup codes</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>

              <button
                onClick={() => setCurrentStep("backup-codes")}
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-900">View Backup Codes</p>
                      <p className="text-sm text-gray-600">Access your recovery codes</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>

              <button
                onClick={disableTwoFactor}
                disabled={isLoading}
                className="w-full p-4 border border-red-200 rounded-lg hover:bg-red-50 text-left disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <X className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="font-medium text-red-900">Disable Two-Factor Authentication</p>
                      <p className="text-sm text-red-600">Remove 2FA from your account</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-red-400" />
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Header Message */}
      {message && (
        <div className={`mb-6 px-4 py-2 rounded-lg flex items-center gap-2 ${
          message.includes("success") || message.includes("enabled") || message.includes("copied") || message.includes("generated")
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}>
          {message.includes("success") || message.includes("enabled") || message.includes("copied") || message.includes("generated") ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {message}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        {currentStep === "setup" && renderSetupStep()}
        {currentStep === "verify" && renderVerifyStep()}
        {currentStep === "backup-codes" && renderBackupCodesStep()}
        {currentStep === "manage" && renderManageStep()}
      </div>
    </div>
  );
}