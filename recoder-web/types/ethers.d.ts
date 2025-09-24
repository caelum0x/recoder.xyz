declare module 'ethers' {
  export namespace ethers {
    export class Contract {
      constructor(address: string, abi: any[], provider: any);
      [key: string]: any;
    }
    
    export namespace providers {
      export class JsonRpcProvider {
        constructor(url: string);
      }
      export class Web3Provider {
        constructor(provider: any);
      }
    }
    
    export namespace utils {
      export function parseEther(value: string): any;
      export function formatEther(value: any): string;
      export function parseUnits(value: string, unit?: string | number): any;
      export function formatUnits(value: any, unit?: string | number): string;
      export function isAddress(addr: string): boolean;
    }
    
    export class Wallet {
      constructor(privateKey: string, provider?: any);
      address: string;
      connect(provider: any): Wallet;
    }
  }
  
  export = ethers;
}