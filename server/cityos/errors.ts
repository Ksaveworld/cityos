export class CityosApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly currentVersion?: number

  constructor(
    status: number,
    code: string,
    message: string,
    options: { retryable?: boolean; currentVersion?: number } = {},
  ) {
    super(message)
    this.name = 'CityosApiError'
    this.status = status
    this.code = code
    this.retryable = options.retryable ?? false
    this.currentVersion = options.currentVersion
  }
}
