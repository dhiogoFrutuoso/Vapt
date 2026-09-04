/** Cliente HTTP da aplicação. Simples de propósito: fetch + tipos. */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

/**
 * URL absoluta (ou relativa a este host) de um endpoint da API.
 *
 * Existe para os fluxos que NAO passam por fetch: o login com Google e uma
 * navegacao de pagina inteira (`window.location.href`), porque o cookie de
 * sessao precisa ser gravado pelo proprio navegador ao voltar do Google.
 */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getImageUrl(id: string | null | undefined): string | null {
  if (!id) return null;
  return `${BASE_URL}/images/${id}`;
}

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
  details?: Array<{ field: string; message: string }>;
};

export class ApiError extends Error {
  details?: Array<{ field: string; message: string }>;
  status: number;

  constructor(message: string, status: number, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.status = status;
    this.details = details;
  }

  /** Mapa campo -> mensagem, pronto para pintar o formulário. */
  fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const detail of this.details ?? []) map[detail.field] = detail.message;
    return map;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      // O cookie de sessão precisa viajar em toda chamada.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError('Não conseguimos falar com o servidor. Verifique sua conexão.', 0);
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    if (response.status === 401) {
      // Dispara um evento global para que o AuthContext limpe a sessão
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vaptapp:unauthorized'));
      }
    }
    throw new ApiError(payload?.error ?? 'Algo deu errado. Tente novamente.', response.status, payload?.details);
  }

  return payload.data as T;
}

/* ----------------------------- Tipos ----------------------------- */

export type Plan = {
  slug: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  badge: string | null;
  highlighted: boolean;
  ctaLabel: string;
  features: string[];
  notIncluded: string[];
  comparison: string | null;
  order: number;
};

export type Address = {
  zip?: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  reference?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  phone: string;
  role: 'owner' | 'admin';
  isAdmin?: boolean;
  status: string;
  photoUrl: string | null;
  address: Address | null;
  plan?: string | null;
  planStartDate?: string | null;
  planEndDate?: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  /** 'local' | 'google' | 'both' — como esta conta consegue entrar. */
  authProvider?: 'local' | 'google' | 'both';
  /** Foto vinda do Google. `photoUrl` (avatar proprio) tem precedencia. */
  avatarUrl?: string | null;
  /** Derivado na API. Decide se o card de troca de senha aparece. */
  hasPassword?: boolean;
  onboardingCompleted?: boolean;
};

export type RegisterInput = {
  email: string;
  password: string;
  username: string;
  displayName?: string;
  phone?: string;
  address: Address;
  /** data:URL da foto. O servidor converte para WEBP. */
  photo: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
};

export type DemoProductInput = {
  name: string;
  description?: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
};

export type DemoTableInput = {
  label: string;
  seats: number;
  area?: string;
};

export type DemoStoreInput = {
  restaurantName: string;
  businessType?: string;
  tagline?: string;
  logoUrl?: string | null;
  brandColor?: string;
  accentColor?: string;
  theme?: 'claro' | 'escuro';
  ownerEmail?: string;
  products?: DemoProductInput[];
  tables?: DemoTableInput[];
};

export type DemoStoreResult = {
  code: string;
  slug: string;
  previewUrl: string;
  expiresAt: string;
};

export type CompanyInfo = {
  name: string;
  cnpj: string;
  city: string;
  email: string;
  whatsapp: string;
  whatsappUrl: string;
  hours: string;
};

export type LeadInput = {
  name?: string;
  email?: string;
  whatsapp?: string;
  restaurantName?: string;
  city?: string;
  interestedPlan?: string;
  source?: string;
  demoStoreCode?: string;
  notes?: string;
};

export type SupportInput = {
  name: string;
  whatsapp: string;
  restaurantName?: string;
  topic?: string;
  message?: string;
  bestTime?: string;
};

/* ----------------------------- Rotas ----------------------------- */

export type AppSummary = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  businessType: string;
  status: string;
  selectedPlan: string | null;
  appPlanType: string;
  primaryColor: string;
  logoUrl: string | null;
  productCount: number;
  tableCount: number;
  updatedAt: string;
  createdAt: string;
};

export type Product = {
  _id: string;
  name: string;
  description: string;
  price: number;
  pricingType?: 'unit' | 'weight';
  image: string | null;
  category: string;
  /** Saguão (praça de preparo) que produz o item. */
  station?: string;
  isFeatured?: boolean;
  available: boolean;
  order: number;
};

