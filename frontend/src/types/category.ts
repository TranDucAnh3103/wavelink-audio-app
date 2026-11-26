export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  count?: number;
}

export interface CreateCategoryPayload {
  name: string;
  slug?: string;
  description?: string;
  color?: string;
}
