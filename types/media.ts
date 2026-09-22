import { Database, MediaType } from './database';

export type MediaAsset = Database['public']['Tables']['media_assets']['Row'];
export type MediaAssetInsert = Database['public']['Tables']['media_assets']['Insert'];
export type MediaAssetUpdate = Database['public']['Tables']['media_assets']['Update'];

export type { MediaType };
