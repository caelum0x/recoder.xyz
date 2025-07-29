/**
 * Internationalization utilities
 */

export interface I18n {
  t(key: string, params?: Record<string, any>): string
}

// Simple fallback implementation
export const i18n: I18n = {
  t: (key: string, params?: Record<string, any>) => {
    // Simple fallback - just return the key
    let result = key
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(`{{${k}}}`, String(v))
      })
    }
    return result
  }
}

// Export t function directly
export const t = i18n.t

export default i18n