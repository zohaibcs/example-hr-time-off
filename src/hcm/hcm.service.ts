import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { HcmSubmitResult, HcmValidateResult } from './hcm.types';

@Injectable()
export class HcmService {
  private readonly log = new Logger(HcmService.name);
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('HCM_BASE_URL', 'http://localhost:0');
    this.client = axios.create({
      baseURL,
      timeout: this.config.get<number>('HCM_TIMEOUT_MS', 10000),
      validateStatus: () => true,
    });
  }

  async fetchBalance(employeeId: string, locationId: string): Promise<number> {
    const path = `/balances/${encodeURIComponent(employeeId)}/${encodeURIComponent(locationId)}`;
    try {
      const res = await this.client.get<{ availableDays: number }>(path);
      if (res.status >= 400 || typeof res.data?.availableDays !== 'number') {
        this.log.warn(`fetchBalance unexpected response ${res.status} for ${path}`);
        throw new Error(`HCM balance fetch failed (${res.status})`);
      }
      return res.data.availableDays;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HCM balance fetch failed')) {
        throw err;
      }
      this.log.warn(`fetchBalance network error for ${path}: ${stringifyError(err)}`);
      throw new Error('HCM unavailable');
    }
  }

  async validateTimeOff(
    employeeId: string,
    locationId: string,
    days: number,
  ): Promise<HcmValidateResult> {
    try {
      const res = await this.client.post<HcmValidateResult>('/time-off/validate', {
        employeeId,
        locationId,
        days,
      });
      if (res.status >= 400) {
        return { ok: false, message: `HCM validate HTTP ${res.status}` };
      }
      return res.data ?? { ok: false, message: 'HCM validate empty body' };
    } catch (err) {
      this.log.warn(`validateTimeOff network error: ${stringifyError(err)}`);
      return { ok: false, message: 'HCM unavailable' };
    }
  }

  async submitTimeOff(
    employeeId: string,
    locationId: string,
    days: number,
    startDate: string,
    endDate: string,
  ): Promise<HcmSubmitResult> {
    let res;
    try {
      res = await this.client.post<HcmSubmitResult>('/time-off/submit', {
        employeeId,
        locationId,
        days,
        startDate,
        endDate,
      });
    } catch (err) {
      this.log.warn(`submitTimeOff network error: ${stringifyError(err)}`);
      throw new Error('HCM unavailable');
    }
    if (res.status >= 400 || !res.data?.submissionId) {
      const msg = res.data && 'message' in res.data ? String((res.data as { message?: string }).message) : '';
      throw new Error(msg || `HCM submit failed (${res.status})`);
    }
    return res.data;
  }
}

function stringifyError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return `${err.code ?? 'AxiosError'} ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
