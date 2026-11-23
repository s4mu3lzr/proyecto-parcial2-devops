'use strict';

const { context, metrics, SpanStatusCode, trace, diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const isTest = process.env.NODE_ENV === 'test';
const serviceName = 'inventario-api-devops';
const defaultEndpoint = 'http://3.22.114.176:5080/api/default';
let sdk;

if (!isTest) {
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { NodeSDK } = require('@opentelemetry/sdk-node');

  const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || defaultEndpoint).replace(/\/+$/, '');
  const auth = process.env.OTEL_EXPORTER_OTLP_AUTH;
  const headers = { 'stream-name': 'default' };
  if (auth) headers.Authorization = `Basic ${auth}`;

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  sdk = new NodeSDK({
    resource: resourceFromAttributes({ 'service.name': serviceName }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
          headers
        }),
        exportIntervalMillis: 10000
      })
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${endpoint}/v1/logs`,
          headers
        })
      })
    ],
    instrumentations: [getNodeAutoInstrumentations()]
  });

  sdk.start();
  console.info(`[otel] OpenTelemetry iniciado: service.name=${serviceName}, endpoint=${endpoint}`);
  if (!auth) {
    console.warn('[otel] OTEL_EXPORTER_OTLP_AUTH no está configurado; los exportadores se iniciaron sin Basic Auth.');
  }
}

const meter = metrics.getMeter(serviceName);
const requestCounter = meter.createCounter('http_server_requests_total', {
  description: 'Total de peticiones HTTP por endpoint, método y código de estado.'
});
const errorCounter = meter.createCounter('http_server_errors_total', {
  description: 'Total de peticiones HTTP que respondieron con error.'
});
const requestDuration = meter.createHistogram('http_server_duration_ms', {
  description: 'Latencia de las peticiones HTTP en milisegundos.',
  unit: 'ms'
});
const logger = logs.getLogger(serviceName);

function emitLog(severityNumber, severityText, body, attributes) {
  logger.emit({
    timestamp: Date.now(),
    severityNumber,
    severityText,
    body,
    attributes,
    context: context.active()
  });
}

function recordHttpRequest({ endpoint, method, statusCode, responseTimeMs, timestamp }) {
  const attributes = { endpoint, method, statusCode };
  requestCounter.add(1, attributes);
  if (statusCode >= 400) errorCounter.add(1, attributes);
  requestDuration.record(responseTimeMs, attributes);

  const severityNumber = statusCode >= 500
    ? SeverityNumber.ERROR
    : statusCode >= 400
      ? SeverityNumber.WARN
      : SeverityNumber.INFO;
  const severityText = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
  const record = { endpoint, method, statusCode, responseTimeMs, timestamp };
  emitLog(severityNumber, severityText, JSON.stringify(record), record);
}

function recordException(error, { endpoint, method, statusCode }) {
  const exception = error instanceof Error ? error : new Error(String(error));
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(exception);
    span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
  }

  const attributes = {
    endpoint,
    method,
    statusCode,
    'exception.type': exception.name,
    'exception.message': exception.message
  };
  if (exception.stack) attributes['exception.stacktrace'] = exception.stack;
  emitLog(SeverityNumber.ERROR, 'ERROR', exception.message, attributes);
}

async function shutdownTelemetry() {
  if (sdk) await sdk.shutdown();
}

module.exports = {
  recordException,
  recordHttpRequest,
  shutdownTelemetry
};
