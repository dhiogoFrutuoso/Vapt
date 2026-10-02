import { env } from '../config/env.js';
import { AppProject } from '../models/AppProject.js';
import { generateEmployeeCode } from '../utils/codes.js';
import { legacyPermissions, planAccess } from '../utils/planAccess.js';

/**
 * Busca e emissao de codigos de funcionario.
 *
 * O codigo e digitado sozinho, sem o funcionario dizer de qual restaurante
 * ele e — entao a busca atravessa todos os apps. Isso obriga o codigo a ser
 * unico GLOBALMENTE, nao apenas dentro de um restaurante: dois funcionarios
 * de lojas diferentes com o mesmo codigo fariam a busca devolver o errado, e
 * alguem entraria no restaurante de outra pessoa.
 *
 * A versao anterior sorteava o codigo sem conferir colisao. Com 32^6 (~1,07
 * bilhao) o encontro e improvavel, mas "improvavel" nao e "impossivel", e a
 * falha seria silenciosa e grave.
 */

export type EmployeeMatch = {
  appId: string;
  appName: string;
  employeeId: string;
  employeeName: string;
  roleName: string;
  permissions: string[];
  isDeliveryman: boolean;
  blocked: boolean;
  onboardingCompleted: boolean;
  profile: {
    phone: string;
    cpf: string;
    birthDate: Date | null;
    photoUrl: string | null;
  };
  branding: {
    storeName: string;
    tagline: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    theme: 'claro' | 'escuro';
    code: string | null;
  };
};

/** Codigo livre em toda a base. Tenta algumas vezes antes de desistir. */
export async function generateUniqueEmployeeCode(): Promise<string> {
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const code = generateEmployeeCode();
    const existe = await AppProject.exists({ 'employees.accessCode': code });
    if (!existe) return code;
  }

  /*
   * Dez colisoes seguidas num espaco de 1 bilhao nao acontece por acaso —
   * indica indice ausente, base corrompida ou bug na geracao. Falhar alto e
   * melhor do que devolver um codigo possivelmente duplicado.
   */
  throw new Error('[codes] Nao foi possivel gerar um codigo de funcionario livre.');
}

/** Localiza o funcionario pelo codigo, com tudo que o app precisa no login. */
export async function findEmployeeByCode(code: string): Promise<EmployeeMatch | null> {
  const normalizado = code.trim().toUpperCase();
  if (normalizado.length !== 6) return null;

  const app = await AppProject.findOne({ 'employees.accessCode': normalizado })
    .select('name brand code roles employees status appPlanType')
    .lean();

  if (!app) return null;

  /*
   * Restaurante pausado nao autentica ninguem. Sem esta checagem, uma conta
   * suspensa por inadimplencia continuaria com a equipe operando pelo app.
   */
  if (app.status === 'pausado') return null;

  const employee = (app.employees ?? []).find(
    (e: { accessCode?: string | null }) => e.accessCode === normalizado
  );
  if (!employee) return null;

  const role = (app.roles ?? []).find(
    (r: { _id?: unknown }) => String(r._id) === String(employee.roleId)
  );

  const brand = (app.brand ?? {}) as {
    logo?: unknown;
    primaryColor?: string;
    secondaryColor?: string;
    theme?: 'claro' | 'escuro';
    tagline?: string;
  };

  const imageUrl = (id: unknown) => (id ? `${env.publicUrl}/api/images/${String(id)}` : null);

  return {
    appId: String(app._id),
    appName: app.name,
    employeeId: String(employee._id),
    employeeName: employee.name,
    roleName: role?.name ?? 'Sem funcao',
    permissions: legacyPermissions(app.appPlanType, (role?.permissions ?? []).map(String)),
    isDeliveryman:
      planAccess(app.appPlanType).delivery && (employee.isDeliveryman === true || (role?.permissions ?? []).map(String).includes('entregador')),
    blocked: employee.blocked === true,
    onboardingCompleted: employee.onboardingCompleted === true,
    profile: {
      phone: employee.phone ?? '',
      cpf: employee.cpf ?? '',
      birthDate: employee.birthDate ?? null,
      photoUrl: imageUrl(employee.photo),
    },
    /*
     * Branding dinamico: e com isto que o app troca de identidade depois do
     * login. Antes de validar o codigo ele mostra a marca Vapt; a partir daqui,
     * a do restaurante.
     */
    branding: {
      storeName: app.name,
      tagline: brand.tagline ?? '',
      logoUrl: imageUrl(brand.logo),
      primaryColor: brand.primaryColor ?? '#FF6B2C',
      secondaryColor: brand.secondaryColor ?? '#111827',
      theme: brand.theme ?? 'claro',
      code: app.code ?? null,
    },
  };
}
