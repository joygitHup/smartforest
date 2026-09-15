import { apiUrl } from './config';
import { authFetch } from '@/lib/auth';

export interface PipelineHealth {
  kafka: {
    ok: boolean;
    bootstrap_servers: string[];
    use_kafka_pipeline: boolean;
    consumer_group: string;
    topics: string[];
    existing_topics: string[];
    missing_topics?: string[];
    error?: string | null;
  };
  pipeline: {
    enabled: boolean;
    path: string;
  };
}

/** GET /api/pipeline/health/ */
export async function getPipelineHealth(): Promise<PipelineHealth> {
  const response = await authFetch(apiUrl('/api/pipeline/health/'));
  if (!response.ok) {
    throw new Error('获取管线健康状态失败');
  }
  return response.json() as Promise<PipelineHealth>;
}
