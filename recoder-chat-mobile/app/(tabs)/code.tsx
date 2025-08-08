import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView,
  TouchableOpacity, 
  StyleSheet,
  useColorScheme,
  Alert,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import MobileCodeEditor from '../../components/MobileCodeEditor';

interface Project {
  id: string;
  name: string;
  type: 'web' | 'mobile' | 'blockchain' | 'api';
  language: string;
  description: string;
  lastModified: Date;
  files: number;
  status: 'active' | 'archived' | 'template';
  color: string;
  icon: string;
}

interface RecentFile {
  id: string;
  name: string;
  path: string;
  language: string;
  lastModified: Date;
  projectId: string;
  content?: string;
}

export default function CodeScreen() {
  const colorScheme = useColorScheme();
  const [activeTab, setActiveTab] = useState<'projects' | 'files' | 'editor'>('projects');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<RecentFile | null>(null);

  // Mock data - in real app, this would come from context/storage
  const [projects] = useState<Project[]>([
    {
      id: '1',
      name: 'E-commerce App',
      type: 'web',
      language: 'TypeScript',
      description: 'Next.js e-commerce platform with Stripe integration',
      lastModified: new Date(),
      files: 47,
      status: 'active',
      color: '#3B82F6',
      icon: '🛒'
    },
    {
      id: '2', 
      name: 'DeFi Dashboard',
      type: 'blockchain',
      language: 'Solidity',
      description: 'Solana DeFi protocol dashboard and smart contracts',
      lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000),
      files: 23,
      status: 'active',
      color: '#8B5CF6',
      icon: '⚡'
    },
    {
      id: '3',
      name: 'Chat Mobile App',
      type: 'mobile',
      language: 'JavaScript',
      description: 'React Native chat application with real-time messaging',
      lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000),
      files: 31,
      status: 'active',
      color: '#10B981',
      icon: '💬'
    },
    {
      id: '4',
      name: 'API Gateway',
      type: 'api',
      language: 'Python',
      description: 'FastAPI microservices with authentication and rate limiting',
      lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      files: 15,
      status: 'archived',
      color: '#F59E0B',
      icon: '🔌'
    }
  ]);

  const [recentFiles] = useState<RecentFile[]>([
    {
      id: '1',
      name: 'App.tsx',
      path: '/src/App.tsx',
      language: 'typescript',
      lastModified: new Date(),
      projectId: '1',
      content: `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}`
    },
    {
      id: '2',
      name: 'contract.sol',
      path: '/contracts/DeFiVault.sol',
      language: 'solidity',
      lastModified: new Date(Date.now() - 30 * 60 * 1000),
      projectId: '2',
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DeFiVault is ReentrancyGuard {
    IERC20 public token;
    
    mapping(address => uint256) public deposits;
    
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    
    constructor(address _token) {
        token = IERC20(_token);
    }
    
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        deposits[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }
}`
    },
    {
      id: '3',
      name: 'api.py',
      path: '/src/main.py',
      language: 'python',
      lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000),
      projectId: '4',
      content: `from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
import os

app = FastAPI(title="Recoder API", version="1.0.0")
security = HTTPBearer()

class UserCreate(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    is_active: bool

@app.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    # Registration logic here
    pass

@app.get("/protected")
async def protected_route(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, os.getenv("SECRET_KEY"), algorithms=["HS256"])
        return {"message": "Access granted", "user_id": payload["user_id"]}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")`
    }
  ]);

  const handleProjectPress = (project: Project) => {
    setSelectedProject(project.id);
    // In real app, load project files
    Alert.alert(
      project.name,
      `Open project "${project.name}" with ${project.files} files?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: () => setActiveTab('files') }
      ]
    );
  };

  const handleFilePress = (file: RecentFile) => {
    setSelectedFile(file);
    setActiveTab('editor');
  };

  const handleNewProject = () => {
    Alert.alert(
      'New Project',
      'Choose project type:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Web App', onPress: () => createProject('web') },
        { text: 'Mobile App', onPress: () => createProject('mobile') },
        { text: 'Blockchain', onPress: () => createProject('blockchain') },
        { text: 'API', onPress: () => createProject('api') }
      ]
    );
  };

  const createProject = (type: string) => {
    // In real app, create new project
    Alert.alert('Project Created', `New ${type} project will be created`);
  };

  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isDark = colorScheme === 'dark';
  const backgroundColor = isDark ? '#000000' : '#FFFFFF';
  const cardBackground = isDark ? '#1C1C1E' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#000000';
  const secondaryTextColor = isDark ? '#8E8E93' : '#8E8E93';

  const renderTabContent = () => {
    switch (activeTab) {
      case 'projects':
        return (
          <View style={styles.tabContent}>
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: cardBackground }]}>
              <Ionicons name="search" size={20} color={secondaryTextColor} />
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="Search projects..."
                placeholderTextColor={secondaryTextColor}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Projects List */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredProjects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={[styles.projectCard, { backgroundColor: cardBackground }]}
                  onPress={() => handleProjectPress(project)}
                  activeOpacity={0.7}
                >
                  <View style={styles.projectHeader}>
                    <View style={[styles.projectIcon, { backgroundColor: project.color + '20' }]}>
                      <Text style={styles.projectEmoji}>{project.icon}</Text>
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={[styles.projectName, { color: textColor }]}>
                        {project.name}
                      </Text>
                      <Text style={[styles.projectType, { color: secondaryTextColor }]}>
                        {project.language} • {project.type}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge, 
                      { backgroundColor: project.status === 'active' ? '#10B981' : '#6B7280' }
                    ]}>
                      <Text style={styles.statusText}>
                        {project.status}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={[styles.projectDescription, { color: secondaryTextColor }]}>
                    {project.description}
                  </Text>
                  
                  <View style={styles.projectFooter}>
                    <View style={styles.projectStats}>
                      <Ionicons name="document-text-outline" size={14} color={secondaryTextColor} />
                      <Text style={[styles.statText, { color: secondaryTextColor }]}>
                        {project.files} files
                      </Text>
                    </View>
                    <Text style={[styles.timeText, { color: secondaryTextColor }]}>
                      {formatTime(project.lastModified)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );

      case 'files':
        return (
          <View style={styles.tabContent}>
            <View style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => setActiveTab('projects')}>
                <Text style={[styles.breadcrumbText, { color: '#007AFF' }]}>Projects</Text>
              </TouchableOpacity>
              <Text style={[styles.breadcrumbSeparator, { color: secondaryTextColor }]}> / </Text>
              <Text style={[styles.breadcrumbText, { color: textColor }]}>Files</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {recentFiles.map((file) => (
                <TouchableOpacity
                  key={file.id}
                  style={[styles.fileItem, { backgroundColor: cardBackground }]}
                  onPress={() => handleFilePress(file)}
                  activeOpacity={0.7}
                >
                  <View style={styles.fileIcon}>
                    <Ionicons 
                      name="document-text" 
                      size={24} 
                      color={getLanguageColor(file.language)} 
                    />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: textColor }]}>
                      {file.name}
                    </Text>
                    <Text style={[styles.filePath, { color: secondaryTextColor }]}>
                      {file.path}
                    </Text>
                  </View>
                  <View style={styles.fileActions}>
                    <Text style={[styles.fileTime, { color: secondaryTextColor }]}>
                      {formatTime(file.lastModified)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={secondaryTextColor} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );

      case 'editor':
        return (
          <View style={styles.tabContent}>
            <View style={styles.editorHeader}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => setActiveTab('files')}
              >
                <Ionicons name="chevron-back" size={20} color="#007AFF" />
                <Text style={[styles.backText, { color: '#007AFF' }]}>Files</Text>
              </TouchableOpacity>
              
              {selectedFile && (
                <Text style={[styles.editorTitle, { color: textColor }]}>
                  {selectedFile.name}
                </Text>
              )}
              
              <TouchableOpacity style={styles.saveButton}>
                <Ionicons name="checkmark" size={20} color="#10B981" />
              </TouchableOpacity>
            </View>

            {selectedFile && (
              <MobileCodeEditor
                initialCode={selectedFile.content || ''}
                language={selectedFile.language}
                onCodeChange={(newValue) => {
                  // In real app, save changes
                  console.log('Code changed:', newValue);
                }}
                theme={isDark ? 'dark' : 'light'}
              />
            )}
          </View>
        );

      default:
        return null;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  };

  const getLanguageColor = (language: string) => {
    const colors: { [key: string]: string } = {
      typescript: '#3178C6',
      javascript: '#F7DF1E',
      python: '#3776AB',
      solidity: '#363636',
      rust: '#CE422B',
      go: '#00ADD8'
    };
    return colors[language.toLowerCase()] || '#6B7280';
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>Projects</Text>
        <TouchableOpacity style={styles.newProjectButton} onPress={handleNewProject}>
          <Ionicons name="add" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabBar, { backgroundColor: cardBackground }]}>
        {[
          { id: 'projects', label: 'Projects', icon: 'folder-outline' },
          { id: 'files', label: 'Recent', icon: 'document-outline' },
          { id: 'editor', label: 'Editor', icon: 'code-outline' }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tabButton,
              activeTab === tab.id && styles.activeTab
            ]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <Ionicons 
              name={tab.icon as any} 
              size={18} 
              color={activeTab === tab.id ? '#007AFF' : secondaryTextColor} 
            />
            <Text style={[
              styles.tabLabel,
              { 
                color: activeTab === tab.id ? '#007AFF' : secondaryTextColor,
                fontWeight: activeTab === tab.id ? '600' : '400'
              }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {renderTabContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
  },
  newProjectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#007AFF20',
    borderRadius: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  projectCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  projectIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  projectEmoji: {
    fontSize: 20,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  projectType: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  projectDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: 12,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  timeText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  breadcrumbText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  breadcrumbSeparator: {
    fontSize: 16,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  fileIcon: {
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  filePath: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  fileActions: {
    alignItems: 'flex-end',
  },
  fileTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 4,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  saveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B98120',
    justifyContent: 'center',
    alignItems: 'center',
  },
});