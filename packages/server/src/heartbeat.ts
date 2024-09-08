export interface HeartbeatOptions {
  sendPing: () => void
  onTimeout: () => void
}

export class Heartbeat {
  private readonly _sendPing: () => void
  private readonly _onTimeout: () => void
  private _seenPacket: boolean
  private _heartbeatIntervalHandle: NodeJS.Timeout | null
  private _heartbeatTimeoutHandle: NodeJS.Timeout | null

  static HEARTBEAT_INTERVAL = 10000

  constructor(options: HeartbeatOptions) {
    this._sendPing = options.sendPing
    this._onTimeout = options.onTimeout
    this._seenPacket = false

    this._heartbeatIntervalHandle = null
    this._heartbeatTimeoutHandle = null
  }

  stop() {
    this._clearHeartbeatIntervalTimer()
    this._clearHeartbeatTimeoutTimer()
  }

  start() {
    this.stop()
    this._startHeartbeatIntervalTimer()
  }

  private _startHeartbeatIntervalTimer() {
    this._heartbeatIntervalHandle = setInterval(
      () => this._heartbeatIntervalFired(),
      Heartbeat.HEARTBEAT_INTERVAL,
    )
  }

  private _startHeartbeatTimeoutTimer() {
    this._heartbeatTimeoutHandle = setTimeout(
      () => this._heartbeatTimeoutFired(),
      Heartbeat.HEARTBEAT_INTERVAL,
    )
  }

  private _clearHeartbeatIntervalTimer() {
    if (this._heartbeatIntervalHandle) {
      clearInterval(this._heartbeatIntervalHandle)
      this._heartbeatIntervalHandle = null
    }
  }

  private _clearHeartbeatTimeoutTimer() {
    if (this._heartbeatTimeoutHandle) {
      clearTimeout(this._heartbeatTimeoutHandle)
      this._heartbeatTimeoutHandle = null
    }
  }

  private _heartbeatIntervalFired() {
    if (!this._seenPacket && !this._heartbeatTimeoutHandle) {
      this._sendPing()
      this._startHeartbeatTimeoutTimer()
    }
    this._seenPacket = false
  }

  private _heartbeatTimeoutFired() {
    this._heartbeatTimeoutHandle = null
    this._onTimeout()
  }

  messageReceived() {
    this._seenPacket = true
    if (this._heartbeatTimeoutHandle) {
      this._clearHeartbeatTimeoutTimer()
    }
  }
}