/** Saguão = praça de preparo da cozinha ("Sushi", "Chapa", "Forno"). */
export type Station = {
  _id: string;
  name: string;
  color?: string;
  order?: number;
};

export type Promotion = {
  _id: string;
  type: 'combo' | 'discount';
  name: string;
  description: string;
  promotionalPrice: number;
  targetProductId: string | null;
  comboItems: string[];
  validUntil: string | null;
  expiresOnRegisterClose: boolean;
  active: boolean;
};

export type Table = {
  _id: string;
  label: string;
  seats: number;
  area: string;
};

export type Category = {
  _id: string;
  name: string;
  image: string | null;
};


export type Role = {
  _id: string;
  name: string;
  permissions: string[];
};

export type Employee = {
  _id: string;
  name: string;
  roleId: string;
  accessCode: string;
};

export type AppProjectFull = {
  _id: string;
  owner: string;
  name: string;
  slug: string;
  code: string | null;
  businessType: string;
  brand: {
    logo: string | null;
    logoBase64?: string;
    cover: string | null;
    primaryColor: string;
    secondaryColor: string;
    theme: 'claro' | 'escuro';
    tagline: string;
  };
  delivery: {
    enabled: boolean;
    fee: number;
    minOrder: number;
    estimatedMinutes: number;
    channel: 'whatsapp' | 'painel' | 'ambos';
    whatsapp: string;
    /** Entregador recebe por entrega (sem salário fixo). */
    courierPaidPerDelivery?: boolean;
  };
  dining?: {
    isWaiterCommissionEnabled?: boolean;
    waiterCommissionPercentage?: number;
  };
  categories: Category[];
  products: Product[];
  promotions: Promotion[];
  tables: Table[];
  stations: Station[];
  roles: Role[];
  employees: Employee[];
  status: string;
  selectedPlan: string | null;
  appPlanType: string;
  planRequestedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const api = {
  /* Público */
  getPlans: () => request<Plan[]>('/plans'),
  getCompany: () => request<CompanyInfo>('/company'),

  /* Landing */
  createLead: (input: LeadInput) =>
    request<{ id: string }>('/leads', { method: 'POST', body: JSON.stringify(input) }),
  createDemoStore: (input: DemoStoreInput) =>
    request<DemoStoreResult>('/demo/stores', { method: 'POST', body: JSON.stringify(input) }),
  getDemoStore: (code: string) => request<unknown>(`/demo/stores/${encodeURIComponent(code)}`),
  createSupportRequest: (input: SupportInput) =>
    request<{ id: string; whatsappUrl: string }>('/support/requests', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /* Autenticação */
  /* Autenticação */
  register: (input: FormData) =>
    request<{ user: AuthUser; token?: string }>('/auth/register', {
      method: 'POST',
      body: input,
      // Não setar Content-Type para FormData, o navegador cuida do boundary automaticamente
      headers: {},
    }),
  login: (input: LoginInput) =>
    request<{ user: AuthUser; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => request<null>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  checkUsername: (value: string) =>
    request<{ available: boolean; reason: string | null }>(
      `/auth/check-username?value=${encodeURIComponent(value)}`
    ),
  updateMe: (input: Partial<AuthUser>) => request<{ user: AuthUser }>('/auth/me', { method: 'PATCH', body: JSON.stringify(input) }),

  updatePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<null>('/auth/password', { method: 'PATCH', body: JSON.stringify(input) }),

  /* Apps */
  getApps: (targetUserId?: string) => {
    const query = targetUserId ? `?targetUserId=${encodeURIComponent(targetUserId)}` : '';
    return request<AppSummary[]>(`/apps${query}`);
  },
  getApp: (id: string) => request<AppProjectFull>(`/apps/${id}`),
  createApp: (input: { name: string; businessType: string; appPlanType: string; targetUserId?: string }) => 
    request<AppSummary>('/apps', { method: 'POST', body: JSON.stringify(input) }),
  deleteApp: (id: string) => 
    request<{ deleted: true }>(`/apps/${id}`, { method: 'DELETE' }),
  updateApp: (id: string, updates: Partial<AppProjectFull>) => 
    request<AppProjectFull>(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),

  addCategory: (id: string, input: { name: string; imageBase64?: string }) =>
    request<Category>(`/apps/${id}/categories`, { method: 'POST', body: JSON.stringify(input) }),
  updateCategory: (id: string, categoryId: string, input: { name?: string; imageBase64?: string | null }) =>
    request<Category>(`/apps/${id}/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  removeCategory: (id: string, categoryId: string) =>
    request<null>(`/apps/${id}/categories/${categoryId}`, { method: 'DELETE' }),

  addProduct: (id: string, input: { name: string; description?: string; price: number; pricingType?: 'unit' | 'weight'; category?: string; station?: string; isFeatured?: boolean; imageBase64?: string }) =>
    request<Product>(`/apps/${id}/products`, { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (id: string, productId: string, input: { name?: string; description?: string; price?: number; pricingType?: 'unit' | 'weight'; category?: string; station?: string; isFeatured?: boolean; imageBase64?: string | null }) =>
    request<Product>(`/apps/${id}/products/${productId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  removeProduct: (id: string, productId: string) =>
    request<null>(`/apps/${id}/products/${productId}`, { method: 'DELETE' }),
  
  addStation: (id: string, input: { name: string; color?: string; order?: number }) =>
    request<Station>(`/apps/${id}/stations`, { method: 'POST', body: JSON.stringify(input) }),
  updateStation: (id: string, stationId: string, input: { name?: string; color?: string; order?: number }) =>
    request<Station>(`/apps/${id}/stations/${stationId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  removeStation: (id: string, stationId: string) =>
    request<null>(`/apps/${id}/stations/${stationId}`, { method: 'DELETE' }),

  addTable: (id: string, input: { label: string; seats: number; area?: string }) =>
    request<Table>(`/apps/${id}/tables`, { method: 'POST', body: JSON.stringify(input) }),
  updateTable: (id: string, tableId: string, input: { label?: string; seats?: number; area?: string }) =>
    request<Table>(`/apps/${id}/tables/${tableId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  removeTable: (id: string, tableId: string) =>
    request<null>(`/apps/${id}/tables/${tableId}`, { method: 'DELETE' }),
    
  requestPlan: (id: string, planName: string) => 
    request<{ whatsappUrl: string }>(`/apps/${id}/plan`, { method: 'POST', body: JSON.stringify({ planName }) }),

  addRole: (appId: string, role: { name: string; permissions: string[] }) =>
    request<Role>(`/apps/${appId}/roles`, { method: 'POST', body: JSON.stringify(role) }),
  updateRole: (appId: string, roleId: string, updates: { name?: string; permissions?: string[] }) =>
    request<Role>(`/apps/${appId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  removeRole: (appId: string, roleId: string) =>
    request<{ deleted: true }>(`/apps/${appId}/roles/${roleId}`, { method: 'DELETE' }),

  addEmployee: (appId: string, emp: { name: string; roleId: string }) =>
    request<Employee>(`/apps/${appId}/employees`, { method: 'POST', body: JSON.stringify(emp) }),
  updateEmployee: (appId: string, empId: string, updates: { name?: string; roleId?: string }) =>
    request<Employee>(`/apps/${appId}/employees/${empId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  removeEmployee: (appId: string, empId: string) =>
    request<{ deleted: true }>(`/apps/${appId}/employees/${empId}`, { method: 'DELETE' }),

  addPromotion: (appId: string, promo: Partial<Promotion>) =>
    request<Promotion>(`/apps/${appId}/promotions`, { method: 'POST', body: JSON.stringify(promo) }),
  updatePromotion: (appId: string, promoId: string, updates: Partial<Promotion>) =>
    request<Promotion>(`/apps/${appId}/promotions/${promoId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  removePromotion: (appId: string, promoId: string) =>
    request<{ deleted: true }>(`/apps/${appId}/promotions/${promoId}`, { method: 'DELETE' }),
    
  closeCashRegister: (appId: string) =>
    request<{ deactivatedPromotions: number }>(`/apps/${appId}/cash/close`, { method: 'POST' }),

  getAdminUsers: (page: number, limit: number, search: string, isSubscribed: string, plan: string) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.append('search', search);
    if (isSubscribed) params.append('isSubscribed', isSubscribed);
    if (plan) params.append('plan', plan);

    return request<{ users: AuthUser[], totalPages: number, currentPage: number, totalUsers: number }>(`/admin/users?${params.toString()}`);
  },

  updateUserPlan: (id: string, plan: string, planStartDate: string, planEndDate: string) =>
    request<{ user: AuthUser }>(`/admin/users/${id}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan, planStartDate, planEndDate }),
    }),

  impersonateUser: (id: string) =>
    request<{ token: string, adminToken: string, user: AuthUser }>(`/admin/impersonate/${id}`, { method: 'POST' }),
};
