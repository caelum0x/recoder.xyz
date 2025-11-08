declare module 'openai' {
  export * from 'openai/api';
}

declare module 'openai/api' {
  export interface Configuration {
    apiKey: string;
    organization?: string;
  }

  export class OpenAIApi {
    constructor(configuration: Configuration);
    // Add other methods and properties as needed
  }
}