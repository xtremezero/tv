/**
 * Disaster recovery subsystem.
 * Configuration profiles are exported as structured JSON envelopes with a
 * SHA-256 digest computed over the serialized payload via the Web Crypto API.
 * On import, the digest is recalculated and verified before mutating state.
 */

import type { ChannelConfig } from './types';

export interface SecureBackupEnvelope {
  manifestVersion: number;
  timestamp: string;
  sha256Digest: string;
  payload: {
    channels: ChannelConfig[];
    quarantinedIds: string[];
    volume: number;
    muted: boolean;
    crtEnabled: boolean;
    staticSoundEnabled: boolean;
    youTubeApiKey: string;
  };
}

interface RestorableState {
  channels: ChannelConfig[];
  quarantinedIds: string[];
  volume: number;
  muted: boolean;
  crtEnabled: boolean;
  staticSoundEnabled: boolean;
  youTubeApiKey: string;
  restoreState: (data: Partial<RestorableState>) => boolean;
}

export class DisasterRecoveryService {
  private static MANIFEST_VERSION = 1;

  public static async generateBackupBlob(state: {
    channels: ChannelConfig[];
    quarantinedIds: string[];
    volume: number;
    muted: boolean;
    crtEnabled: boolean;
    staticSoundEnabled: boolean;
    youTubeApiKey: string;
  }): Promise<string> {
    const rawPayload = {
      channels: state.channels,
      quarantinedIds: state.quarantinedIds,
      volume: state.volume,
      muted: state.muted,
      crtEnabled: state.crtEnabled,
      staticSoundEnabled: state.staticSoundEnabled,
      youTubeApiKey: state.youTubeApiKey,
    };

    const serializedPayload = JSON.stringify(rawPayload);
    const digest = await this.calculateDigest(serializedPayload);

    const envelope: SecureBackupEnvelope = {
      manifestVersion: this.MANIFEST_VERSION,
      timestamp: new Date().toISOString(),
      sha256Digest: digest,
      payload: rawPayload,
    };

    return JSON.stringify(envelope, null, 2);
  }

  public static async executeRecovery(
    serializedEnvelope: string,
    state: RestorableState
  ): Promise<{ success: boolean; errorReason?: string }> {
    try {
      const envelope = JSON.parse(serializedEnvelope) as SecureBackupEnvelope;

      if (envelope.manifestVersion !== this.MANIFEST_VERSION) {
        return { success: false, errorReason: 'Incompatible backup schema version.' };
      }
      if (!envelope.payload || typeof envelope.payload !== 'object') {
        return { success: false, errorReason: 'Envelope payload is missing.' };
      }

      const recalculatedDigest = await this.calculateDigest(
        JSON.stringify(envelope.payload)
      );

      if (recalculatedDigest !== envelope.sha256Digest) {
        return { success: false, errorReason: 'Integrity check failed: Checksum mismatch.' };
      }

      const operationSuccessful = state.restoreState(envelope.payload);
      return operationSuccessful
        ? { success: true }
        : { success: false, errorReason: 'Failed to hydrate state store with imported records.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, errorReason: `Structural parse failure: ${message}` };
    }
  }

  private static async calculateDigest(data: string): Promise<string> {
    const buffer = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
