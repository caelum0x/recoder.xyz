/**
 * Kilocode token management utilities
 */

export interface KilocodeToken {
  token: string
  expiresAt: number
  refreshToken?: string
}

export class KilocodeTokenManager {
  private static instance: KilocodeTokenManager
  private token: KilocodeToken | null = null

  static getInstance(): KilocodeTokenManager {
    if (!KilocodeTokenManager.instance) {
      KilocodeTokenManager.instance = new KilocodeTokenManager()
    }
    return KilocodeTokenManager.instance
  }

  setToken(token: KilocodeToken): void {
    this.token = token
  }

  getToken(): KilocodeToken | null {
    return this.token
  }

  isTokenValid(): boolean {
    if (!this.token) return false
    return Date.now() < this.token.expiresAt
  }

  clearToken(): void {
    this.token = null
  }

  getAuthHeader(): string | null {
    if (!this.token || !this.isTokenValid()) {
      return null
    }
    return `Bearer ${this.token.token}`
  }
}

export const kilocodeTokenManager = KilocodeTokenManager.getInstance()

export function getKilocodeAuthHeader(): string | null {
  return kilocodeTokenManager.getAuthHeader()
}