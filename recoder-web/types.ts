// recoder-web/types.ts

export interface User {
  role: string;
  email: string;
  name: string;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  password: string | null;
  organization: string | null;
  isActive: boolean;
  emailVerified: boolean;
  securitySettings?: {
    loginNotifications: boolean;
    suspiciousActivityAlerts: boolean;
    sessionTimeout: number;
    allowMultipleSessions: boolean;
    requirePasswordOnSensitive: boolean;
  };
  passwordUpdatedAt?: Date;
  backupCodes: any;
}

export interface Project {
  id: string;
  plan: string;
  visibility: string;
  userSegments: any[];
  repository: string;
  deploymentHistory: any[];
  mediaFiles: any[];
  settings: any;
  subscription: any;
  _count: any;
  teamMemberships: any[];
  teamProjects: any[];
}

export interface Team {
  id: string;
  plan: string;
  visibility: string;
  settings: any;
  subscription: any;
  _count: any;
  teamMemberships: any[];
  teamProjects: any[];
}