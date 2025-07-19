const { BaseGenerator } = require('./baseGenerator');
const { logger } = require('../utils/logger');

class MobileGenerator extends BaseGenerator {
  constructor(options = {}) {
    super(options);
    this.registerMobileTemplates();
  }

  registerMobileTemplates() {
    this.registerTemplate('reactNativeComponent', (data) => this.generateReactNativeComponent(data));
    this.registerTemplate('reactNativeScreen', (data) => this.generateReactNativeScreen(data));
    this.registerTemplate('reactNativeApp', (data) => this.generateReactNativeApp(data));
    this.registerTemplate('flutterWidget', (data) => this.generateFlutterWidget(data));
    this.registerTemplate('flutterApp', (data) => this.generateFlutterApp(data));
  }

  async generate(input, context = {}) {
    try {
      this.validateInput(input, ['framework', 'projectName']);
      
      const config = this.mergeConfigurations(this.getDefaultMobileConfig(), input, context);
      const structure = await this.generateMobileStructure(config);
      
      return this.createGenerationResult(true, { framework: input.framework });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  getDefaultMobileConfig() {
    return {
      framework: 'react-native',
      navigation: true,
      stateManagement: 'context',
      components: ['Header', 'Button', 'Card']
    };
  }

  async generateMobileStructure(config) {
    if (config.framework === 'react-native') {
      return this.generateReactNativeStructure(config);
    } else if (config.framework === 'flutter') {
      return this.generateFlutterStructure(config);
    }
    return {};
  }

  generateReactNativeStructure(config) {
    return {
      'App.jsx': { template: 'reactNativeApp', data: config },
      src: {
        components: config.components.reduce((acc, comp) => {
          acc[`${comp}.jsx`] = { template: 'reactNativeComponent', data: { ...config, componentName: comp } };
          return acc;
        }, {}),
        screens: {
          'HomeScreen.jsx': { template: 'reactNativeScreen', data: { ...config, screenName: 'Home' } }
        }
      }
    };
  }

  generateFlutterStructure(config) {
    return {
      'lib': {
        'main.dart': { template: 'flutterApp', data: config },
        'widgets': config.components.reduce((acc, comp) => {
          acc[`${comp.toLowerCase()}_widget.dart`] = { template: 'flutterWidget', data: { ...config, widgetName: comp } };
          return acc;
        }, {})
      }
    };
  }

  generateReactNativeComponent(data) {
    return `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ${data.componentName} = ({ ...props }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>${data.componentName} Component</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ${data.componentName};`;
  }

  generateReactNativeScreen(data) {
    return `import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

const ${data.screenName}Screen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>${data.screenName} Screen</Text>
        <Text style={styles.subtitle}>Welcome to ${data.projectName}</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});

export default ${data.screenName}Screen;`;
  }

  generateReactNativeApp(data) {
    return `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;`;
  }

  generateFlutterWidget(data) {
    return `import 'package:flutter/material.dart';

class ${data.widgetName}Widget extends StatelessWidget {
  const ${data.widgetName}Widget({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      child: Text(
        '${data.widgetName} Widget',
        style: Theme.of(context).textTheme.headline6,
      ),
    );
  }
}`;
  }

  generateFlutterApp(data) {
    return `import 'package:flutter/material.dart';

void main() {
  runApp(const ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}App());
}

class ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}App extends StatelessWidget {
  const ${data.projectName.replace(/[^a-zA-Z0-9]/g, '')}App({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${data.projectName}',
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('${data.projectName}'),
      ),
      body: const Center(
        child: Text(
          'Welcome to ${data.projectName}!',
          style: TextStyle(fontSize: 24),
        ),
      ),
    );
  }
}`;
  }
}

module.exports = { MobileGenerator };