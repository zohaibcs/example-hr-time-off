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
    const res = await this.client.get<{ availableDays: number }>(path);
    if (res.status >= 400 || typeof res.data?.availableDays !== 'number') {
      this.log.warn(`fetchBalance unexpected response ${res.status} for ${path}`);
      throw new Error(`HCM balance fetch failed (${res.status})`);
    }
    return res.data.availableDays;
  }

  async validateTimeOff(
    employeeId: string,
    locationId: string,
    days: number,
  ): Promise<HcmValidateResult> {
    const res = await this.client.post<HcmValidateResult>('/time-off/validate', {
      employeeId,
      locationId,
      days,
    });
    if (res.status >= 400) {
      return { ok: false, message: `HCM validate HTTP ${res.status}` };
    }
    return res.data ?? { ok: false, message: 'HCM validate empty body' };
  }

  async submitTimeOff(
    employeeId: string,
    locationId: string,
    days: number,
    startDate: string,
    endDate: string,
  ): Promise<HcmSubmitResult> {
    const res = await this.client.post<HcmSubmitResult>('/time-off/submit', {
      employeeId,
      locationId,
      days,
      startDate,
      endDate,
    });
    if (res.status >= 400 || !res.data?.submissionId) {
      const msg = res.data && 'message' in res.data ? String((res.data as { message?: string }).message) : '';
      throw new Error(msg || `HCM submit failed (${res.status})`);
    }
    return res.data;
  }
}
