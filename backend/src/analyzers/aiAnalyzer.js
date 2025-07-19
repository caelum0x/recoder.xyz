const { BaseAnalyzer } = require('./baseAnalyzer');
const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class AIAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.aiFrameworks = {
      tensorflow: {
        packages: ['tensorflow', '@tensorflow/tfjs', 'tensorflow-gpu'],
        imports: ['tensorflow', 'tf'],
        extensions: ['.py', '.js', '.ts']
      },
      pytorch: {
        packages: ['torch', 'torchvision', 'pytorch'],
        imports: ['torch', 'pytorch'],
        extensions: ['.py']
      },
      keras: {
        packages: ['keras', 'tf.keras'],
        imports: ['keras'],
        extensions: ['.py']
      },
      scikit: {
        packages: ['scikit-learn', 'sklearn'],
        imports: ['sklearn'],
        extensions: ['.py']
      },
      huggingface: {
        packages: ['transformers', 'datasets', 'tokenizers'],
        imports: ['transformers', 'datasets'],
        extensions: ['.py']
      },
      openai: {
        packages: ['openai', '@openai/api'],
        imports: ['openai'],
        extensions: ['.py', '.js', '.ts']
      },
      langchain: {
        packages: ['langchain', 'langchain-core'],
        imports: ['langchain'],
        extensions: ['.py', '.js', '.ts']
      },
      anthropic: {
        packages: ['anthropic'],
        imports: ['anthropic'],
        extensions: ['.py', '.js', '.ts']
      }
    };

    this.aiPatterns = {
      models: {
        cnn: /conv|cnn|convolution|Conv2D|Conv1D/gi,
        rnn: /rnn|lstm|gru|recurrent|LSTM|GRU/gi,
        transformer: /transformer|attention|bert|gpt|t5/gi,
        gan: /gan|generator|discriminator|adversarial/gi,
        autoencoder: /autoencoder|encoder|decoder/gi,
        reinforcement: /reinforcement|rl|q.?learning|policy|agent/gi
      },
      techniques: {
        supervised: /supervised|classification|regression|predict/gi,
        unsupervised: /unsupervised|clustering|kmeans|pca|dimensionality/gi,
        deepLearning: /deep.?learning|neural.?network|backprop|gradient.?descent/gi,
        nlp: /nlp|natural.?language|text.?processing|tokeniz|embedding/gi,
        computerVision: /computer.?vision|image.?processing|cv|opencv|cnn|object.?detection/gi,
        reinforcementLearning: /reinforcement.?learning|rl|q.?learning|policy|reward/gi
      },
      tasks: {
        classification: /classify|classification|predict.?class|label/gi,
        regression: /regression|predict.?value|continuous/gi,
        clustering: /cluster|kmeans|hierarchical|dbscan/gi,
        generation: /generate|synthesis|creative|text.?generation|image.?generation/gi,
        recommendation: /recommend|recommendation|collaborative|content.?based/gi,
        anomaly: /anomaly|outlier|fraud|detection/gi,
        optimization: /optimization|optimize|hyperparameter|grid.?search/gi
      }
    };

    this.dataPatterns = {
      preprocessing: /preprocess|normalize|standardize|feature.?engineering|data.?cleaning/gi,
      augmentation: /augment|augmentation|rotate|flip|crop|noise/gi,
      validation: /validation|cross.?validation|train.?test.?split|holdout/gi,
      evaluation: /evaluate|metrics|accuracy|precision|recall|f1|auc|mse|mae/gi
    };

    this.deploymentPatterns = {
      api: /flask|fastapi|django|express|api|endpoint/gi,
      cloud: /aws|gcp|azure|cloud|sagemaker|vertex|ml.?studio/gi,
      edge: /edge|mobile|tflite|onnx|tensorrt|quantization/gi,
      batch: /batch|scheduled|pipeline|airflow|luigi/gi,
      realtime: /realtime|streaming|kafka|websocket|live/gi
    };
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, packageJson, files } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          framework: await this.detectAIFramework(packageJson || projectPath),
          models: await this.analyzeMLModels(files || projectPath),
          data: await this.analyzeDataProcessing(files || projectPath),
          training: await this.analyzeTrainingPipeline(files || projectPath),
          inference: await this.analyzeInferencePipeline(files || projectPath),
          evaluation: await this.analyzeModelEvaluation(files || projectPath),
          deployment: await this.analyzeDeploymentStrategy(files || projectPath),
          ethics: await this.analyzeEthicsAndBias(files || projectPath),
          performance: await this.analyzePerformanceOptimization(files || projectPath),
          research: await this.analyzeResearchAspects(files || projectPath)
        };

        results.summary = this.generateAISummary(results);
        results.metrics = this.generateAIMetrics(results);
        results.recommendations = this.generateAIRecommendations(results);
        results.complexity = this.calculateAIComplexity(results);
        results.maturity = this.assessAIMaturity(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'ai',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async detectAIFramework(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const framework = {
        primary: 'unknown',
        secondary: [],
        packages: [],
        confidence: 0,
        language: 'unknown'
      };

      // Check for Python-based projects
      const projectPath = typeof packageJsonPath === 'string' ? 
        (packageJsonPath.endsWith('package.json') ? path.dirname(packageJsonPath) : packageJsonPath) : 
        '.';
      
      if (await FileUtils.fileExists(path.join(projectPath, 'requirements.txt')) ||
          await FileUtils.fileExists(path.join(projectPath, 'setup.py')) ||
          await FileUtils.fileExists(path.join(projectPath, 'pyproject.toml'))) {
        framework.language = 'python';
        
        // Read Python requirements
        const requirementsPath = path.join(projectPath, 'requirements.txt');
        if (await FileUtils.fileExists(requirementsPath)) {
          const requirements = await FileUtils.readFile(requirementsPath);
          if (requirements) {
            framework.packages = this.parsePythonRequirements(requirements);
          }
        }
      }

      if (packageJson) {
        framework.language = framework.language === 'unknown' ? 'javascript' : framework.language;
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        let maxConfidence = 0;
        for (const [frameworkName, config] of Object.entries(this.aiFrameworks)) {
          const foundPackages = config.packages.filter(pkg => 
            Object.keys(deps).some(dep => dep.includes(pkg))
          );
          
          if (foundPackages.length > 0) {
            const confidence = Math.min(100, (foundPackages.length / config.packages.length) * 100 + 30);
            
            if (confidence > maxConfidence) {
              framework.primary = frameworkName;
              framework.confidence = confidence;
              maxConfidence = confidence;
            } else if (confidence > 50) {
              framework.secondary.push(frameworkName);
            }
            
            framework.packages.push(...foundPackages.map(pkg => ({
              name: pkg,
              version: deps[pkg] || 'unknown',
              framework: frameworkName
            })));
          }
        }
      }

      // Analyze Python packages if available
      if (framework.language === 'python' && framework.packages.length > 0) {
        this.analyzePythonAIPackages(framework);
      }

      return framework;
    } catch (error) {
      logger.error('AI framework detection failed:', error);
      return { primary: 'unknown', secondary: [], packages: [], confidence: 0 };
    }
  }

  parsePythonRequirements(requirements) {
    const packages = [];
    const lines = requirements.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const packageMatch = trimmed.match(/^([a-zA-Z0-9\-_]+)/);
        if (packageMatch) {
          packages.push({
            name: packageMatch[1],
            version: trimmed.includes('==') ? trimmed.split('==')[1] : 'unknown'
          });
        }
      }
    }
    
    return packages;
  }

  analyzePythonAIPackages(framework) {
    const aiPackages = [
      'tensorflow', 'torch', 'keras', 'scikit-learn', 'transformers',
      'openai', 'anthropic', 'langchain', 'numpy', 'pandas', 'matplotlib'
    ];
    
    let maxCount = 0;
    let primaryFramework = 'unknown';
    
    for (const [fwName, config] of Object.entries(this.aiFrameworks)) {
      const count = framework.packages.filter(pkg => 
        config.packages.some(aiPkg => pkg.name.includes(aiPkg))
      ).length;
      
      if (count > maxCount) {
        maxCount = count;
        primaryFramework = fwName;
      }
    }
    
    if (maxCount > 0) {
      framework.primary = primaryFramework;
      framework.confidence = Math.min(100, maxCount * 25 + 30);
    }
  }

  async analyzeMLModels(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => {
          const ext = path.extname(file);
          return ['.py', '.js', '.ts', '.ipynb', '.h5', '.pkl', '.pt', '.onnx'].includes(ext);
        });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const models = {
        types: {},
        techniques: {},
        architectures: [],
        pretrained: [],
        custom: []
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Analyze model types and patterns
      for (const [modelType, pattern] of Object.entries(this.aiPatterns.models)) {
        const matches = totalContent.match(pattern) || [];
        models.types[modelType] = {
          detected: matches.length > 0,
          count: matches.length,
          keywords: [...new Set(matches.map(m => m.toLowerCase()))]
        };
      }

      // Analyze AI techniques
      for (const [technique, pattern] of Object.entries(this.aiPatterns.techniques)) {
        const matches = totalContent.match(pattern) || [];
        models.techniques[technique] = {
          detected: matches.length > 0,
          count: matches.length,
          confidence: this.calculateTechniqueConfidence(matches, totalContent)
        };
      }

      // Detect specific architectures
      models.architectures = this.detectModelArchitectures(totalContent);
      models.pretrained = this.detectPretrainedModels(totalContent);
      models.custom = this.detectCustomModels(files);

      models.summary = {
        totalModelTypes: Object.values(models.types).filter(t => t.detected).length,
        primaryTechniques: this.identifyPrimaryTechniques(models.techniques),
        architectureCount: models.architectures.length,
        pretrainedCount: models.pretrained.length,
        customModelCount: models.custom.length
      };

      return models;
    } catch (error) {
      logger.error('ML models analysis failed:', error);
      return {};
    }
  }

  calculateTechniqueConfidence(matches, content) {
    if (matches.length === 0) return 0;
    
    const density = matches.length / (content.length / 1000); // matches per 1000 chars
    return Math.min(100, Math.round(density * 20));
  }

  detectModelArchitectures(content) {
    const architectures = [];
    const architecturePatterns = {
      'CNN': /cnn|conv|convolution/gi,
      'RNN': /rnn|lstm|gru/gi,
      'Transformer': /transformer|bert|gpt|attention/gi,
      'ResNet': /resnet|residual/gi,
      'VGG': /vgg/gi,
      'YOLO': /yolo|you.?only.?look.?once/gi,
      'U-Net': /unet|u.?net/gi,
      'GAN': /gan|generative.?adversarial/gi
    };

    for (const [arch, pattern] of Object.entries(architecturePatterns)) {
      if (pattern.test(content)) {
        architectures.push(arch);
      }
    }

    return architectures;
  }

  detectPretrainedModels(content) {
    const pretrained = [];
    const pretrainedPatterns = {
      'BERT': /bert|roberta|distilbert/gi,
      'GPT': /gpt|gpt-2|gpt-3|gpt-4/gi,
      'T5': /t5|text.?to.?text/gi,
      'ResNet': /resnet50|resnet101|resnet152/gi,
      'VGG': /vgg16|vgg19/gi,
      'MobileNet': /mobilenet/gi,
      'CLIP': /clip/gi,
      'DALL-E': /dall.?e|dalle/gi
    };

    for (const [model, pattern] of Object.entries(pretrainedPatterns)) {
      if (pattern.test(content)) {
        pretrained.push(model);
      }
    }

    return pretrained;
  }

  detectCustomModels(files) {
    const custom = [];
    
    for (const file of files) {
      const fileName = path.basename(file, path.extname(file));
      
      // Look for model-related file names
      if (/model|network|architecture/i.test(fileName)) {
        custom.push({
          name: fileName,
          file: file,
          type: 'custom'
        });
      }
    }
    
    return custom;
  }

  identifyPrimaryTechniques(techniques) {
    return Object.entries(techniques)
      .filter(([_, data]) => data.detected && data.confidence > 30)
      .sort(([_, a], [__, b]) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(([name, _]) => name);
  }

  async analyzeDataProcessing(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => {
          const ext = path.extname(file);
          return ['.py', '.js', '.ts', '.ipynb'].includes(ext);
        });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const data = {
        preprocessing: {},
        sources: [],
        formats: [],
        pipelines: []
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Analyze data preprocessing patterns
      for (const [technique, pattern] of Object.entries(this.dataPatterns)) {
        const matches = totalContent.match(pattern) || [];
        data.preprocessing[technique] = {
          detected: matches.length > 0,
          count: matches.length,
          keywords: [...new Set(matches.map(m => m.toLowerCase()))]
        };
      }

      // Detect data sources
      data.sources = this.detectDataSources(totalContent);
      data.formats = this.detectDataFormats(totalContent);
      data.pipelines = this.detectDataPipelines(files);

      data.summary = {
        preprocessingTechniques: Object.values(data.preprocessing).filter(p => p.detected).length,
        dataSources: data.sources.length,
        supportedFormats: data.formats.length,
        pipelineComplexity: this.calculatePipelineComplexity(data.pipelines)
      };

      return data;
    } catch (error) {
      logger.error('Data processing analysis failed:', error);
      return {};
    }
  }

  detectDataSources(content) {
    const sources = [];
    const sourcePatterns = {
      'CSV': /csv|comma.?separated/gi,
      'JSON': /json/gi,
      'Database': /sql|database|db|postgres|mysql|sqlite/gi,
      'API': /api|rest|graphql|endpoint/gi,
      'Files': /file|directory|folder/gi,
      'Streaming': /stream|kafka|kinesis|pubsub/gi,
      'Cloud Storage': /s3|gcs|azure.?storage|blob/gi
    };

    for (const [source, pattern] of Object.entries(sourcePatterns)) {
      if (pattern.test(content)) {
        sources.push(source);
      }
    }

    return sources;
  }

  detectDataFormats(content) {
    const formats = [];
    const formatPatterns = {
      'Images': /jpg|jpeg|png|gif|bmp|tiff|cv2|pil|image/gi,
      'Text': /text|string|nlp|tokeniz/gi,
      'Audio': /audio|wav|mp3|sound|speech/gi,
      'Video': /video|mp4|avi|frame|opencv/gi,
      'Tabular': /csv|dataframe|table|pandas/gi,
      'Time Series': /time.?series|temporal|sequential/gi,
      'Graph': /graph|network|node|edge/gi
    };

    for (const [format, pattern] of Object.entries(formatPatterns)) {
      if (pattern.test(content)) {
        formats.push(format);
      }
    }

    return formats;
  }

  detectDataPipelines(files) {
    const pipelines = [];
    
    for (const file of files) {
      const fileName = path.basename(file);
      
      if (/pipeline|etl|preprocess|transform/i.test(fileName)) {
        pipelines.push({
          name: fileName,
          file: file,
          type: 'pipeline'
        });
      }
    }
    
    return pipelines;
  }

  calculatePipelineComplexity(pipelines) {
    if (pipelines.length === 0) return 0;
    if (pipelines.length <= 2) return 1;
    if (pipelines.length <= 5) return 2;
    return 3;
  }

  async analyzeTrainingPipeline(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => {
          const ext = path.extname(file);
          return ['.py', '.js', '.ts', '.ipynb'].includes(ext);
        });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const training = {
        scripts: [],
        optimization: {},
        monitoring: {},
        checkpoints: false,
        distributed: false
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) {
          totalContent += content + ' ';
          
          // Detect training scripts
          if (/train|training|fit|learn/i.test(path.basename(file))) {
            training.scripts.push({
              name: path.basename(file),
              file: file
            });
          }
        }
      }

      // Analyze optimization techniques
      training.optimization = this.analyzeOptimization(totalContent);
      training.monitoring = this.analyzeTrainingMonitoring(totalContent);
      training.checkpoints = /checkpoint|save.?model|model.?save/gi.test(totalContent);
      training.distributed = /distributed|parallel|multi.?gpu|horovod/gi.test(totalContent);

      training.summary = {
        trainingScripts: training.scripts.length,
        optimizationTechniques: Object.values(training.optimization).filter(o => o.detected).length,
        monitoringEnabled: Object.values(training.monitoring).filter(m => m.detected).length > 0,
        checkpointingEnabled: training.checkpoints,
        distributedTraining: training.distributed
      };

      return training;
    } catch (error) {
      logger.error('Training pipeline analysis failed:', error);
      return {};
    }
  }

  analyzeOptimization(content) {
    const optimization = {};
    const optimizationPatterns = {
      sgd: /sgd|stochastic.?gradient/gi,
      adam: /adam|adamw/gi,
      learning_rate: /learning.?rate|lr.?scheduler/gi,
      regularization: /regularization|dropout|batch.?norm|l1|l2/gi,
      early_stopping: /early.?stopping|patience/gi,
      hyperparameter: /hyperparameter|grid.?search|random.?search|optuna/gi
    };

    for (const [technique, pattern] of Object.entries(optimizationPatterns)) {
      const matches = content.match(pattern) || [];
      optimization[technique] = {
        detected: matches.length > 0,
        count: matches.length
      };
    }

    return optimization;
  }

  analyzeTrainingMonitoring(content) {
    const monitoring = {};
    const monitoringPatterns = {
      logging: /log|logger|wandb|tensorboard|mlflow/gi,
      metrics: /accuracy|loss|precision|recall|f1|auc/gi,
      visualization: /plot|chart|matplotlib|seaborn|plotly/gi,
      tracking: /track|experiment|version|mlflow|wandb/gi
    };

    for (const [aspect, pattern] of Object.entries(monitoringPatterns)) {
      const matches = content.match(pattern) || [];
      monitoring[aspect] = {
        detected: matches.length > 0,
        count: matches.length
      };
    }

    return monitoring;
  }

  async analyzeInferencePipeline(filesOrPath) {
    // Mock inference analysis
    return {
      deployment: {
        api: { implemented: false, framework: 'none' },
        batch: { implemented: false },
        realtime: { implemented: false },
        edge: { implemented: false }
      },
      optimization: {
        quantization: false,
        pruning: false,
        distillation: false,
        caching: false
      },
      monitoring: {
        performance: false,
        accuracy: false,
        drift: false
      },
      summary: {
        deploymentTypes: 0,
        optimizationTechniques: 0,
        monitoringCapabilities: 0
      }
    };
  }

  async analyzeModelEvaluation(filesOrPath) {
    // Mock evaluation analysis
    return {
      metrics: {
        classification: ['accuracy', 'precision', 'recall'],
        regression: ['mse', 'mae', 'r2'],
        custom: []
      },
      validation: {
        crossValidation: false,
        holdout: false,
        temporal: false
      },
      testing: {
        unitTests: false,
        integrationTests: false,
        performanceTests: false
      },
      summary: {
        evaluationMetrics: 3,
        validationStrategies: 0,
        testingCoverage: 0
      }
    };
  }

  async analyzeDeploymentStrategy(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const deployment = {
        strategies: {},
        platforms: [],
        containerization: false,
        cicd: false
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Analyze deployment patterns
      for (const [strategy, pattern] of Object.entries(this.deploymentPatterns)) {
        const matches = totalContent.match(pattern) || [];
        deployment.strategies[strategy] = {
          detected: matches.length > 0,
          count: matches.length
        };
      }

      // Detect platforms and tools
      deployment.platforms = this.detectDeploymentPlatforms(totalContent);
      deployment.containerization = /docker|container|kubernetes|k8s/gi.test(totalContent);
      deployment.cicd = /github.?actions|jenkins|gitlab.?ci|azure.?devops|circleci/gi.test(totalContent);

      deployment.summary = {
        deploymentStrategies: Object.values(deployment.strategies).filter(s => s.detected).length,
        supportedPlatforms: deployment.platforms.length,
        containerized: deployment.containerization,
        cicdEnabled: deployment.cicd
      };

      return deployment;
    } catch (error) {
      logger.error('Deployment strategy analysis failed:', error);
      return {};
    }
  }

  detectDeploymentPlatforms(content) {
    const platforms = [];
    const platformPatterns = {
      'AWS': /aws|sagemaker|lambda|ec2|s3/gi,
      'GCP': /gcp|vertex|cloud.?run|app.?engine/gi,
      'Azure': /azure|ml.?studio|cognitive/gi,
      'Heroku': /heroku/gi,
      'Vercel': /vercel/gi,
      'Railway': /railway/gi,
      'Docker': /docker|container/gi,
      'Kubernetes': /kubernetes|k8s/gi
    };

    for (const [platform, pattern] of Object.entries(platformPatterns)) {
      if (pattern.test(content)) {
        platforms.push(platform);
      }
    }

    return platforms;
  }

  async analyzeEthicsAndBias(filesOrPath) {
    // Mock ethics analysis
    return {
      bias: {
        detection: false,
        mitigation: false,
        fairness: false
      },
      privacy: {
        dataProtection: false,
        anonymization: false,
        encryption: false
      },
      transparency: {
        explainability: false,
        interpretability: false,
        documentation: false
      },
      summary: {
        ethicsScore: 0,
        complianceLevel: 'basic'
      }
    };
  }

  async analyzePerformanceOptimization(filesOrPath) {
    // Mock performance analysis
    return {
      computation: {
        gpu: false,
        tpu: false,
        multicore: false,
        vectorization: false
      },
      memory: {
        optimization: false,
        streaming: false,
        caching: false
      },
      model: {
        quantization: false,
        pruning: false,
        distillation: false,
        compression: false
      },
      summary: {
        optimizationLevel: 'basic',
        performanceScore: 50
      }
    };
  }

  async analyzeResearchAspects(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const research = {
        notebooks: [],
        experiments: [],
        papers: [],
        reproducibility: false
      };

      for (const file of files) {
        const ext = path.extname(file);
        const fileName = path.basename(file);
        
        if (ext === '.ipynb') {
          research.notebooks.push(fileName);
        }
        
        if (/experiment|research|study/i.test(fileName)) {
          research.experiments.push(fileName);
        }
        
        if (ext === '.pdf' || /paper|article|thesis/i.test(fileName)) {
          research.papers.push(fileName);
        }
      }

      // Check for reproducibility indicators
      const reproducibilityFiles = ['requirements.txt', 'environment.yml', 'Dockerfile', 'README.md'];
      let reproducibilityScore = 0;
      
      for (const file of reproducibilityFiles) {
        const projectPath = typeof filesOrPath === 'string' ? filesOrPath : '.';
        if (await FileUtils.fileExists(path.join(projectPath, file))) {
          reproducibilityScore++;
        }
      }
      
      research.reproducibility = reproducibilityScore >= 2;

      research.summary = {
        notebookCount: research.notebooks.length,
        experimentCount: research.experiments.length,
        paperCount: research.papers.length,
        reproducibilityScore: reproducibilityScore,
        researchOriented: research.notebooks.length > 0 || research.experiments.length > 0
      };

      return research;
    } catch (error) {
      logger.error('Research aspects analysis failed:', error);
      return {};
    }
  }

  calculateAIComplexity(analysis) {
    let complexity = 0;
    
    // Framework complexity
    const frameworkComplexity = {
      tensorflow: 7,
      pytorch: 8,
      huggingface: 6,
      scikit: 4,
      openai: 3,
      anthropic: 3,
      langchain: 5
    };
    complexity += frameworkComplexity[analysis.framework?.primary] || 3;
    
    // Model complexity
    complexity += (analysis.models?.summary?.totalModelTypes || 0) * 2;
    complexity += (analysis.models?.summary?.architectureCount || 0) * 3;
    
    // Data complexity
    complexity += (analysis.data?.summary?.preprocessingTechniques || 0);
    complexity += (analysis.data?.summary?.pipelineComplexity || 0) * 2;
    
    // Training complexity
    complexity += (analysis.training?.summary?.optimizationTechniques || 0);
    if (analysis.training?.summary?.distributedTraining) complexity += 5;
    
    // Deployment complexity
    complexity += (analysis.deployment?.summary?.deploymentStrategies || 0) * 2;
    complexity += (analysis.deployment?.summary?.supportedPlatforms || 0);
    
    return {
      score: complexity,
      level: this.getComplexityLevel(complexity),
      factors: {
        framework: analysis.framework?.primary,
        models: analysis.models?.summary?.totalModelTypes || 0,
        data: analysis.data?.summary?.preprocessingTechniques || 0,
        training: analysis.training?.summary?.optimizationTechniques || 0,
        deployment: analysis.deployment?.summary?.deploymentStrategies || 0
      }
    };
  }

  getComplexityLevel(score) {
    if (score < 15) return 'low';
    if (score < 30) return 'medium';
    if (score < 50) return 'high';
    return 'very high';
  }

  assessAIMaturity(analysis) {
    const factors = [
      (analysis.framework?.confidence || 0) > 80,
      (analysis.models?.summary?.totalModelTypes || 0) > 2,
      (analysis.data?.summary?.preprocessingTechniques || 0) > 3,
      analysis.training?.summary?.monitoringEnabled,
      analysis.evaluation?.summary?.evaluationMetrics > 2,
      analysis.deployment?.summary?.deploymentStrategies > 0,
      analysis.research?.summary?.reproducibilityScore > 2
    ];

    const maturityScore = factors.filter(Boolean).length;
    
    if (maturityScore >= 6) return 'production';
    if (maturityScore >= 4) return 'development';
    if (maturityScore >= 2) return 'prototype';
    return 'research';
  }

  generateAISummary(analysis) {
    const framework = analysis.framework?.primary || 'unknown';
    const models = analysis.models?.summary?.totalModelTypes || 0;
    const techniques = analysis.models?.summary?.primaryTechniques?.join(', ') || 'unknown';

    return {
      overview: `${framework} AI project with ${models} model types focusing on ${techniques}`,
      framework: analysis.framework,
      complexity: analysis.complexity?.level || 'unknown',
      maturity: analysis.maturity || 'unknown',
      primaryTechniques: analysis.models?.summary?.primaryTechniques || [],
      recommendations: this.generateAIRecommendations(analysis).slice(0, 3)
    };
  }

  generateAIMetrics(analysis) {
    return {
      frameworkConfidence: analysis.framework?.confidence || 0,
      modelComplexity: analysis.models?.summary?.totalModelTypes || 0,
      dataProcessingScore: analysis.data?.summary?.preprocessingTechniques || 0,
      trainingMaturity: this.calculateTrainingMaturity(analysis.training),
      deploymentReadiness: this.calculateDeploymentReadiness(analysis.deployment),
      researchOrientation: analysis.research?.summary?.researchOriented ? 100 : 0,
      ethicsScore: analysis.ethics?.summary?.ethicsScore || 0,
      performanceScore: analysis.performance?.summary?.performanceScore || 0,
      overallComplexity: analysis.complexity?.score || 0
    };
  }

  calculateTrainingMaturity(training) {
    if (!training) return 0;
    
    let score = 0;
    if (training.summary?.trainingScripts > 0) score += 25;
    if (training.summary?.optimizationTechniques > 2) score += 25;
    if (training.summary?.monitoringEnabled) score += 25;
    if (training.summary?.checkpointingEnabled) score += 25;
    
    return score;
  }

  calculateDeploymentReadiness(deployment) {
    if (!deployment) return 0;
    
    let score = 0;
    if (deployment.summary?.deploymentStrategies > 0) score += 30;
    if (deployment.summary?.supportedPlatforms > 0) score += 30;
    if (deployment.summary?.containerized) score += 20;
    if (deployment.summary?.cicdEnabled) score += 20;
    
    return score;
  }

  generateAIRecommendations(analysis) {
    const recommendations = [];

    if ((analysis.framework?.confidence || 0) < 70) {
      recommendations.push({
        type: 'framework',
        priority: 'medium',
        message: 'AI framework detection confidence is low',
        action: 'Verify AI/ML dependencies and imports'
      });
    }

    if (!analysis.training?.summary?.monitoringEnabled) {
      recommendations.push({
        type: 'training',
        priority: 'high',
        message: 'No training monitoring detected',
        action: 'Implement logging with TensorBoard, WandB, or MLflow'
      });
    }

    if ((analysis.models?.summary?.totalModelTypes || 0) === 0) {
      recommendations.push({
        type: 'models',
        priority: 'critical',
        message: 'No ML models detected in the project',
        action: 'Add model definitions or imports'
      });
    }

    if (!analysis.evaluation?.summary?.evaluationMetrics) {
      recommendations.push({
        type: 'evaluation',
        priority: 'high',
        message: 'No model evaluation metrics detected',
        action: 'Implement proper model evaluation with metrics'
      });
    }

    if ((analysis.data?.summary?.preprocessingTechniques || 0) < 2) {
      recommendations.push({
        type: 'data',
        priority: 'medium',
        message: 'Limited data preprocessing detected',
        action: 'Implement comprehensive data preprocessing pipeline'
      });
    }

    if (!analysis.deployment?.summary?.deploymentStrategies) {
      recommendations.push({
        type: 'deployment',
        priority: 'medium',
        message: 'No deployment strategy detected',
        action: 'Plan and implement model deployment strategy'
      });
    }

    if (analysis.ethics?.summary?.ethicsScore < 30) {
      recommendations.push({
        type: 'ethics',
        priority: 'medium',
        message: 'Consider ethics and bias mitigation',
        action: 'Implement fairness checks and bias detection'
      });
    }

    if (!analysis.research?.summary?.reproducibilityScore || analysis.research.summary.reproducibilityScore < 2) {
      recommendations.push({
        type: 'reproducibility',
        priority: 'low',
        message: 'Improve experiment reproducibility',
        action: 'Add requirements.txt, environment setup, and documentation'
      });
    }

    return recommendations;
  }
}

module.exports = { AIAnalyzer };