"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Trash2, Download, Check, X,
  Clock, Shield, Users, Database, Key,
  FileText, Mail, ExternalLink, Loader2,
  Info, Eye, EyeOff, Calendar, Archive
} from "lucide-react";

interface DeletionStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  completed: boolean;
  required: boolean;
  action?: () => Promise<void>;
}

interface DeletionData {
  projects: number;
  teams: number;
  apiKeys: number;
  integrations: number;
  storageUsed: string;
  lastExport?: string;
}

export function AccountDeletionWorkflow() {
  const { user, logout } = useAuth();
  const router = useRouter();
  
  const [currentStep, setCurrentStep] = useState<"overview" | "checklist" | "confirmation" | "processing">("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationPassword, setConfirmationPassword] = useState("");
  const [agreementChecked, setAgreementChecked] = useState(false);
  
  const [deletionData, setDeletionData] = useState<DeletionData>({
    projects: 0,
    teams: 0,
    apiKeys: 0,
    integrations: 0,
    storageUsed: "0 MB",
  });

  const [deletionSteps, setDeletionSteps] = useState<DeletionStep[]>([
    {
      id: "export_data",
      title: "Export Your Data",
      description: "Download a copy of your account data for your records",
      icon: Download,
      completed: false,
      required: true,
      action: async () => {
        await exportAccountData();
      }
    },
    {
      id: "backup_projects",
      title: "Backup Important Projects",
      description: "Make sure you have local copies of projects you want to keep",
      icon: Archive,
      completed: false,
      required: true,
    },
    {
      id: "transfer_ownership",
      title: "Transfer Team Ownership",
      description: "Transfer ownership of teams you own to other members",
      icon: Users,
      completed: deletionData.teams === 0,
      required: deletionData.teams > 0,
    },
    {
      id: "revoke_integrations",
      title: "Revoke Integrations",
      description: "Disconnect all third-party service integrations",
      icon: Key,
      completed: deletionData.integrations === 0,
      required: false,
      action: async () => {
        await revokeAllIntegrations();
      }
    },
    {
      id: "cancel_subscription",
      title: "Cancel Subscription",
      description: "Cancel your paid subscription to avoid future charges",
      icon: FileText,
      completed: false,
      required: true,
    },
  ]);

  const loadDeletionData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/deletion-info", {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setDeletionData(data);
        
        // Update completion status based on data
        setDeletionSteps(prev => prev.map(step => ({
          ...step,
          completed: step.id === "transfer_ownership" ? data.teams === 0 : step.completed,
          required: step.id === "transfer_ownership" ? data.teams > 0 : step.required,
        })));
      }
    } catch (error) {
      console.error("Failed to load deletion data:", error);
      setMessage("Failed to load account information");
    } finally {
      setIsLoading(false);
    }
  };

  const exportAccountData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/export", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recoder-account-data-${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Mark step as completed
        setDeletionSteps(prev => prev.map(step =>
          step.id === "export_data" ? { ...step, completed: true } : step
        ));
        
        setMessage("Account data exported successfully!");
      } else {
        setMessage("Failed to export account data");
      }
    } catch (error) {
      setMessage("Failed to export account data");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const revokeAllIntegrations = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/integrations/revoke-all", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setDeletionSteps(prev => prev.map(step =>
          step.id === "revoke_integrations" ? { ...step, completed: true } : step
        ));
        setMessage("All integrations revoked successfully!");
      } else {
        setMessage("Failed to revoke integrations");
      }
    } catch (error) {
      setMessage("Failed to revoke integrations");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const completeStep = (stepId: string) => {
    setDeletionSteps(prev => prev.map(step =>
      step.id === stepId ? { ...step, completed: true } : step
    ));
  };

  const deleteAccount = async () => {
    if (!confirmationPassword) {
      setMessage("Please enter your password to confirm");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    if (!agreementChecked) {
      setMessage("Please confirm you understand the consequences");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setCurrentStep("processing");
    setIsLoading(true);

    try {
      const response = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password: confirmationPassword,
          reason: deletionReason,
          feedback: feedback,
        }),
      });

      if (response.ok) {
        // Account deleted successfully, log out and redirect
        await logout();
        router.push("/goodbye");
      } else {
        const errorData = await response.json();
        setMessage(errorData.error || "Failed to delete account");
        setCurrentStep("confirmation");
      }
    } catch (error) {
      setMessage("Failed to delete account");
      setCurrentStep("confirmation");
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const requiredStepsCompleted = deletionSteps
    .filter(step => step.required)
    .every(step => step.completed);

  // Load data when component mounts
  useEffect(() => {
    loadDeletionData();
  }, []);

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-red-900 mb-2">Account Deletion Warning</h3>
            <div className="text-sm text-red-800 space-y-2">
              <p>Deleting your account is <strong>permanent and irreversible</strong>. Once deleted:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>All your projects, files, and data will be permanently deleted</li>
                <li>Your subscription will be cancelled and cannot be recovered</li>
                <li>Team memberships will be removed (you must transfer ownership first)</li>
                <li>API keys and integrations will be revoked immediately</li>
                <li>Your username and email will become available for others to use</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <Database className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <div className="text-lg font-semibold text-gray-900">{deletionData.projects}</div>
          <div className="text-sm text-gray-600">Projects</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <Users className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <div className="text-lg font-semibold text-gray-900">{deletionData.teams}</div>
          <div className="text-sm text-gray-600">Teams</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <Key className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <div className="text-lg font-semibold text-gray-900">{deletionData.apiKeys}</div>
          <div className="text-sm text-gray-600">API Keys</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <Archive className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <div className="text-lg font-semibold text-gray-900">{deletionData.storageUsed}</div>
          <div className="text-sm text-gray-600">Storage Used</div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">Before You Delete Your Account</h3>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="mb-2">Consider these alternatives to account deletion:</p>
              <ul className="space-y-1">
                <li>• <strong>Downgrade to free plan</strong> - Keep your account but stop paying</li>
                <li>• <strong>Temporary deactivation</strong> - Suspend your account temporarily</li>
                <li>• <strong>Transfer ownership</strong> - Give your projects to someone else</li>
                <li>• <strong>Export data only</strong> - Keep your account but download your data</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setCurrentStep("checklist")}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Continue with Deletion
        </button>
        <button
          onClick={() => router.push("/settings")}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderChecklist = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Pre-Deletion Checklist</h3>
        <p className="text-sm text-gray-600">
          Complete these steps before deleting your account. Required steps must be completed.
        </p>
      </div>

      <div className="space-y-3">
        {deletionSteps.map((step) => (
          <div
            key={step.id}
            className={`p-4 border rounded-lg ${
              step.completed
                ? "border-green-200 bg-green-50"
                : step.required
                ? "border-red-200 bg-red-50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                step.completed
                  ? "bg-green-600 text-white"
                  : step.required
                  ? "bg-red-100 text-red-600"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {step.completed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <step.icon className="w-4 h-4" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`font-medium ${
                      step.completed ? "text-green-900" : step.required ? "text-red-900" : "text-gray-900"
                    }`}>
                      {step.title}
                      {step.required && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                          REQUIRED
                        </span>
                      )}
                    </h4>
                    <p className={`text-sm mt-1 ${
                      step.completed ? "text-green-700" : step.required ? "text-red-700" : "text-gray-600"
                    }`}>
                      {step.description}
                    </p>
                  </div>
                  
                  {!step.completed && step.action && (
                    <button
                      onClick={step.action}
                      disabled={isLoading}
                      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isLoading ? "Processing..." : "Complete"}
                    </button>
                  )}
                  
                  {!step.completed && !step.action && (
                    <button
                      onClick={() => completeStep(step.id)}
                      className="px-3 py-1 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                    >
                      Mark Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep("overview")}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep("confirmation")}
          disabled={!requiredStepsCompleted}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Proceed to Confirmation
        </button>
      </div>
    </div>
  );

  const renderConfirmation = () => (
    <div className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <h3 className="text-lg font-medium text-red-900">Final Confirmation</h3>
        </div>
        <p className="text-sm text-red-800">
          This is your last chance to change your mind. Once you confirm, your account and all associated data will be permanently deleted within 24 hours.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Why are you deleting your account? (Optional)
          </label>
          <select
            value={deletionReason}
            onChange={(e) => setDeletionReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
          >
            <option value="">Select a reason</option>
            <option value="not_using">I'm not using the service anymore</option>
            <option value="too_expensive">It's too expensive</option>
            <option value="missing_features">Missing features I need</option>
            <option value="switching_service">Switching to another service</option>
            <option value="privacy_concerns">Privacy concerns</option>
            <option value="technical_issues">Technical issues</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional feedback (Optional)
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            placeholder="Help us improve by sharing your feedback..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter your password to confirm
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={confirmationPassword}
              onChange={(e) => setConfirmationPassword(e.target.value)}
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter your current password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={agreementChecked}
              onChange={(e) => setAgreementChecked(e.target.checked)}
              className="mt-1 rounded text-red-600 focus:ring-red-500"
            />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">I understand and agree that:</p>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li>This action is permanent and cannot be undone</li>
                <li>All my data will be permanently deleted</li>
                <li>I will lose access to all projects and teams</li>
                <li>My subscription will be cancelled immediately</li>
              </ul>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep("checklist")}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={deleteAccount}
          disabled={isLoading || !confirmationPassword || !agreementChecked}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Delete My Account Forever
        </button>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="text-center space-y-6 py-12">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
      
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Deleting Your Account</h3>
        <p className="text-gray-600">
          Please wait while we process your account deletion. This may take a few moments.
        </p>
      </div>

      <div className="space-y-2 text-sm text-gray-500">
        <p>• Revoking API keys and tokens</p>
        <p>• Removing team memberships</p>
        <p>• Deleting projects and files</p>
        <p>• Cancelling subscriptions</p>
        <p>• Cleaning up account data</p>
      </div>
    </div>
  );

  if (isLoading && currentStep === "overview") {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-900">Delete Account</h1>
        <p className="text-gray-600 mt-2">
          Permanently delete your Recoder.xyz account and all associated data
        </p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
          message.includes("success") || message.includes("exported") || message.includes("revoked")
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
        }`}>
          {message.includes("success") || message.includes("exported") || message.includes("revoked") ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {message}
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center justify-center space-x-2">
        {["overview", "checklist", "confirmation", "processing"].map((step, index) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
              currentStep === step
                ? "bg-red-600 text-white"
                : ["overview", "checklist", "confirmation", "processing"].indexOf(currentStep) > index
                ? "bg-green-600 text-white"
                : "bg-gray-300 text-gray-600"
            }`}>
              {["overview", "checklist", "confirmation", "processing"].indexOf(currentStep) > index ? (
                <Check className="w-4 h-4" />
              ) : (
                index + 1
              )}
            </div>
            {index < 3 && (
              <div className={`w-8 h-0.5 ${
                ["overview", "checklist", "confirmation", "processing"].indexOf(currentStep) > index
                  ? "bg-green-600"
                  : "bg-gray-300"
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        {currentStep === "overview" && renderOverview()}
        {currentStep === "checklist" && renderChecklist()}
        {currentStep === "confirmation" && renderConfirmation()}
        {currentStep === "processing" && renderProcessing()}
      </div>
    </div>
  );
}