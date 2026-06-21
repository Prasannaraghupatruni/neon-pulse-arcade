import { Point } from '../types/game';

/**
 * 2D Kalman Filter tracking position and velocity
 * State Vector (X): [x, y, vx, vy]
 */
export class KalmanFilter2D {
  // Estimated state
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;

  // Covariance matrix P (initialized to 1)
  private p00 = 1; private p01 = 0; private p02 = 0; private p03 = 0;
  private p10 = 0; private p11 = 1; private p12 = 0; private p13 = 0;
  private p20 = 0; private p21 = 0; private p22 = 1; private p23 = 0;
  private p30 = 0; private p31 = 0; private p32 = 0; private p33 = 1;

  // Process Noise Covariance Q
  private qVar = 0.005; // process variance

  // Measurement Noise Covariance R
  private rVar = 0.05; // measurement variance (sensor noise)

  private initialized = false;

  constructor(processNoise = 0.005, measurementNoise = 0.05) {
    this.qVar = processNoise;
    this.rVar = measurementNoise;
  }

  public setParameters(processNoise: number, measurementNoise: number) {
    this.qVar = processNoise;
    this.rVar = measurementNoise;
  }

  public reset() {
    this.initialized = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.p00 = 1; this.p01 = 0; this.p02 = 0; this.p03 = 0;
    this.p10 = 0; this.p11 = 1; this.p12 = 0; this.p13 = 0;
    this.p20 = 0; this.p21 = 0; this.p22 = 1; this.p23 = 0;
    this.p30 = 0; this.p31 = 0; this.p32 = 0; this.p33 = 1;
  }

  public update(zX: number, zY: number, dt: number): Point {
    if (!this.initialized) {
      this.x = zX;
      this.y = zY;
      this.vx = 0;
      this.vy = 0;
      this.initialized = true;
      return { x: this.x, y: this.y };
    }

    // 1. Predict
    // Transition State: X_pred = F * X
    const x_pred = this.x + this.vx * dt;
    const y_pred = this.y + this.vy * dt;
    const vx_pred = this.vx;
    const vy_pred = this.vy;

    // Transition Covariance: P_pred = F * P * F^T + Q
    // F * P
    const fp00 = this.p00 + dt * this.p20;
    const fp01 = this.p01 + dt * this.p21;
    const fp02 = this.p02 + dt * this.p22;
    const fp03 = this.p03 + dt * this.p23;

    const fp10 = this.p10 + dt * this.p30;
    const fp11 = this.p11 + dt * this.p31;
    const fp12 = this.p12 + dt * this.p32;
    const fp13 = this.p13 + dt * this.p33;

    const fp20 = this.p20;
    const fp21 = this.p21;
    const fp22 = this.p22;
    const fp23 = this.p23;

    const fp30 = this.p30;
    const fp31 = this.p31;
    const fp32 = this.p32;
    const fp33 = this.p33;

    // F * P * F^T + Q
    let p00_p = fp00 + dt * fp02 + this.qVar;
    let p01_p = fp01 + dt * fp03;
    let p02_p = fp02;
    let p03_p = fp03;

    let p10_p = fp10 + dt * fp12;
    let p11_p = fp11 + dt * fp13 + this.qVar;
    let p12_p = fp12;
    let p13_p = fp13;

    let p20_p = fp20 + dt * fp22;
    let p21_p = fp21 + dt * fp23;
    let p22_p = fp22 + this.qVar;
    let p23_p = fp23;

    let p30_p = fp30 + dt * fp32;
    let p31_p = fp31 + dt * fp33;
    let p32_p = fp32;
    let p33_p = fp33 + this.qVar;

    // 2. Measurement Update
    // Residual: y = z - H * X_pred
    const yX = zX - x_pred;
    const yY = zY - y_pred;

    // Residual Covariance: S = H * P_pred * H^T + R
    const s00 = p00_p + this.rVar;
    const s01 = p01_p;
    const s10 = p10_p;
    const s11 = p11_p + this.rVar;

    // Invert residual covariance S (2x2 matrix)
    const det = s00 * s11 - s01 * s10;
    if (Math.abs(det) < 1e-9) return { x: this.x, y: this.y };
    const invDet = 1.0 / det;
    const sInv00 = s11 * invDet;
    const sInv01 = -s01 * invDet;
    const sInv10 = -s10 * invDet;
    const sInv11 = s00 * invDet;

    // Kalman Gain: K = P_pred * H^T * S^-1
    // H is [1 0 0 0; 0 1 0 0], so H^T is [1 0; 0 1; 0 0; 0 0]
    // P_pred * H^T (4x2 matrix)
    const ph00 = p00_p; const ph01 = p01_p;
    const ph10 = p10_p; const ph11 = p11_p;
    const ph20 = p20_p; const ph21 = p21_p;
    const ph30 = p30_p; const ph31 = p31_p;

    // K = PH * S^-1 (4x2 matrix)
    const k00 = ph00 * sInv00 + ph01 * sInv10;
    const k01 = ph00 * sInv01 + ph01 * sInv11;

    const k10 = ph10 * sInv00 + ph11 * sInv10;
    const k11 = ph10 * sInv01 + ph11 * sInv11;

    const k20 = ph20 * sInv00 + ph21 * sInv10;
    const k21 = ph20 * sInv01 + ph21 * sInv11;

    const k30 = ph30 * sInv00 + ph31 * sInv10;
    const k31 = ph30 * sInv01 + ph31 * sInv11;

    // Update state: X = X_pred + K * y
    this.x = x_pred + k00 * yX + k01 * yY;
    this.y = y_pred + k10 * yX + k11 * yY;
    this.vx = vx_pred + k20 * yX + k21 * yY;
    this.vy = vy_pred + k30 * yX + k31 * yY;

    // Update Covariance: P = (I - K * H) * P_pred
    // (I - KH) matrix
    const ikh00 = 1 - k00; const ikh01 = -k01;
    const ikh10 = -k10;     const ikh11 = 1 - k11;
    const ikh20 = -k20;     const ikh21 = -k21;
    const ikh30 = -k30;     const ikh31 = -k31;

    this.p00 = ikh00 * p00_p + ikh01 * p10_p;
    this.p01 = ikh00 * p01_p + ikh01 * p11_p;
    this.p02 = ikh00 * p02_p + ikh01 * p12_p;
    this.p03 = ikh00 * p03_p + ikh01 * p13_p;

    this.p10 = ikh10 * p00_p + ikh11 * p10_p;
    this.p11 = ikh10 * p01_p + ikh11 * p11_p;
    this.p12 = ikh10 * p02_p + ikh11 * p12_p;
    this.p13 = ikh10 * p03_p + ikh11 * p13_p;

    this.p20 = ikh20 * p00_p + ikh21 * p10_p + p20_p;
    this.p21 = ikh20 * p01_p + ikh21 * p11_p + p21_p;
    this.p22 = ikh20 * p02_p + ikh21 * p12_p + p22_p;
    this.p23 = ikh20 * p03_p + ikh21 * p13_p + p23_p;

    this.p30 = ikh30 * p00_p + ikh31 * p10_p + p30_p;
    this.p31 = ikh30 * p01_p + ikh31 * p11_p + p31_p;
    this.p32 = ikh30 * p02_p + ikh31 * p12_p + p32_p;
    this.p33 = ikh30 * p03_p + ikh31 * p13_p + p33_p;

    return { x: this.x, y: this.y };
  }
}

