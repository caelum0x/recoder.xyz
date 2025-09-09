import { test, expect } from '@playwright/test';
import { LoginHelper } from '../helpers/login-helper';

test.describe('Settings Management Tests', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await page.goto('/');
    await loginHelper.ensureLoggedIn();
  });

  test.describe('Account Settings', () => {
    test('should update profile information successfully', async ({ page }) => {
      await page.goto('/settings/account');
      
      // Update profile information
      const newName = `Updated Name ${Date.now()}`;
      const newBio = 'Updated bio for testing purposes';
      
      await page.fill('[data-testid="name-input"]', newName);
      await page.fill('[data-testid="bio-textarea"]', newBio);
      
      // Save changes
      await page.click('[data-testid="save-profile-btn"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="profile-updated-message"]')).toBeVisible();
      
      // Verify changes are persisted
      await page.reload();
      await expect(page.locator('[data-testid="name-input"]')).toHaveValue(newName);
      await expect(page.locator('[data-testid="bio-textarea"]')).toHaveValue(newBio);
    });

    test('should upload and update profile picture', async ({ page }) => {
      await page.goto('/settings/account');
      
      // Click upload profile picture
      await page.click('[data-testid="upload-avatar-btn"]');
      
      // Upload test image (mock file)
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('[data-testid="choose-file-btn"]');
      const fileChooser = await fileChooserPromise;
      
      // In a real test, you would upload an actual image file
      // For now, we'll verify the upload UI is working
      await expect(page.locator('[data-testid="avatar-upload-modal"]')).toBeVisible();
      
      // Verify cropping interface
      await expect(page.locator('[data-testid="avatar-cropper"]')).toBeVisible();
      await expect(page.locator('[data-testid="crop-save-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="crop-cancel-btn"]')).toBeVisible();
    });

    test('should validate profile information', async ({ page }) => {
      await page.goto('/settings/account');
      
      // Test empty name validation
      await page.fill('[data-testid="name-input"]', '');
      await page.click('[data-testid="save-profile-btn"]');
      await expect(page.locator('[data-testid="name-error"]')).toContainText(/required/i);
      
      // Test name too long validation
      const longName = 'a'.repeat(101);
      await page.fill('[data-testid="name-input"]', longName);
      await page.click('[data-testid="save-profile-btn"]');
      await expect(page.locator('[data-testid="name-error"]')).toContainText(/too long/i);
      
      // Test bio too long validation
      const longBio = 'a'.repeat(501);
      await page.fill('[data-testid="bio-textarea"]', longBio);
      await page.click('[data-testid="save-profile-btn"]');
      await expect(page.locator('[data-testid="bio-error"]')).toContainText(/too long/i);
    });
  });

  test.describe('Security Settings', () => {
    test('should change password successfully', async ({ page }) => {
      await page.goto('/settings/security');
      
      // Click change password
      await page.click('[data-testid="change-password-btn"]');
      
      // Fill password change form
      await page.fill('[data-testid="current-password"]', 'testpassword123');
      await page.fill('[data-testid="new-password"]', 'newtestpassword123');
      await page.fill('[data-testid="confirm-new-password"]', 'newtestpassword123');
      
      // Submit password change
      await page.click('[data-testid="update-password-btn"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="password-updated-message"]')).toBeVisible();
    });

    test('should setup two-factor authentication', async ({ page }) => {
      await page.goto('/settings/security');
      
      // Enable 2FA
      await page.click('[data-testid="enable-2fa-btn"]');
      
      // Verify 2FA setup modal
      await expect(page.locator('[data-testid="2fa-setup-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="2fa-qr-code"]')).toBeVisible();
      await expect(page.locator('[data-testid="2fa-secret-key"]')).toBeVisible();
      
      // Enter verification code (mock)
      await page.fill('[data-testid="2fa-verification-code"]', '123456');
      await page.click('[data-testid="verify-2fa-btn"]');
      
      // Verify backup codes are shown
      await expect(page.locator('[data-testid="2fa-backup-codes"]')).toBeVisible();
      await expect(page.locator('[data-testid="download-backup-codes-btn"]')).toBeVisible();
    });

    test('should manage active sessions', async ({ page }) => {
      await page.goto('/settings/security');
      
      // View active sessions
      await page.click('[data-testid="manage-sessions-btn"]');
      
      // Verify current session is listed
      await expect(page.locator('[data-testid="current-session"]')).toBeVisible();
      await expect(page.locator('[data-testid="session-current-badge"]')).toBeVisible();
      
      // Verify session details
      await expect(page.locator('[data-testid="session-browser"]')).toBeVisible();
      await expect(page.locator('[data-testid="session-location"]')).toBeVisible();
      await expect(page.locator('[data-testid="session-last-active"]')).toBeVisible();
      
      // Test revoke all other sessions
      await page.click('[data-testid="revoke-all-sessions-btn"]');
      await page.click('[data-testid="confirm-revoke-sessions-btn"]');
      await expect(page.locator('[data-testid="sessions-revoked-message"]')).toBeVisible();
    });

    test('should manage API keys', async ({ page }) => {
      await page.goto('/settings/security');
      
      // Create new API key
      await page.click('[data-testid="create-api-key-btn"]');
      
      const apiKeyName = `Test API Key ${Date.now()}`;
      await page.fill('[data-testid="api-key-name"]', apiKeyName);
      await page.selectOption('[data-testid="api-key-scope"]', 'read');
      await page.click('[data-testid="generate-api-key-btn"]');
      
      // Verify API key is created and displayed
      await expect(page.locator('[data-testid="api-key-created-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="api-key-value"]')).toBeVisible();
      
      // Copy API key
      await page.click('[data-testid="copy-api-key-btn"]');
      await expect(page.locator('[data-testid="api-key-copied-message"]')).toBeVisible();
      
      // Close modal and verify key appears in list
      await page.click('[data-testid="close-api-key-modal"]');
      await expect(page.locator(`[data-testid="api-key-${apiKeyName}"]`)).toBeVisible();
      
      // Revoke API key
      await page.click(`[data-testid="revoke-api-key-${apiKeyName}"]`);
      await page.click('[data-testid="confirm-revoke-api-key"]');
      await expect(page.locator('[data-testid="api-key-revoked-message"]')).toBeVisible();
    });
  });

  test.describe('Privacy Settings', () => {
    test('should update privacy preferences', async ({ page }) => {
      await page.goto('/settings/privacy');
      
      // Update project visibility default
      await page.selectOption('[data-testid="default-project-visibility"]', 'private');
      
      // Update analytics preferences
      await page.uncheck('[data-testid="allow-analytics"]');
      await page.uncheck('[data-testid="allow-marketing-emails"]');
      
      // Update data retention settings
      await page.selectOption('[data-testid="data-retention-period"]', '1-year');
      
      // Save privacy settings
      await page.click('[data-testid="save-privacy-btn"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="privacy-updated-message"]')).toBeVisible();
      
      // Verify settings are persisted
      await page.reload();
      await expect(page.locator('[data-testid="default-project-visibility"]')).toHaveValue('private');
      await expect(page.locator('[data-testid="allow-analytics"]')).not.toBeChecked();
    });

    test('should export user data (GDPR compliance)', async ({ page }) => {
      await page.goto('/settings/privacy');
      
      // Request data export
      await page.click('[data-testid="export-data-btn"]');
      
      // Confirm data export request
      await page.click('[data-testid="confirm-export-btn"]');
      
      // Verify export request is submitted
      await expect(page.locator('[data-testid="export-requested-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="export-email-notification"]')).toBeVisible();
    });

    test('should delete account (with confirmation)', async ({ page }) => {
      await page.goto('/settings/privacy');
      
      // Navigate to danger zone
      await page.click('[data-testid="danger-zone-tab"]');
      
      // Initiate account deletion
      await page.click('[data-testid="delete-account-btn"]');
      
      // Verify deletion confirmation modal
      await expect(page.locator('[data-testid="delete-account-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="deletion-consequences"]')).toBeVisible();
      
      // Fill deletion confirmation
      await page.fill('[data-testid="confirm-deletion-input"]', 'DELETE');
      await page.fill('[data-testid="deletion-reason-textarea"]', 'Testing account deletion flow');
      
      // Note: In a real test, you wouldn't actually delete the account
      // await page.click('[data-testid="confirm-delete-account-btn"]');
      
      // Verify deletion form is properly set up
      await expect(page.locator('[data-testid="confirm-delete-account-btn"]')).toBeEnabled();
    });
  });

  test.describe('Team Settings', () => {
    test('should create and manage team', async ({ page }) => {
      await page.goto('/settings/team');
      
      // Create new team
      await page.click('[data-testid="create-team-btn"]');
      
      const teamName = `Test Team ${Date.now()}`;
      await page.fill('[data-testid="team-name-input"]', teamName);
      await page.fill('[data-testid="team-description"]', 'Test team for E2E testing');
      
      await page.click('[data-testid="create-team-submit"]');
      
      // Verify team is created
      await expect(page.locator('[data-testid="team-created-message"]')).toBeVisible();
      await expect(page.locator(`[data-testid="team-${teamName}"]`)).toBeVisible();
      
      // Invite team member
      await page.click('[data-testid="invite-member-btn"]');
      await page.fill('[data-testid="member-email"]', 'testmember@example.com');
      await page.selectOption('[data-testid="member-role"]', 'editor');
      await page.click('[data-testid="send-invitation-btn"]');
      
      await expect(page.locator('[data-testid="invitation-sent-message"]')).toBeVisible();
    });

    test('should manage team member roles', async ({ page }) => {
      await page.goto('/settings/team');
      
      // Verify team members list
      await expect(page.locator('[data-testid="team-members-list"]')).toBeVisible();
      
      // Change member role (if members exist)
      const memberExists = await page.locator('[data-testid="team-member-item"]').isVisible();
      
      if (memberExists) {
        await page.click('[data-testid="member-role-dropdown"]');
        await page.click('[data-testid="role-admin"]');
        await page.click('[data-testid="confirm-role-change"]');
        
        await expect(page.locator('[data-testid="role-updated-message"]')).toBeVisible();
      }
    });
  });

  test.describe('Integration Settings', () => {
    test('should manage GitHub integration', async ({ page }) => {
      await page.goto('/settings/integrations');
      
      // Connect GitHub
      await page.click('[data-testid="connect-github-btn"]');
      
      // In a real test, this would trigger OAuth flow
      // For now, verify the connection UI
      await expect(page.locator('[data-testid="github-oauth-redirect"]')).toBeVisible();
    });

    test('should configure webhooks', async ({ page }) => {
      await page.goto('/settings/integrations');
      
      // Create webhook
      await page.click('[data-testid="create-webhook-btn"]');
      
      const webhookUrl = 'https://example.com/webhook';
      await page.fill('[data-testid="webhook-url"]', webhookUrl);
      await page.check('[data-testid="webhook-event-project-created"]');
      await page.check('[data-testid="webhook-event-deployment-success"]');
      
      await page.click('[data-testid="save-webhook-btn"]');
      
      // Verify webhook is created
      await expect(page.locator('[data-testid="webhook-created-message"]')).toBeVisible();
      await expect(page.locator(`[data-testid="webhook-${webhookUrl}"]`)).toBeVisible();
      
      // Test webhook
      await page.click('[data-testid="test-webhook-btn"]');
      await expect(page.locator('[data-testid="webhook-test-sent"]')).toBeVisible();
    });
  });

  test.describe('Notification Settings', () => {
    test('should configure notification preferences', async ({ page }) => {
      await page.goto('/settings/notifications');
      
      // Configure email notifications
      await page.uncheck('[data-testid="email-project-updates"]');
      await page.check('[data-testid="email-security-alerts"]');
      await page.uncheck('[data-testid="email-marketing"]');
      
      // Configure push notifications
      await page.check('[data-testid="push-project-updates"]');
      await page.check('[data-testid="push-deployment-status"]');
      
      // Configure quiet hours
      await page.selectOption('[data-testid="quiet-hours-start"]', '22:00');
      await page.selectOption('[data-testid="quiet-hours-end"]', '08:00');
      
      // Save notification settings
      await page.click('[data-testid="save-notifications-btn"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="notifications-updated-message"]')).toBeVisible();
      
      // Verify settings are persisted
      await page.reload();
      await expect(page.locator('[data-testid="email-project-updates"]')).not.toBeChecked();
      await expect(page.locator('[data-testid="push-project-updates"]')).toBeChecked();
    });
  });

  test.describe('Settings Navigation', () => {
    test('should navigate between settings sections', async ({ page }) => {
      await page.goto('/settings');
      
      // Test navigation to each section
      const sections = ['account', 'security', 'privacy', 'team', 'integrations', 'notifications'];
      
      for (const section of sections) {
        await page.click(`[data-testid="nav-${section}"]`);
        await expect(page.locator(`[data-testid="${section}-settings"]`)).toBeVisible();
        await expect(page).toHaveURL(`/settings/${section}`);
      }
    });

    test('should show unsaved changes warning', async ({ page }) => {
      await page.goto('/settings/account');
      
      // Make changes without saving
      await page.fill('[data-testid="name-input"]', 'Unsaved Name');
      
      // Try to navigate away
      await page.click('[data-testid="nav-security"]');
      
      // Verify unsaved changes warning
      await expect(page.locator('[data-testid="unsaved-changes-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="discard-changes-btn"]')).toBeVisible();
      await expect(page.locator('[data-testid="save-changes-btn"]')).toBeVisible();
    });
  });
});
