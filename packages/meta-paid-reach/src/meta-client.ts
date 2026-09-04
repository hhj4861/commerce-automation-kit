import { createHmac } from 'node:crypto';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import type { MetaCreativeSource, MetaPaidReachConfig } from '@cak/contracts';
import { adParams, adSetParams, campaignParams, creativeParams } from './plan.js';

type FetchLike = typeof fetch;

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    fbtrace_id?: string;
  };
}

export class MetaApiError extends Error {
  readonly status: number;
  readonly code: number | undefined;
  readonly subcode: number | undefined;
  readonly transient: boolean;
  readonly traceId: string | undefined;

  constructor(status: number, body: MetaErrorBody, fallback: string) {
    const error = body.error;
    super(error?.message ?? fallback);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = error?.code;
    this.subcode = error?.error_subcode;
    this.transient =
      error?.is_transient === true || status === 429 || (status >= 500 && status < 600);
    this.traceId = error?.fbtrace_id;
  }
}

export interface MetaClientOptions {
  accessToken: string;
  adAccountId: string;
  apiVersion: string;
  appSecret?: string;
  fetchImpl?: FetchLike;
}

export interface MetaAdStatus {
  id: string;
  name?: string;
  status: string;
  effective_status: string;
  issues_info?: unknown;
  ad_review_feedback?: unknown;
}

export interface MetaAdSetSafety {
  id: string;
  status: string;
  effective_status: string;
  lifetime_budget?: string;
  end_time?: string;
}

export interface MetaInsightsRow {
  ad_id?: string;
  impressions?: string;
  spend?: string;
  account_currency?: string;
  date_start?: string;
  date_stop?: string;
}

export interface MetaVideoStatus {
  id: string;
  status?: {
    video_status?: string;
    processing_progress?: number;
    processing_phase?: { status?: string; errors?: unknown };
  };
}

export interface MetaPreflight {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
  disable_reason?: number;
  spend_cap?: string;
  promote_pages?: unknown;
  instagram_accounts?: unknown;
}

function formValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseJson(text: string): unknown {
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function requireId(value: unknown, label: string): string {
  const id = (value as { id?: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${label} 응답에 id가 없음`);
  }
  return id;
}

export class MetaClient {
  private readonly accessToken: string;
  private readonly adAccountId: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: FetchLike;
  private readonly appSecretProof?: string;

  constructor(options: MetaClientOptions) {
    this.accessToken = options.accessToken;
    this.adAccountId = options.adAccountId;
    this.apiVersion = options.apiVersion;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (options.appSecret !== undefined && options.appSecret.length > 0) {
      this.appSecretProof = createHmac('sha256', options.appSecret)
        .update(options.accessToken)
        .digest('hex');
    }
  }

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.apiVersion}`;
  }

  private get accountNode(): string {
    return `act_${this.adAccountId}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, unknown> = {},
    multipart?: FormData,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, '')}`);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    let body: URLSearchParams | FormData | undefined;

    if (method === 'GET') {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, formValue(value));
      }
      if (this.appSecretProof !== undefined) {
        url.searchParams.set('appsecret_proof', this.appSecretProof);
      }
    } else if (multipart !== undefined) {
      for (const [key, value] of Object.entries(params)) multipart.set(key, formValue(value));
      if (this.appSecretProof !== undefined) multipart.set('appsecret_proof', this.appSecretProof);
      body = multipart;
    } else {
      const encoded = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) encoded.set(key, formValue(value));
      if (this.appSecretProof !== undefined) encoded.set('appsecret_proof', this.appSecretProof);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encoded;
    }

    const init: RequestInit =
      body === undefined ? { method, headers } : { method, headers, body };
    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    const parsed = parseJson(text);
    const errorBody = parsed as MetaErrorBody;
    if (!response.ok || errorBody.error !== undefined) {
      throw new MetaApiError(response.status, errorBody, `Meta API HTTP ${response.status}`);
    }
    return parsed as T;
  }

  async preflight(): Promise<MetaPreflight> {
    return this.request<MetaPreflight>('GET', this.accountNode, {
      fields:
        'id,name,currency,timezone_name,account_status,disable_reason,spend_cap,promote_pages,instagram_accounts{id,username}',
    });
  }

  async createCampaign(config: MetaPaidReachConfig): Promise<string> {
    const result = await this.request<unknown>('POST', `${this.accountNode}/campaigns`, campaignParams(config));
    return requireId(result, 'campaign');
  }

  async createAdSet(config: MetaPaidReachConfig, campaignId: string): Promise<string> {
    const result = await this.request<unknown>(
      'POST',
      `${this.accountNode}/adsets`,
      adSetParams(config, campaignId),
    );
    return requireId(result, 'ad set');
  }

  async uploadVideo(source: MetaCreativeSource, name: string): Promise<string> {
    if (source.kind === 'meta-video-id') return source.value;
    if (source.kind === 'hosted-url') {
      const result = await this.request<unknown>('POST', `${this.accountNode}/advideos`, {
        file_url: source.value,
        title: name,
      });
      return requireId(result, 'ad video');
    }

    const bytes = readFileSync(source.value);
    const form = new FormData();
    form.set('source', new Blob([new Uint8Array(bytes)]), basename(source.value));
    form.set('title', name);
    const result = await this.request<unknown>('POST', `${this.accountNode}/advideos`, {}, form);
    return requireId(result, 'ad video');
  }

  async createCreative(config: MetaPaidReachConfig, videoId: string): Promise<string> {
    const result = await this.request<unknown>(
      'POST',
      `${this.accountNode}/adcreatives`,
      creativeParams(config, videoId),
    );
    return requireId(result, 'ad creative');
  }

  async getVideoStatus(videoId: string): Promise<MetaVideoStatus> {
    return this.request<MetaVideoStatus>('GET', videoId, { fields: 'id,status' });
  }

  async createAd(config: MetaPaidReachConfig, adSetId: string, creativeId: string): Promise<string> {
    const result = await this.request<unknown>(
      'POST',
      `${this.accountNode}/ads`,
      adParams(config, adSetId, creativeId),
    );
    return requireId(result, 'ad');
  }

  async getAdStatus(adId: string): Promise<MetaAdStatus> {
    return this.request<MetaAdStatus>('GET', adId, {
      fields: 'id,name,status,effective_status,issues_info,ad_review_feedback',
    });
  }

  async getAdSetSafety(adSetId: string): Promise<MetaAdSetSafety> {
    return this.request<MetaAdSetSafety>('GET', adSetId, {
      fields: 'id,status,effective_status,lifetime_budget,end_time',
    });
  }

  async getAdInsights(adId: string): Promise<MetaInsightsRow | undefined> {
    const result = await this.request<{ data?: MetaInsightsRow[] }>('GET', `${adId}/insights`, {
      fields: 'ad_id,impressions,spend,account_currency,date_start,date_stop',
      date_preset: 'maximum',
    });
    return result.data?.[0];
  }

  async setStatus(objectId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    await this.request<unknown>('POST', objectId, { status });
  }
}