export class HandPositionSmoother {
  private kalman: KalmanFilter2D;
  private lastSmoothed: Point | null = null;

  // Calibration Settings
  private sensitivity = 1.0;
  private deadZone = 0.001; // Dead-zone radius

  // Adaptive smoothing variables
  private doubleAlpha = 0.2;

  constructor() {
    // Process noise default: 0.001, measurement noise: 0.02
    this.kalman = new KalmanFilter2D(0.001, 0.02);
  }

  /**
   * Updates calibrator settings parameters
   * @param sensitivity Float value 0.5 to 2.5
   * @param smoothing Float value 0.0 to 1.0 (higher = heavier smoothing)
   */
  public updateSettings(sensitivity: number, smoothing: number) {
    this.sensitivity = sensitivity;
    
    // High smoothing = high measurement error covariance R
    const rNoise = 0.002 + Math.pow(smoothing, 1.8) * 0.18;
    // Process noise scales inverse to keep responsiveness
    const qNoise = 0.0002 + (1.0 - smoothing) * 0.015;

    this.kalman.setParameters(qNoise, rNoise);
    this.doubleAlpha = 0.05 + (1.0 - smoothing) * 0.45;
  }

  public smooth(input: Point, deltaTime: number): Point {
    // 1. Run Kalman filter update
    const kalmanOutput = this.kalman.update(input.x, input.y, deltaTime);

    if (!this.lastSmoothed) {
      this.lastSmoothed = { ...kalmanOutput };
      return this.lastSmoothed;
    }

    // 2. Dead Zone clamping to suppress tiny shakes when stationary
    const distToLast = Math.hypot(kalmanOutput.x - this.lastSmoothed.x, kalmanOutput.y - this.lastSmoothed.y);
    if (distToLast < this.deadZone) {
      return { ...this.lastSmoothed };
    }

    // 3. Double Exponential Smoothing on top of Kalman for absolute fluid motion
    const alpha = this.doubleAlpha;
    const finalX = alpha * kalmanOutput.x + (1 - alpha) * this.lastSmoothed.x;
    const finalY = alpha * kalmanOutput.y + (1 - alpha) * this.lastSmoothed.y;

    // 4. Sensitivity Amplification around screen center
    const dx = finalX - 0.5;
    const dy = finalY - 0.5;
    const sensitivityX = 0.5 + dx * this.sensitivity;
    const sensitivityY = 0.5 + dy * this.sensitivity;
    
    // Clamp to screen limits
    const clampedOutput = {
      x: Math.max(0.0, Math.min(1.0, sensitivityX)),
      y: Math.max(0.0, Math.min(1.0, sensitivityY))
    };

    this.lastSmoothed = clampedOutput;
    return clampedOutput;
  }

  public reset() {
    this.kalman.reset();
    this.lastSmoothed = null;
  }
}
