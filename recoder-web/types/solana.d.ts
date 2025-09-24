declare module '@solana/web3.js' {
  export class Connection {
    constructor(endpoint: string, commitment?: string);
    getBalance(publicKey: PublicKey): Promise<number>;
    getTokenAccountsByOwner(owner: PublicKey, filter: any): Promise<any>;
    sendTransaction(transaction: Transaction, signers: any[]): Promise<string>;
  }
  
  export class PublicKey {
    constructor(value: string | number[] | Uint8Array);
    toString(): string;
    toBase58(): string;
    static isOnCurve(key: string): boolean;
  }
  
  export class Transaction {
    add(instruction: any): this;
    sign(...signers: any[]): void;
    static from(buffer: Buffer): Transaction;
  }
  
  export class Keypair {
    publicKey: PublicKey;
    secretKey: Uint8Array;
    static generate(): Keypair;
    static fromSecretKey(secretKey: Uint8Array): Keypair;
  }
  
  export namespace SystemProgram {
    export function transfer(params: any): any;
    export function createAccount(params: any): any;
  }
  
  export const LAMPORTS_PER_SOL: number;
}