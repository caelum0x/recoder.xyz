import fs from 'fs';
import path from 'path';

const configPath = path.join(__dirname, '..', '.recoderrc');

if (!fs.existsSync(configPath)) {
    const defaultConfig = {
        openRouterApiKey: 'dummy-key',
        openRouterModel: 'gpt-3.5-turbo',
        openRouterProxyUrl: 'http://proxy.example.com',
        analyticsOptIn: false,
        encryptionKey: 'dummy-encryption-key',
        iv: 'dummy-iv'
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created default .recoderrc file at ${configPath}`);
}