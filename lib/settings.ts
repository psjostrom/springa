import { Redis } from "@upstash/redis";

let _redis: Redis;
function redis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

export interface UserSettings {
  intervalsApiKey?: string;
  googleAiApiKey?: string;
}

function key(email: string) {
  return `user:${email}`;
}

export async function getUserSettings(email: string): Promise<UserSettings> {
  const data = await redis().get<UserSettings>(key(email));
  return data ?? {};
}

export async function saveUserSettings(
  email: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  const existing = await getUserSettings(email);
  await redis().set(key(email), { ...existing, ...partial });
}
