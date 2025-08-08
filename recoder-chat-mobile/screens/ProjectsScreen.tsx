/**
 * Projects Screen - Mobile project management with full web platform parity
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dualPlatformClient, Project, ProjectFile } from '../services/DualPlatformClient';
import MobileCodeEditor from '../components/MobileCodeEditor';

const { width, height } = Dimensions.get('window');

interface ProjectsScreenProps {
  navigation?: any;
}

const ProjectsScreen: React.FC<ProjectsScreenProps> = ({ navigation }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFileEditor, setShowFileEditor] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    type: 'web',
    framework: 'react',
    language: 'typescript',
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await dualPlatformClient.getProjects();
      
      if (response.success && response.data) {
        setProjects(response.data);
      } else {
        Alert.alert('Error', response.error || 'Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      Alert.alert('Error', 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const refreshProjects = async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  };

  const createProject = async () => {
    if (!newProject.name.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }

    try {
      const response = await dualPlatformClient.createProject(newProject);
      
      if (response.success && response.data) {
        setProjects([response.data, ...projects]);
        setShowCreateModal(false);
        setNewProject({
          name: '',
          description: '',
          type: 'web',
          framework: 'react',
          language: 'typescript',
        });
        Alert.alert('Success', 'Project created successfully!');
      } else {
        Alert.alert('Error', response.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Error', 'Failed to create project');
    }
  };

  const openProject = async (project: Project) => {
    try {
      const response = await dualPlatformClient.getProject(project.id);
      
      if (response.success && response.data) {
        setSelectedProject(response.data);
      } else {
        Alert.alert('Error', 'Failed to load project details');
      }
    } catch (error) {
      console.error('Error opening project:', error);
      Alert.alert('Error', 'Failed to open project');
    }
  };

  const openFile = (file: ProjectFile) => {
    setSelectedFile(file);
    setShowFileEditor(true);
  };

  const saveFile = async (content: string) => {
    if (!selectedFile || !selectedProject) return;

    try {
      const response = await dualPlatformClient.updateProjectFile(
        selectedProject.id,
        selectedFile.id,
        content
      );

      if (response.success) {
        // Update the file in the project
        setSelectedProject(prev => {
          if (!prev) return prev;
          
          const updatedFiles = prev.files.map(file => 
            file.id === selectedFile.id 
              ? { ...file, content, lastModified: new Date().toISOString() }
              : file
          );
          
          return { ...prev, files: updatedFiles };
        });
        
        Alert.alert('Success', 'File saved successfully!');
      } else {
        Alert.alert('Error', 'Failed to save file');
      }
    } catch (error) {
      console.error('Error saving file:', error);
      Alert.alert('Error', 'Failed to save file');
    }
  };

  const deployProject = async (project: Project) => {
    Alert.alert(
      'Deploy Project',
      `Are you sure you want to deploy "${project.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deploy',
          onPress: async () => {
            try {
              const response = await dualPlatformClient.deployProject(project.id);
              
              if (response.success) {
                Alert.alert('Success', 'Deployment started! Check the deployment status.');
                // Navigate to deployment screen or show status
              } else {
                Alert.alert('Error', 'Failed to start deployment');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to start deployment');
            }
          }
        }
      ]
    );
  };

  const getProjectIcon = (type: string): string => {
    const icons: Record<string, string> = {
      'web': '🌐',
      'mobile': '📱',
      'blockchain': '⛓️',
      'api': '🔌',
      'fullstack': '🚀',
    };
    return icons[type] || '📁';
  };

  const getProjectColor = (type: string): string => {
    const colors: Record<string, string> = {
      'web': '#10B981',
      'mobile': '#8B5CF6',
      'blockchain': '#3B82F6',
      'api': '#F59E0B',
      'fullstack': '#EF4444',
    };
    return colors[type] || '#6B7280';
  };

  const getLanguageIcon = (language: string): string => {
    const icons: Record<string, string> = {
      'javascript': '🟨',
      'typescript': '🔵',
      'python': '🐍',
      'rust': '🦀',
      'go': '🐹',
      'java': '☕',
    };
    return icons[language] || '📄';
  };

  const formatFileSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const ProjectCard: React.FC<{ project: Project }> = ({ project }) => (
    <TouchableOpacity
      style={[styles.projectCard, { borderLeftColor: getProjectColor(project.type) }]}
      onPress={() => openProject(project)}
      activeOpacity={0.7}
    >
      <View style={styles.projectHeader}>
        <Text style={styles.projectIcon}>{getProjectIcon(project.type)}</Text>
        <View style={styles.projectInfo}>
          <Text style={styles.projectName}>{project.name}</Text>
          <Text style={styles.projectDescription} numberOfLines={2}>
            {project.description}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.deployButton, { backgroundColor: getProjectColor(project.type) }]}
          onPress={(e) => {
            e.stopPropagation();
            deployProject(project);
          }}
        >
          <Text style={styles.deployButtonText}>🚀</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.projectMeta}>
        <View style={styles.projectTags}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{project.framework}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{getLanguageIcon(project.language)} {project.language}</Text>
          </View>
          <View style={[styles.statusTag, { 
            backgroundColor: project.status === 'deployed' ? '#10B981' : '#6B7280' 
          }]}>
            <Text style={styles.statusText}>{project.status}</Text>
          </View>
        </View>
        
        <View style={styles.projectStats}>
          <Text style={styles.statText}>{project.files.length} files</Text>
          <Text style={styles.statText}>
            Updated {new Date(project.updatedAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const FileItem: React.FC<{ file: ProjectFile }> = ({ file }) => (
    <TouchableOpacity
      style={styles.fileItem}
      onPress={() => openFile(file)}
      activeOpacity={0.7}
    >
      <View style={styles.fileInfo}>
        <Text style={styles.fileIcon}>{getLanguageIcon(file.language)}</Text>
        <View style={styles.fileDetails}>
          <Text style={styles.fileName}>{file.name}</Text>
          <Text style={styles.filePath}>{file.path}</Text>
        </View>
      </View>
      
      <View style={styles.fileMeta}>
        <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
        <Text style={styles.fileModified}>
          {new Date(file.lastModified).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading projects...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {selectedProject ? selectedProject.name : 'Projects'}
        </Text>
        <View style={styles.headerActions}>
          {selectedProject ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSelectedProject(null)}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.createButtonText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {selectedProject ? (
        // Project Details View
        <ScrollView 
          style={styles.projectDetails}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshProjects} />
          }
        >
          <View style={styles.projectOverview}>
            <Text style={styles.overviewTitle}>Project Overview</Text>
            <Text style={styles.overviewDescription}>{selectedProject.description}</Text>
            
            <View style={styles.overviewMeta}>
              <Text style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Framework: </Text>
                {selectedProject.framework}
              </Text>
              <Text style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Language: </Text>
                {selectedProject.language}
              </Text>
              <Text style={styles.overviewStat}>
                <Text style={styles.overviewLabel}>Status: </Text>
                {selectedProject.status}
              </Text>
            </View>
          </View>

          <View style={styles.filesSection}>
            <Text style={styles.sectionTitle}>Project Files</Text>
            {selectedProject.files.map(file => (
              <FileItem key={file.id} file={file} />
            ))}
          </View>
        </ScrollView>
      ) : (
        // Projects List View
        <ScrollView 
          style={styles.projectsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshProjects} />
          }
        >
          {projects.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📁</Text>
              <Text style={styles.emptyStateTitle}>No Projects Yet</Text>
              <Text style={styles.emptyStateDescription}>
                Create your first project to get started with building amazing applications.
              </Text>
            </View>
          ) : (
            projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))
          )}
        </ScrollView>
      )}

      {/* Create Project Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create New Project</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowCreateModal(false)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Project Name *</Text>
              <TextInput
                style={styles.textInput}
                value={newProject.name}
                onChangeText={(text) => setNewProject({ ...newProject, name: text })}
                placeholder="Enter project name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={newProject.description}
                onChangeText={(text) => setNewProject({ ...newProject, description: text })}
                placeholder="Describe your project..."
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Project Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {[
                  { value: 'web', label: '🌐 Web App', color: '#10B981' },
                  { value: 'mobile', label: '📱 Mobile App', color: '#8B5CF6' },
                  { value: 'blockchain', label: '⛓️ Blockchain', color: '#3B82F6' },
                  { value: 'api', label: '🔌 API', color: '#F59E0B' },
                  { value: 'fullstack', label: '🚀 Full Stack', color: '#EF4444' },
                ].map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.optionButton,
                      newProject.type === type.value && { backgroundColor: type.color }
                    ]}
                    onPress={() => setNewProject({ ...newProject, type: type.value })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      newProject.type === type.value && { color: '#ffffff' }
                    ]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Framework</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['react', 'next', 'vue', 'svelte', 'angular', 'flutter', 'react-native'].map((framework) => (
                  <TouchableOpacity
                    key={framework}
                    style={[
                      styles.optionButton,
                      newProject.framework === framework && styles.selectedOption
                    ]}
                    onPress={() => setNewProject({ ...newProject, framework })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      newProject.framework === framework && styles.selectedOptionText
                    ]}>
                      {framework}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Language</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['typescript', 'javascript', 'python', 'rust', 'go', 'java'].map((language) => (
                  <TouchableOpacity
                    key={language}
                    style={[
                      styles.optionButton,
                      newProject.language === language && styles.selectedOption
                    ]}
                    onPress={() => setNewProject({ ...newProject, language })}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      newProject.language === language && styles.selectedOptionText
                    ]}>
                      {getLanguageIcon(language)} {language}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.createProjectButton}
              onPress={createProject}
            >
              <Text style={styles.createProjectButtonText}>Create Project</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* File Editor Modal */}
      <Modal
        visible={showFileEditor}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.editorContainer}>
          <View style={styles.editorHeader}>
            <TouchableOpacity
              style={styles.editorClose}
              onPress={() => setShowFileEditor(false)}
            >
              <Text style={styles.editorCloseText}>← Close</Text>
            </TouchableOpacity>
            
            {selectedFile && (
              <Text style={styles.editorTitle}>{selectedFile.name}</Text>
            )}
            
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => {
                // This would be handled by the editor's save callback
                setShowFileEditor(false);
              }}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

          {selectedFile && (
            <MobileCodeEditor
              initialCode={selectedFile.content}
              language={selectedFile.language}
              onCodeChange={saveFile}
              showLineNumbers={true}
              autoComplete={true}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerActions: {
    flexDirection: 'row',
  },
  createButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  projectsList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyStateDescription: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  projectCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  projectIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  deployButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deployButtonText: {
    fontSize: 16,
  },
  projectMeta: {
    gap: 8,
  },
  projectTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#374151',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  projectStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  projectDetails: {
    flex: 1,
  },
  projectOverview: {
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  overviewDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  overviewMeta: {
    gap: 8,
  },
  overviewStat: {
    fontSize: 14,
    color: '#374151',
  },
  overviewLabel: {
    fontWeight: '600',
  },
  filesSection: {
    backgroundColor: '#ffffff',
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    padding: 16,
    paddingBottom: 8,
  },
  fileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fileIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 2,
  },
  filePath: {
    fontSize: 12,
    color: '#6b7280',
  },
  fileMeta: {
    alignItems: 'flex-end',
  },
  fileSize: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 2,
  },
  fileModified: {
    fontSize: 11,
    color: '#9ca3af',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#6b7280',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  optionButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  optionButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  selectedOption: {
    backgroundColor: '#3b82f6',
  },
  selectedOptionText: {
    color: '#ffffff',
  },
  modalActions: {
    padding: 16,
    paddingTop: 8,
  },
  createProjectButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createProjectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  editorClose: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editorCloseText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  saveButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  saveButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
});

export default ProjectsScreen;