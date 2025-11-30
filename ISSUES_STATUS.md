# Issues Status - Recoder.xyz

## ✅ FIXED

### 1. MCP Add Button
- **Status**: ✅ FIXED
- **Changes**: 
  - Increased button size (px-6 py-2.5)
  - Added loading states with spinner
  - Added success feedback banner
  - Shows "✓ Added" badge for added servers
  - Better visual feedback

### 3. Account Button Color
- **Status**: ✅ FIXED
- **Changes**:
  - Changed to use theme variables (bolt-elements-background-depth-2)
  - Dark background with proper contrast
  - Consistent with app design system

### 5. Chat History Text
- **Status**: ✅ FIXED
- **Changes**:
  - Removed "Chat History" text from sidebar header
  - Only shows close (X) button

### 7. Prompt Enhancer Error
- **Status**: ✅ FIXED
- **Changes**:
  - Fixed to use `result.textStream` instead of `result.fullStream`
  - Compatible with native OpenRouter implementation

### 8. Database Schema Missing
- **Status**: ✅ FIXED
- **Changes**:
  - Created fixed SQL schema (`init-chat.sql`)
  - Ran schema on database
  - Tables created: `chat_sessions`, `chat_messages`, `anonymous_sessions`

## ⚠️ REMAINING ISSUES

### 2. CLI Installation in WebContainer
- **Status**: ⚠️ NEEDS TESTING
- **Changes Made**:
  - Updated to install from npm registry (`npm install -g recoder-code`)
  - Added output streaming for visibility
- **Action Required**: Test if installation works now

### 6. Community Projects (Mock)
- **Status**: ❌ NOT STARTED
- **Action Required**: Remove or implement real community projects feature

### URGENT: Download/Push to GitHub
- **Status**: ❌ PARTIALLY EXISTS
- **Current State**: 
  - Download button exists in workbench toolbar
  - GitHub push button exists in workbench toolbar
- **Action Required**: Verify these features work correctly

### URGENT: Drag & Drop Files to Terminal
- **Status**: ❌ NOT STARTED
- **Action Required**: Implement drag-drop file/folder support for terminal chat input

## 🔧 NEXT STEPS

1. **Test CLI installation** - Refresh page and check if recoder-code installs
2. **Verify download/GitHub features** - Test existing buttons
3. **Implement drag-drop** - Add file drag-drop to terminal
4. **Remove/fix community projects** - Either implement or remove

## 📝 Notes

- Database is now properly initialized
- All color/styling issues resolved
- Core functionality (chat, enhancer) working
- Focus on remaining features: drag-drop and community projects
