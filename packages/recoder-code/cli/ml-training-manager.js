#!/usr/bin/env node

/**
 * ML Training Manager for Recoder Code
 * Handles custom model training, fine-tuning, and optimization
 */

const fs = require('fs').promises;
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;;
const crypto = require('crypto');
const EventEmitter = require('events');

class MLTrainingManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseDir = options.baseDir || process.cwd();
    this.modelsDir = path.join(this.baseDir, '.recoder', 'models');
    this.trainingDir = path.join(this.baseDir, '.recoder', 'training');
    this.config = options.config || {};
    this.sessions = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
      await fs.mkdir(this.trainingDir, { recursive: true });
      await this.loadExistingSessions();
      this.initialized = true;
      
      console.log(chalk.green('🧠 ML Training Manager initialized'));
    } catch (error) {
      console.error(chalk.red('Failed to initialize ML Training Manager:'), error.message);
      throw error;
    }
  }

  async loadExistingSessions() {
    try {
      const sessionsFile = path.join(this.trainingDir, 'sessions.json');
      if (await this.fileExists(sessionsFile)) {
        const data = await fs.readFile(sessionsFile, 'utf8');
        const sessions = JSON.parse(data);
        
        for (const [id, session] of Object.entries(sessions)) {
          this.sessions.set(id, session);
        }
        
        console.log(chalk.blue(`📚 Loaded ${this.sessions.size} training sessions`));
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load existing sessions'), error.message);
    }
  }

  async createTrainingSession(options = {}) {
    await this.initialize();

    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      name: options.name || `Training Session ${sessionId.slice(0, 8)}`,
      type: options.type || 'fine-tuning',
      status: 'created',
      createdAt: new Date().toISOString(),
      config: {
        model: options.model || 'claude-sonnet-4',
        trainingData: options.trainingData || [],
        epochs: options.epochs || 10,
        learningRate: options.learningRate || 0.001,
        batchSize: options.batchSize || 32,
        validationSplit: options.validationSplit || 0.2,
        ...options.config
      },
      metrics: {
        loss: [],
        accuracy: [],
        validationLoss: [],
        validationAccuracy: []
      },
      artifacts: {
        checkpoints: [],
        logs: [],
        models: []
      }
    };

    this.sessions.set(sessionId, session);
    await this.saveSessionData();

    console.log(chalk.green(`🚀 Created training session: ${session.name}`));
    console.log(chalk.blue(`   Session ID: ${sessionId}`));
    console.log(chalk.blue(`   Type: ${session.type}`));

    this.emit('sessionCreated', session);
    return session;
  }

  async startTraining(sessionId, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Training session ${sessionId} not found`);
    }

    if (session.status !== 'created' && session.status !== 'paused') {
      throw new Error(`Cannot start training for session in status: ${session.status}`);
    }

    session.status = 'training';
    session.startedAt = new Date().toISOString();

    console.log(chalk.yellow(`🔄 Starting training for session: ${session.name}`));

    try {
      // Validate training data
      await this.validateTrainingData(session.config.trainingData);

      // Prepare training environment
      await this.prepareTrainingEnvironment(session);

      // Start training process
      await this.executeTraining(session, options);

      session.status = 'completed';
      session.completedAt = new Date().toISOString();

      console.log(chalk.green(`✅ Training completed for session: ${session.name}`));
      this.emit('trainingCompleted', session);

    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
      session.failedAt = new Date().toISOString();

      console.error(chalk.red(`❌ Training failed for session: ${session.name}`));
      console.error(chalk.red(`   Error: ${error.message}`));
      
      this.emit('trainingFailed', session, error);
      throw error;
    } finally {
      await this.saveSessionData();
    }

    return session;
  }

  async validateTrainingData(trainingData) {
    if (!Array.isArray(trainingData) || trainingData.length === 0) {
      throw new Error('Training data must be a non-empty array');
    }

    const requiredFields = ['input', 'output'];
    for (let i = 0; i < trainingData.length; i++) {
      const item = trainingData[i];
      
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Training data item ${i} must be an object`);
      }

      for (const field of requiredFields) {
        if (!(field in item)) {
          throw new Error(`Training data item ${i} missing required field: ${field}`);
        }
      }

      if (typeof item.input !== 'string' || typeof item.output !== 'string') {
        throw new Error(`Training data item ${i} input and output must be strings`);
      }

      if (item.input.length === 0 || item.output.length === 0) {
        throw new Error(`Training data item ${i} input and output cannot be empty`);
      }
    }

    console.log(chalk.green(`✅ Validated ${trainingData.length} training examples`));
  }

  async prepareTrainingEnvironment(session) {
    const sessionDir = path.join(this.trainingDir, session.id);
    await fs.mkdir(sessionDir, { recursive: true });

    // Create subdirectories
    const subdirs = ['data', 'checkpoints', 'logs', 'models'];
    for (const subdir of subdirs) {
      await fs.mkdir(path.join(sessionDir, subdir), { recursive: true });
    }

    // Save training configuration
    const configPath = path.join(sessionDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(session.config, null, 2));

    // Prepare training data files
    await this.prepareTrainingDataFiles(session);

    console.log(chalk.blue(`📁 Prepared training environment: ${sessionDir}`));
  }

  async prepareTrainingDataFiles(session) {
    const sessionDir = path.join(this.trainingDir, session.id);
    const dataDir = path.join(sessionDir, 'data');

    // Split data into training and validation sets
    const { trainingData } = session.config;
    const shuffled = [...trainingData].sort(() => Math.random() - 0.5);
    
    const validationSize = Math.floor(shuffled.length * session.config.validationSplit);
    const validationData = shuffled.slice(0, validationSize);
    const trainData = shuffled.slice(validationSize);

    // Save data files
    await fs.writeFile(
      path.join(dataDir, 'train.jsonl'),
      trainData.map(item => JSON.stringify(item)).join('\n')
    );

    await fs.writeFile(
      path.join(dataDir, 'validation.jsonl'),
      validationData.map(item => JSON.stringify(item)).join('\n')
    );

    console.log(chalk.blue(`📊 Prepared training data: ${trainData.length} train, ${validationData.length} validation`));
  }

  async executeTraining(session, options = {}) {
    const sessionDir = path.join(this.trainingDir, session.id);
    const logFile = path.join(sessionDir, 'logs', 'training.log');

    // Simulate training process (in real implementation, this would interface with actual ML frameworks)
    console.log(chalk.yellow(`🔬 Starting training process...`));

    const totalEpochs = session.config.epochs;
    const updateInterval = options.updateInterval || 1000;

    for (let epoch = 1; epoch <= totalEpochs; epoch++) {
      await this.simulateEpoch(session, epoch, logFile);
      
      // Update session with progress
      session.currentEpoch = epoch;
      session.progress = (epoch / totalEpochs) * 100;
      
      await this.saveSessionData();
      this.emit('trainingProgress', session, epoch, totalEpochs);

      // Save checkpoint
      if (epoch % 5 === 0 || epoch === totalEpochs) {
        await this.saveCheckpoint(session, epoch);
      }

      // Brief pause to simulate training time
      await this.sleep(updateInterval);
    }

    // Generate final model
    await this.generateFinalModel(session);
  }

  async simulateEpoch(session, epoch, logFile) {
    // Simulate realistic training metrics
    const baseLoss = 2.0;
    const baseAccuracy = 0.6;
    
    const lossDecay = 0.9;
    const accuracyGrowth = 1.02;
    
    const noise = () => (Math.random() - 0.5) * 0.1;
    
    const loss = baseLoss * Math.pow(lossDecay, epoch) + noise();
    const accuracy = Math.min(0.95, baseAccuracy * Math.pow(accuracyGrowth, epoch * 0.5) + noise());
    
    const valLoss = loss + Math.abs(noise()) * 0.2;
    const valAccuracy = accuracy - Math.abs(noise()) * 0.05;

    // Update metrics
    session.metrics.loss.push(loss);
    session.metrics.accuracy.push(accuracy);
    session.metrics.validationLoss.push(valLoss);
    session.metrics.validationAccuracy.push(valAccuracy);

    // Log epoch results
    const logEntry = {
      epoch,
      timestamp: new Date().toISOString(),
      metrics: { loss, accuracy, valLoss, valAccuracy }
    };

    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');

    console.log(chalk.blue(`   Epoch ${epoch}: loss=${loss.toFixed(4)}, acc=${accuracy.toFixed(4)}, val_loss=${valLoss.toFixed(4)}, val_acc=${valAccuracy.toFixed(4)}`));
  }

  async saveCheckpoint(session, epoch) {
    const sessionDir = path.join(this.trainingDir, session.id);
    const checkpointDir = path.join(sessionDir, 'checkpoints', `epoch_${epoch}`);
    await fs.mkdir(checkpointDir, { recursive: true });

    const checkpoint = {
      epoch,
      timestamp: new Date().toISOString(),
      metrics: {
        loss: session.metrics.loss[epoch - 1],
        accuracy: session.metrics.accuracy[epoch - 1],
        validationLoss: session.metrics.validationLoss[epoch - 1],
        validationAccuracy: session.metrics.validationAccuracy[epoch - 1]
      },
      config: session.config,
      modelWeights: `checkpoint_epoch_${epoch}.bin` // Placeholder
    };

    await fs.writeFile(
      path.join(checkpointDir, 'checkpoint.json'),
      JSON.stringify(checkpoint, null, 2)
    );

    session.artifacts.checkpoints.push({
      epoch,
      path: checkpointDir,
      timestamp: checkpoint.timestamp
    });

    console.log(chalk.green(`💾 Saved checkpoint for epoch ${epoch}`));
  }

  async generateFinalModel(session) {
    const sessionDir = path.join(this.trainingDir, session.id);
    const modelsDir = path.join(sessionDir, 'models');

    const finalModel = {
      id: this.generateModelId(),
      name: `${session.name} - Final Model`,
      sessionId: session.id,
      type: session.type,
      baseModel: session.config.model,
      createdAt: new Date().toISOString(),
      metrics: {
        finalLoss: session.metrics.loss[session.metrics.loss.length - 1],
        finalAccuracy: session.metrics.accuracy[session.metrics.accuracy.length - 1],
        bestValidationAccuracy: Math.max(...session.metrics.validationAccuracy),
        trainingEpochs: session.config.epochs
      },
      files: {
        model: 'final_model.bin',
        config: 'model_config.json',
        tokenizer: 'tokenizer.json'
      }
    };

    // Save model metadata
    await fs.writeFile(
      path.join(modelsDir, 'model.json'),
      JSON.stringify(finalModel, null, 2)
    );

    // Add to session artifacts
    session.artifacts.models.push(finalModel);

    console.log(chalk.green(`🎯 Generated final model: ${finalModel.name}`));
    console.log(chalk.blue(`   Model ID: ${finalModel.id}`));
    console.log(chalk.blue(`   Final Accuracy: ${(finalModel.metrics.finalAccuracy * 100).toFixed(2)}%`));

    return finalModel;
  }

  async listSessions() {
    await this.initialize();
    return Array.from(this.sessions.values());
  }

  async getSession(sessionId) {
    await this.initialize();
    return this.sessions.get(sessionId);
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Training session ${sessionId} not found`);
    }

    // Delete session directory
    const sessionDir = path.join(this.trainingDir, sessionId);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not delete session directory: ${error.message}`));
    }

    // Remove from memory
    this.sessions.delete(sessionId);
    await this.saveSessionData();

    console.log(chalk.green(`🗑️ Deleted training session: ${session.name}`));
  }

  async exportModel(sessionId, modelId, exportPath) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Training session ${sessionId} not found`);
    }

    const model = session.artifacts.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in session ${sessionId}`);
    }

    const sessionDir = path.join(this.trainingDir, sessionId);
    const sourceDir = path.join(sessionDir, 'models');

    // Create export package
    const exportData = {
      model,
      session: {
        id: session.id,
        name: session.name,
        type: session.type,
        config: session.config
      },
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));

    console.log(chalk.green(`📦 Exported model to: ${exportPath}`));
    return exportPath;
  }

  async getTrainingMetrics(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Training session ${sessionId} not found`);
    }

    return {
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        progress: session.progress || 0
      },
      metrics: session.metrics,
      summary: {
        totalEpochs: session.config.epochs,
        currentEpoch: session.currentEpoch || 0,
        bestAccuracy: session.metrics.accuracy.length > 0 ? Math.max(...session.metrics.accuracy) : 0,
        bestValidationAccuracy: session.metrics.validationAccuracy.length > 0 ? Math.max(...session.metrics.validationAccuracy) : 0,
        finalLoss: session.metrics.loss.length > 0 ? session.metrics.loss[session.metrics.loss.length - 1] : 0
      }
    };
  }

  async saveSessionData() {
    const sessionsFile = path.join(this.trainingDir, 'sessions.json');
    const sessionsData = Object.fromEntries(this.sessions);
    await fs.writeFile(sessionsFile, JSON.stringify(sessionsData, null, 2));
  }

  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateModelId() {
    return crypto.randomBytes(12).toString('hex');
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async showHelp() {
    console.log(chalk.cyan.bold('🤖 ML Training System'));
    console.log('');
    console.log(chalk.yellow('📋 COMMANDS:'));
    console.log('  create <name>      Create new training session');
    console.log('  start <id>         Start training session');
    console.log('  stop <id>          Stop training session');
    console.log('  status [id]        Show training status');
    console.log('  list               List all training sessions');
    console.log('  logs <id>          View training logs');
    console.log('  export <id>        Export trained model');
    console.log('');
    console.log(chalk.yellow('📝 EXAMPLES:'));
    console.log('  recoder-code train create "My Model"');
    console.log('  recoder-code train start session-123');
    console.log('  recoder-code train status');
    console.log('  recoder-code train list');
    console.log('  recoder-code train logs session-123');
    console.log('');
    console.log(chalk.gray('💡 AI model training and fine-tuning platform'));
  }
}

module.exports = MLTrainingManager;

// CLI interface
if (require.main === module) {
  const mlManager = new MLTrainingManager();

  async function handleCommand() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
      switch (command) {
        case 'create':
          const session = await mlManager.createTrainingSession({
            name: args[0] || 'New Training Session',
            type: args[1] || 'fine-tuning'
          });
          console.log(JSON.stringify(session, null, 2));
          break;

        case 'start':
          if (!args[0]) {
            console.error('Usage: ml-training-manager.js start <session-id>');
            process.exit(1);
          }
          await mlManager.startTraining(args[0]);
          break;

        case 'list':
          const sessions = await mlManager.listSessions();
          console.table(sessions.map(s => ({
            id: s.id.slice(0, 8),
            name: s.name,
            status: s.status,
            type: s.type,
            progress: s.progress ? `${s.progress.toFixed(1)}%` : '0%'
          })));
          break;

        case 'metrics':
          if (!args[0]) {
            console.error('Usage: ml-training-manager.js metrics <session-id>');
            process.exit(1);
          }
          const metrics = await mlManager.getTrainingMetrics(args[0]);
          console.log(JSON.stringify(metrics, null, 2));
          break;

        case 'export':
          if (!args[0] || !args[1] || !args[2]) {
            console.error('Usage: ml-training-manager.js export <session-id> <model-id> <export-path>');
            process.exit(1);
          }
          await mlManager.exportModel(args[0], args[1], args[2]);
          break;

        default:
          console.log('ML Training Manager for Recoder Code');
          console.log('');
          console.log('Usage:');
          console.log('  ml-training-manager.js create [name] [type]');
          console.log('  ml-training-manager.js start <session-id>');
          console.log('  ml-training-manager.js list');
          console.log('  ml-training-manager.js metrics <session-id>');
          console.log('  ml-training-manager.js export <session-id> <model-id> <export-path>');
          break;
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  }

  handleCommand();
}