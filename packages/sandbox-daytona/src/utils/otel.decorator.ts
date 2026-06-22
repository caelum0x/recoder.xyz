/*
 * Recoder-owned @recoder/sandbox-daytona.
 * Upstream instrumented every method with OpenTelemetry via these decorators.
 * Recoder neutralizes them to no-ops so the owned package carries no
 * @opentelemetry/* dependency — @WithInstrumentation/@WithSpan/@WithMetric call
 * sites stay valid and pass through. Re-wire to @recoder/agent-observability later.
 */

export interface SpanConfig {
  name?: string
  attributes?: Record<string, string>
}

export interface MetricConfig {
  name?: string
  description?: string
  labels?: Record<string, string>
}

export interface InstrumentationConfig {
  name?: string
  description?: string
  labels?: Record<string, string>
  enableTraces?: boolean
  enableMetrics?: boolean
}

function passthrough(): MethodDecorator {
  return (_target, _propertyKey, _descriptor) => {
    /* no-op: preserves the original method */
  }
}

export function WithSpan(_config?: string | SpanConfig): MethodDecorator {
  return passthrough()
}

export function WithMetric(_config?: string | MetricConfig): MethodDecorator {
  return passthrough()
}

export function WithInstrumentation(_config?: string | InstrumentationConfig): MethodDecorator {
  return passthrough()
}
