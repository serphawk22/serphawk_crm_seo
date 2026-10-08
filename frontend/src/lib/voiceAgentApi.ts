import { API_BASE_URL } from '@/config';
import { ApiError, errorText } from '@/lib/inboxApi';

export { errorText };

// ─── Types (mirror routers/voice_agent.py) ───────────────────────────────────
export type EntityType = 'client' | 'lead' | 'contact';
export type CallMode = 'ai' | 'agent_typed' | 'agent_phone';
export type QuestionStatus = 'answered' | 'open' | 'escalated' | 'resolved';
export type KnowledgeKind = 'faq' | 'objection' | 'product';

export interface VoiceOption { id: string; label: string; gender: string; description: string }
export interface Option { id: string; label: string }
export interface LanguageOption { id: string; label: string; accents: (Option & { locale: string })[] }

export interface VoiceAgentOptions {
  voices: VoiceOption[];
  languages: LanguageOption[];
  accents: Option[];
  styles: Option[];
  default_voice: string;
  twilio: { ready: boolean; missing: string[]; from_number: string | null };
  default_agent_phone: string | null;
}

export interface Entity { id: number; name: string; phone: string | null }

export interface VoicePitch {
  id: number;
  title: string;
  entity_type: EntityType | null;
  entity_id: number | null;
  entity_name: string | null;
  pitch_text: string;
  language: string;
  voice: string;
  accent: string;
  style: string;
  speed: number;
  audio_url: string | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface PitchInput {
  title?: string;
  entity_type?: EntityType | null;
  entity_id?: number | null;
  pitch_text?: string;
  language?: string;
  voice?: string;
  accent?: string;
  style?: string;
  speed?: number;
}

export interface TranscriptTurn {
  role: 'ai' | 'client' | 'agent' | 'system';
  text: string;
  ts: string;
  intent?: string;
  sentiment?: string;
  interrupted?: boolean;
  interrupted_ai?: boolean;
  kind?: string;
}

export interface CallQuestion {
  id: number;
  call_id: number | null;
  entity_type: EntityType | null;
  entity_id: number | null;
  entity_name: string | null;
  question: string;
  category: 'question' | 'doubt' | 'objection' | 'info_request';
  ai_answer: string | null;
  status: QuestionStatus;
  escalation_reason: string | null;
  resolution: string | null;
  assigned_to: number | null;
  follow_up_date: string | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface AICall {
  id: number;
  pitch_id: number | null;
  entity_type: EntityType | null;
  entity_id: number | null;
  entity_name: string | null;
  to_number: string;
  from_number: string | null;
  status: string;
  mode: CallMode;
  language: string;
  voice: string;
  accent: string;
  style: string;
  agent_phone: string | null;
  current_intent: string | null;
  sentiment: string | null;
  interest_score: number | null;
  summary: string | null;
  outcome: string | null;
  next_steps: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  error: string | null;
  turns: number;
  call_log_id: number | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  is_active: boolean;
  stage: string | null;
  doubts: string[];
  objections: string[];
  adaptation: string | null;
  pending_agent_message: string | null;
  transcript?: TranscriptTurn[];
  questions?: CallQuestion[];
}

export interface KnowledgeItem {
  id: number;
  kind: KnowledgeKind;
  title: string;
  answer: string;
  tags: string[];
  is_active: boolean;
  usage_count: number;
  updated_at: string | null;
}

export interface VoiceAgentStats {
  total_calls: number;
  active_calls: number;
  completed_calls: number;
  avg_interest: number | null;
  open_follow_ups: number;
  escalated: number;
  pitches: number;
}

// ─── Built-in voice settings (mirror modules/tts_service.py) ─────────────────
// Used so the Voice/Accent dropdowns are always populated, even before /options loads.
export const TTS_VOICES: VoiceOption[] = [
  { id: 'alloy', label: 'Alloy', gender: 'neutral', description: 'Balanced and versatile' },
  { id: 'echo', label: 'Echo', gender: 'male', description: 'Clear, calm and articulate' },
  { id: 'fable', label: 'Fable', gender: 'neutral', description: 'Expressive, warm storyteller' },
  { id: 'onyx', label: 'Onyx', gender: 'male', description: 'Deep, authoritative and trustworthy' },
  { id: 'nova', label: 'Nova', gender: 'female', description: 'Warm, upbeat and engaging' },
];

export const TTS_ACCENTS: Option[] = [
  { id: 'american', label: 'American' },
  { id: 'british', label: 'British' },
  { id: 'australian', label: 'Australian' },
  { id: 'indian', label: 'Indian' },
  { id: 'canadian', label: 'Canadian' },
  { id: 'irish', label: 'Irish' },
  { id: 'south_african', label: 'South African' },
];

/** Voices/accents from the server when available, otherwise the built-in lists. */
export function voiceChoices(options: VoiceAgentOptions | null) {
  const voices = options?.voices?.length ? options.voices : TTS_VOICES;
  const serverAccents = options?.languages?.find((l) => l.id === 'en')?.accents;
  const accents: Option[] = serverAccents?.length ? serverAccents.map(({ id, label }) => ({ id, label })) : TTS_ACCENTS;
  return { voices, accents };
}

// ─── Transport ───────────────────────────────────────────────────────────────
function errorMessage(data: unknown, status: number): string {
  const detail = (data && typeof data === 'object' ? (data as { detail?: unknown }).detail : undefined);
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const m = (detail as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  if (Array.isArray(detail)) return detail.map((d) => String((d as { msg?: unknown })?.msg ?? '')).filter(Boolean).join('; ');
  return `Request failed (${status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/voice-agent${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(errorMessage(data, res.status), res.status);
  return data as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

/** Backend returns `/static/audio/x.mp3`; make it playable from the frontend origin. */
export const audioSrc = (url: string | null | undefined) => (url ? (url.startsWith('http') ? url : `${API_BASE_URL}${url}`) : '');

export const voiceAgentApi = {
  options: () => request<VoiceAgentOptions>('/options'),
  stats: () => request<VoiceAgentStats>('/stats'),
  entities: (type: EntityType) => request<{ entities: Entity[] }>(`/entities?type=${type}`),

  preview: (body: { text?: string; voice: string; language?: string; accent: string; style: string; speed: number }) =>
    post<{ ok: true; audio_url: string }>('/tts/preview', body),
  generatePitchText: (body: { entity_type?: EntityType | null; entity_id?: number | null; context?: string; language?: string }) =>
    post<{ ok: true; pitch_text: string; entity_name: string | null; phone: string | null }>('/pitches/generate-text', body),
  pitches: () => request<{ pitches: VoicePitch[] }>('/pitches'),
  createPitch: (body: PitchInput) => post<{ ok: true; pitch: VoicePitch }>('/pitches', body),
  updatePitch: (id: number, body: PitchInput) => put<{ ok: true; pitch: VoicePitch }>(`/pitches/${id}`, body),
  regeneratePitch: (id: number) => post<{ ok: true; pitch: VoicePitch }>(`/pitches/${id}/regenerate`),
  deletePitch: (id: number) => del<{ ok: true }>(`/pitches/${id}`),

  /** Write the pitch in the chosen language, voice it, and dial the prospect immediately. */
  quickCall: (body: {
    entity_type: EntityType; entity_id: number; to_number?: string; voice: string; language: string; accent: string;
    style?: string; context?: string; pitch_text?: string; agent_phone?: string;
  }) => post<{ ok: true; pitch: VoicePitch; call: AICall }>('/quick-call', body),
  calls: (status?: string) => request<{ calls: AICall[] }>(`/calls${status ? `?status=${status}` : ''}`),
  call: (id: number) => request<{ call: AICall }>(`/calls/${id}`),
  startCall: (body: { pitch_id: number; to_number?: string; entity_type?: EntityType | null; entity_id?: number | null; agent_phone?: string }) =>
    post<{ ok: true; call: AICall }>('/calls', body),
  takeover: (id: number, mode: 'typed' | 'phone', agent_phone?: string) =>
    post<{ ok: true; call: AICall }>(`/calls/${id}/takeover`, { mode, agent_phone }),
  say: (id: number, text: string) => post<{ ok: true; call: AICall }>(`/calls/${id}/say`, { text }),
  handback: (id: number) => post<{ ok: true; call: AICall }>(`/calls/${id}/handback`),
  hangup: (id: number) => post<{ ok: true }>(`/calls/${id}/hangup`),
  deleteCall: (id: number) => del<{ ok: true }>(`/calls/${id}`),

  questions: (status?: string) => request<{ questions: CallQuestion[] }>(`/questions${status ? `?status=${status}` : ''}`),
  updateQuestion: (id: number, body: Partial<Pick<CallQuestion, 'status' | 'resolution' | 'follow_up_date'>>) =>
    put<{ ok: true; question: CallQuestion }>(`/questions/${id}`, body),
  questionToKnowledge: (id: number, answer: string) =>
    post<{ ok: true; question: CallQuestion }>(`/questions/${id}/to-knowledge`, { answer }),

  knowledge: () => request<{ items: KnowledgeItem[] }>('/knowledge'),
  createKnowledge: (body: Partial<KnowledgeItem>) => post<{ ok: true; item: KnowledgeItem }>('/knowledge', body),
  updateKnowledge: (id: number, body: Partial<KnowledgeItem>) => put<{ ok: true; item: KnowledgeItem }>(`/knowledge/${id}`, body),
  deleteKnowledge: (id: number) => del<{ ok: true }>(`/knowledge/${id}`),
};
