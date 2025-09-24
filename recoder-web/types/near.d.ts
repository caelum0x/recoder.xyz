declare module '@near-js/client' {
  export interface ClientConfig {
    network?: string;
    keyStore?: any;
    nodeUrl?: string;
    walletUrl?: string;
    helperUrl?: string;
  }
  
  export class Client {
    constructor(config: ClientConfig);
    account(accountId: string): any;
    connection: any;
  }
}

declare module 'near-api-js' {
  export class Near {
    constructor(config: any);
    account(accountId: string): Account;
    connection: any;
  }
  
  export class Account {
    constructor(connection: any, accountId: string);
    deployContract(contractBytes: Uint8Array): Promise<any>;
    functionCall(options: any): Promise<any>;
    getPublicKey(): any;
  }
  
  export class KeyPair {
    static fromRandom(curve: string): KeyPair;
    getPublicKey(): any;
  }
  
  export namespace keyStores {
    export class InMemoryKeyStore {
      constructor();
    }
    export class BrowserLocalStorageKeyStore {
      constructor();
    }
  }
  
  export namespace providers {
    export class JsonRpcProvider {
      constructor(connectionInfo: any);
    }
  }
  
  export namespace utils {
    export namespace key_pair {
      export function randomString(): string;
    }
    export namespace format {
      export function parseNearAmount(amount: string): string;
    }
  }
  
  export function fullAccessKey(): any;
  export function functionCallAccessKey(receiverId: string, methodNames: string[], allowance?: string): any;
}