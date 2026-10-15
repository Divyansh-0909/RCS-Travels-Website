export class ResponsibilityLifecycleError extends Error {
  constructor(code, message, status = 409) {
    super(message)
    this.name = 'ResponsibilityLifecycleError'
    this.code = code
    this.status = status
  }
}

export const lifecycleError = (code, message, status) =>
  new ResponsibilityLifecycleError(code, message, status)
