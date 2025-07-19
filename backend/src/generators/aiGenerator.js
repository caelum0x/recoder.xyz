const { BaseGenerator } = require('./baseGenerator');
const { logger } = require('../utils/logger');

class AIGenerator extends BaseGenerator {
  constructor(options = {}) {
    super(options);
    this.registerAITemplates();
  }

  registerAITemplates() {
    this.registerTemplate('pythonModel', (data) => this.generatePythonModel(data));
    this.registerTemplate('tensorflowModel', (data) => this.generateTensorFlowModel(data));
    this.registerTemplate('pytorchModel', (data) => this.generatePyTorchModel(data));
    this.registerTemplate('dataProcessor', (data) => this.generateDataProcessor(data));
    this.registerTemplate('trainingScript', (data) => this.generateTrainingScript(data));
    this.registerTemplate('inferenceAPI', (data) => this.generateInferenceAPI(data));
  }

  async generate(input, context = {}) {
    try {
      this.validateInput(input, ['framework', 'projectName']);
      
      const config = this.mergeConfigurations(this.getDefaultAIConfig(), input, context);
      const structure = await this.generateAIStructure(config);
      
      return this.createGenerationResult(true, { framework: input.framework });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  getDefaultAIConfig() {
    return {
      framework: 'tensorflow',
      modelType: 'classification',
      dataType: 'tabular',
      deployment: 'api'
    };
  }

  async generateAIStructure(config) {
    return {
      'src': {
        'models': {
          'model.py': { template: config.framework === 'pytorch' ? 'pytorchModel' : 'tensorflowModel', data: config }
        },
        'data': {
          'processor.py': { template: 'dataProcessor', data: config }
        },
        'training': {
          'train.py': { template: 'trainingScript', data: config }
        },
        'api': {
          'app.py': { template: 'inferenceAPI', data: config }
        }
      },
      'requirements.txt': this.generateRequirements(config),
      'config.yaml': this.generateConfig(config)
    };
  }

  generateTensorFlowModel(data) {
    return `import tensorflow as tf
from tensorflow.keras import layers, models
import numpy as np

class ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model:
    """
    ${data.modelType.charAt(0).toUpperCase() + data.modelType.slice(1)} model for ${data.projectName}
    """
    
    def __init__(self, input_shape, num_classes=None):
        self.input_shape = input_shape
        self.num_classes = num_classes or 2
        self.model = None
        
    def build_model(self):
        """Build and compile the model"""
        model = models.Sequential([
            layers.Input(shape=self.input_shape),
            layers.Dense(128, activation='relu'),
            layers.Dropout(0.2),
            layers.Dense(64, activation='relu'),
            layers.Dropout(0.2),
            layers.Dense(32, activation='relu'),
            layers.Dense(self.num_classes, activation='softmax' if self.num_classes > 1 else 'sigmoid')
        ])
        
        model.compile(
            optimizer='adam',
            loss='categorical_crossentropy' if self.num_classes > 1 else 'binary_crossentropy',
            metrics=['accuracy']
        )
        
        self.model = model
        return model
    
    def train(self, X_train, y_train, X_val=None, y_val=None, epochs=50, batch_size=32):
        """Train the model"""
        if self.model is None:
            self.build_model()
            
        callbacks = [
            tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(patience=5, factor=0.5)
        ]
        
        validation_data = (X_val, y_val) if X_val is not None and y_val is not None else None
        
        history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_data=validation_data,
            callbacks=callbacks,
            verbose=1
        )
        
        return history
    
    def predict(self, X):
        """Make predictions"""
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        return self.model.predict(X)
    
    def evaluate(self, X_test, y_test):
        """Evaluate the model"""
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        return self.model.evaluate(X_test, y_test)
    
    def save(self, filepath):
        """Save the model"""
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        self.model.save(filepath)
    
    def load(self, filepath):
        """Load a saved model"""
        self.model = tf.keras.models.load_model(filepath)
        return self.model`;
  }

  generatePyTorchModel(data) {
    return `import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np

class ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model(nn.Module):
    """
    ${data.modelType.charAt(0).toUpperCase() + data.modelType.slice(1)} model for ${data.projectName}
    """
    
    def __init__(self, input_size, num_classes=2, hidden_sizes=[128, 64, 32]):
        super(${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model, self).__init__()
        
        self.input_size = input_size
        self.num_classes = num_classes
        
        # Build layers
        layers = []
        prev_size = input_size
        
        for hidden_size in hidden_sizes:
            layers.extend([
                nn.Linear(prev_size, hidden_size),
                nn.ReLU(),
                nn.Dropout(0.2)
            ])
            prev_size = hidden_size
        
        # Output layer
        layers.append(nn.Linear(prev_size, num_classes))
        
        self.network = nn.Sequential(*layers)
        self.criterion = nn.CrossEntropyLoss() if num_classes > 1 else nn.BCEWithLogitsLoss()
        self.optimizer = None
        
    def forward(self, x):
        return self.network(x)
    
    def train_model(self, train_loader, val_loader=None, epochs=50, lr=0.001):
        """Train the model"""
        self.optimizer = optim.Adam(self.parameters(), lr=lr)
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(self.optimizer, patience=5)
        
        train_losses = []
        val_losses = []
        
        for epoch in range(epochs):
            # Training phase
            self.train()
            train_loss = 0.0
            for batch_idx, (data, target) in enumerate(train_loader):
                self.optimizer.zero_grad()
                output = self.forward(data)
                loss = self.criterion(output, target)
                loss.backward()
                self.optimizer.step()
                train_loss += loss.item()
            
            avg_train_loss = train_loss / len(train_loader)
            train_losses.append(avg_train_loss)
            
            # Validation phase
            if val_loader:
                self.eval()
                val_loss = 0.0
                with torch.no_grad():
                    for data, target in val_loader:
                        output = self.forward(data)
                        val_loss += self.criterion(output, target).item()
                
                avg_val_loss = val_loss / len(val_loader)
                val_losses.append(avg_val_loss)
                scheduler.step(avg_val_loss)
                
                print(f'Epoch {epoch+1}/{epochs}, Train Loss: {avg_train_loss:.4f}, Val Loss: {avg_val_loss:.4f}')
            else:
                print(f'Epoch {epoch+1}/{epochs}, Train Loss: {avg_train_loss:.4f}')
        
        return train_losses, val_losses
    
    def predict(self, X):
        """Make predictions"""
        self.eval()
        with torch.no_grad():
            X_tensor = torch.FloatTensor(X) if not isinstance(X, torch.Tensor) else X
            outputs = self.forward(X_tensor)
            if self.num_classes > 1:
                _, predicted = torch.max(outputs.data, 1)
                return predicted.numpy()
            else:
                return torch.sigmoid(outputs).numpy()
    
    def evaluate(self, test_loader):
        """Evaluate the model"""
        self.eval()
        correct = 0
        total = 0
        test_loss = 0.0
        
        with torch.no_grad():
            for data, target in test_loader:
                outputs = self.forward(data)
                test_loss += self.criterion(outputs, target).item()
                
                if self.num_classes > 1:
                    _, predicted = torch.max(outputs.data, 1)
                    total += target.size(0)
                    correct += (predicted == target).sum().item()
                else:
                    predicted = torch.sigmoid(outputs) > 0.5
                    total += target.size(0)
                    correct += (predicted.squeeze() == target).sum().item()
        
        accuracy = 100 * correct / total
        avg_loss = test_loss / len(test_loader)
        
        return accuracy, avg_loss
    
    def save_model(self, filepath):
        """Save the model"""
        torch.save({
            'model_state_dict': self.state_dict(),
            'input_size': self.input_size,
            'num_classes': self.num_classes,
        }, filepath)
    
    def load_model(self, filepath):
        """Load a saved model"""
        checkpoint = torch.load(filepath)
        self.load_state_dict(checkpoint['model_state_dict'])
        return self`;
  }

  generateDataProcessor(data) {
    return `import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, LabelEncoder, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
import joblib

class DataProcessor:
    """
    Data preprocessing pipeline for ${data.projectName}
    """
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.imputer = SimpleImputer(strategy='median')
        self.feature_names = None
        self.target_name = None
        
    def load_data(self, file_path, target_column=None):
        """Load data from file"""
        if file_path.endswith('.csv'):
            data = pd.read_csv(file_path)
        elif file_path.endswith('.json'):
            data = pd.read_json(file_path)
        else:
            raise ValueError("Unsupported file format. Use CSV or JSON.")
        
        self.target_name = target_column
        return data
    
    def preprocess_features(self, df, fit=True):
        """Preprocess feature columns"""
        # Separate numeric and categorical columns
        numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_columns = df.select_dtypes(include=['object']).columns.tolist()
        
        # Remove target column if present
        if self.target_name in numeric_columns:
            numeric_columns.remove(self.target_name)
        if self.target_name in categorical_columns:
            categorical_columns.remove(self.target_name)
        
        processed_df = df.copy()
        
        # Handle missing values
        if numeric_columns:
            if fit:
                processed_df[numeric_columns] = self.imputer.fit_transform(processed_df[numeric_columns])
            else:
                processed_df[numeric_columns] = self.imputer.transform(processed_df[numeric_columns])
        
        # Handle categorical variables
        for col in categorical_columns:
            if fit:
                processed_df[col] = self.label_encoder.fit_transform(processed_df[col].astype(str))
            else:
                # Handle unseen categories
                processed_df[col] = processed_df[col].astype(str)
                unseen_mask = ~processed_df[col].isin(self.label_encoder.classes_)
                processed_df.loc[unseen_mask, col] = 'unknown'
                processed_df[col] = self.label_encoder.transform(processed_df[col])
        
        # Scale features
        feature_columns = numeric_columns + categorical_columns
        if feature_columns:
            if fit:
                processed_df[feature_columns] = self.scaler.fit_transform(processed_df[feature_columns])
            else:
                processed_df[feature_columns] = self.scaler.transform(processed_df[feature_columns])
        
        self.feature_names = feature_columns
        return processed_df[feature_columns]
    
    def preprocess_target(self, target, fit=True):
        """Preprocess target variable"""
        if target.dtype == 'object':
            if fit:
                return self.label_encoder.fit_transform(target)
            else:
                return self.label_encoder.transform(target)
        return target.values
    
    def prepare_data(self, df, target_column, test_size=0.2, random_state=42):
        """Complete data preparation pipeline"""
        # Separate features and target
        X = df.drop(columns=[target_column])
        y = df[target_column]
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=y
        )
        
        # Preprocess features
        X_train_processed = self.preprocess_features(X_train, fit=True)
        X_test_processed = self.preprocess_features(X_test, fit=False)
        
        # Preprocess target
        y_train_processed = self.preprocess_target(y_train, fit=True)
        y_test_processed = self.preprocess_target(y_test, fit=False)
        
        return X_train_processed, X_test_processed, y_train_processed, y_test_processed
    
    def create_validation_split(self, X_train, y_train, val_size=0.2, random_state=42):
        """Create validation split from training data"""
        return train_test_split(
            X_train, y_train, test_size=val_size, random_state=random_state
        )
    
    def save_preprocessors(self, filepath_prefix):
        """Save preprocessing objects"""
        joblib.dump(self.scaler, f"{filepath_prefix}_scaler.pkl")
        joblib.dump(self.label_encoder, f"{filepath_prefix}_label_encoder.pkl")
        joblib.dump(self.imputer, f"{filepath_prefix}_imputer.pkl")
        
        # Save feature names
        with open(f"{filepath_prefix}_features.txt", 'w') as f:
            if self.feature_names:
                f.write('\\n'.join(self.feature_names))
    
    def load_preprocessors(self, filepath_prefix):
        """Load preprocessing objects"""
        self.scaler = joblib.load(f"{filepath_prefix}_scaler.pkl")
        self.label_encoder = joblib.load(f"{filepath_prefix}_label_encoder.pkl")
        self.imputer = joblib.load(f"{filepath_prefix}_imputer.pkl")
        
        # Load feature names
        try:
            with open(f"{filepath_prefix}_features.txt", 'r') as f:
                self.feature_names = [line.strip() for line in f.readlines()]
        except FileNotFoundError:
            self.feature_names = None
    
    def get_feature_importance(self, model, top_n=10):
        """Get feature importance (for tree-based models)"""
        if hasattr(model, 'feature_importances_') and self.feature_names:
            importance_df = pd.DataFrame({
                'feature': self.feature_names,
                'importance': model.feature_importances_
            }).sort_values('importance', ascending=False)
            
            return importance_df.head(top_n)
        else:
            return None`;
  }

  generateTrainingScript(data) {
    return `#!/usr/bin/env python3
"""
Training script for ${data.projectName}
"""

import os
import sys
import argparse
import yaml
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from models.model import ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model
from data.processor import DataProcessor

def load_config(config_path):
    """Load configuration from YAML file"""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)

def plot_training_history(history, save_path=None):
    """Plot training history"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    
    # Plot loss
    ax1.plot(history.history['loss'], label='Training Loss')
    if 'val_loss' in history.history:
        ax1.plot(history.history['val_loss'], label='Validation Loss')
    ax1.set_title('Model Loss')
    ax1.set_xlabel('Epoch')
    ax1.set_ylabel('Loss')
    ax1.legend()
    
    # Plot accuracy
    ax2.plot(history.history['accuracy'], label='Training Accuracy')
    if 'val_accuracy' in history.history:
        ax2.plot(history.history['val_accuracy'], label='Validation Accuracy')
    ax2.set_title('Model Accuracy')
    ax2.set_xlabel('Epoch')
    ax2.set_ylabel('Accuracy')
    ax2.legend()
    
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path)
    plt.show()

def evaluate_model(model, X_test, y_test, class_names=None):
    """Evaluate model performance"""
    # Make predictions
    y_pred = model.predict(X_test)
    
    # Convert probabilities to class predictions if needed
    if len(y_pred.shape) > 1 and y_pred.shape[1] > 1:
        y_pred_classes = np.argmax(y_pred, axis=1)
    else:
        y_pred_classes = (y_pred > 0.5).astype(int)
    
    # Calculate accuracy
    accuracy = np.mean(y_pred_classes == y_test)
    print(f"Test Accuracy: {accuracy:.4f}")
    
    # Classification report
    print("\\nClassification Report:")
    print(classification_report(y_test, y_pred_classes, target_names=class_names))
    
    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred_classes)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                xticklabels=class_names, yticklabels=class_names)
    plt.title('Confusion Matrix')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.show()
    
    return accuracy, y_pred_classes

def main():
    parser = argparse.ArgumentParser(description='Train ${data.projectName} model')
    parser.add_argument('--config', default='config.yaml', help='Path to config file')
    parser.add_argument('--data', required=True, help='Path to training data')
    parser.add_argument('--target', required=True, help='Target column name')
    parser.add_argument('--output', default='models', help='Output directory for models')
    
    args = parser.parse_args()
    
    # Load configuration
    config = load_config(args.config)
    
    # Create output directory
    os.makedirs(args.output, exist_ok=True)
    
    # Initialize data processor
    processor = DataProcessor()
    
    # Load and preprocess data
    print("Loading and preprocessing data...")
    df = processor.load_data(args.data, args.target)
    X_train, X_test, y_train, y_test = processor.prepare_data(
        df, args.target, 
        test_size=config.get('test_size', 0.2),
        random_state=config.get('random_state', 42)
    )
    
    # Create validation split
    X_train, X_val, y_train, y_val = processor.create_validation_split(
        X_train, y_train,
        val_size=config.get('val_size', 0.2),
        random_state=config.get('random_state', 42)
    )
    
    print(f"Training set size: {X_train.shape}")
    print(f"Validation set size: {X_val.shape}")
    print(f"Test set size: {X_test.shape}")
    
    # Initialize model
    input_shape = X_train.shape[1:]
    num_classes = len(np.unique(y_train))
    
    model = ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model(input_shape, num_classes)
    
    # Train model
    print("\\nTraining model...")
    history = model.train(
        X_train, y_train,
        X_val, y_val,
        epochs=config.get('epochs', 50),
        batch_size=config.get('batch_size', 32)
    )
    
    # Plot training history
    plot_training_history(history, os.path.join(args.output, 'training_history.png'))
    
    # Evaluate model
    print("\\nEvaluating model...")
    class_names = [f'Class_{i}' for i in range(num_classes)]
    accuracy, predictions = evaluate_model(model, X_test, y_test, class_names)
    
    # Save model and preprocessors
    model_path = os.path.join(args.output, 'model')
    model.save(model_path)
    processor.save_preprocessors(os.path.join(args.output, 'preprocessor'))
    
    print(f"\\nModel saved to {model_path}")
    print(f"Final test accuracy: {accuracy:.4f}")

if __name__ == "__main__":
    main()`;
  }

  generateInferenceAPI(data) {
    return `from flask import Flask, request, jsonify
import numpy as np
import pandas as pd
import joblib
import os
import sys

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from models.model import ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model
from data.processor import DataProcessor

app = Flask(__name__)

# Global variables for model and processor
model = None
processor = None

def load_model_and_processor():
    """Load trained model and data processor"""
    global model, processor
    
    try:
        # Load model
        model = ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}Model(input_shape=(10,), num_classes=2)  # Adjust as needed
        model.load('models/model')
        
        # Load processor
        processor = DataProcessor()
        processor.load_preprocessors('models/preprocessor')
        
        print("Model and processor loaded successfully")
        return True
    except Exception as e:
        print(f"Error loading model: {e}")
        return False

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'processor_loaded': processor is not None
    })

@app.route('/predict', methods=['POST'])
def predict():
    """Make predictions on input data"""
    try:
        # Check if model is loaded
        if model is None or processor is None:
            return jsonify({
                'error': 'Model not loaded'
            }), 500
        
        # Get input data
        data = request.get_json()
        
        if 'data' not in data:
            return jsonify({
                'error': 'Missing data field in request'
            }), 400
        
        # Convert to DataFrame
        input_df = pd.DataFrame(data['data'])
        
        # Preprocess input
        X_processed = processor.preprocess_features(input_df, fit=False)
        
        # Make predictions
        predictions = model.predict(X_processed.values)
        
        # Convert predictions to list for JSON serialization
        if len(predictions.shape) > 1:
            predictions_list = predictions.tolist()
        else:
            predictions_list = predictions.tolist()
        
        return jsonify({
            'predictions': predictions_list,
            'num_samples': len(predictions_list)
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/predict/single', methods=['POST'])
def predict_single():
    """Make prediction on a single sample"""
    try:
        # Check if model is loaded
        if model is None or processor is None:
            return jsonify({
                'error': 'Model not loaded'
            }), 500
        
        # Get input data
        data = request.get_json()
        
        # Convert single sample to DataFrame
        input_df = pd.DataFrame([data])
        
        # Preprocess input
        X_processed = processor.preprocess_features(input_df, fit=False)
        
        # Make prediction
        prediction = model.predict(X_processed.values)
        
        # Convert to scalar if single prediction
        if len(prediction) == 1:
            prediction_value = float(prediction[0])
        else:
            prediction_value = prediction.tolist()
        
        return jsonify({
            'prediction': prediction_value
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.route('/model/info', methods=['GET'])
def model_info():
    """Get model information"""
    try:
        if model is None:
            return jsonify({
                'error': 'Model not loaded'
            }), 500
        
        return jsonify({
            'model_type': '${data.modelType}',
            'framework': '${data.framework}',
            'input_shape': getattr(model, 'input_shape', 'unknown'),
            'num_classes': getattr(model, 'num_classes', 'unknown'),
            'feature_names': getattr(processor, 'feature_names', [])
        })
        
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    # Load model and processor on startup
    if load_model_and_processor():
        print("Starting ${data.projectName} inference API...")
        app.run(host='0.0.0.0', port=5000, debug=False)
    else:
        print("Failed to load model. Exiting.")
        sys.exit(1)`;
  }

  generateRequirements(config) {
    const baseRequirements = [
      'numpy>=1.21.0',
      'pandas>=1.3.0',
      'scikit-learn>=1.0.0',
      'matplotlib>=3.4.0',
      'seaborn>=0.11.0',
      'joblib>=1.0.0',
      'pyyaml>=5.4.0',
      'flask>=2.0.0'
    ];

    if (config.framework === 'tensorflow') {
      baseRequirements.push('tensorflow>=2.8.0');
    } else if (config.framework === 'pytorch') {
      baseRequirements.push('torch>=1.11.0', 'torchvision>=0.12.0');
    }

    return baseRequirements.join('\n');
  }

  generateConfig(config) {
    return `# Configuration for ${config.projectName}

# Model parameters
model:
  type: "${config.modelType}"
  framework: "${config.framework}"

# Training parameters
training:
  epochs: 50
  batch_size: 32
  learning_rate: 0.001
  test_size: 0.2
  val_size: 0.2
  random_state: 42

# Data parameters
data:
  type: "${config.dataType}"
  preprocessing:
    scaling: "standard"
    handle_missing: "median"
    
# Deployment parameters
deployment:
  type: "${config.deployment}"
  port: 5000
  host: "0.0.0.0"`;
  }
}

module.exports = { AIGenerator };